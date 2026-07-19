/**
 * SonixMusicDriverParser.ts — Sonix Music Driver Amiga music format native parser
 *
 * "Sonix Music Driver" is a 4-channel Amiga music format by Mark Riley (c) 1987-91.
 * The eagleplayer adapter was written by Wanted Team.
 *
 * Three sub-formats are detected, each with a different file prefix:
 *
 *   smus.*  — IFF SMUS variant with SNX1/INS1/TRAK/NAME chunks
 *             Detected when the first 4 bytes are 'FORM'.
 *             Delegated to IffSmusParser.
 *
 *   tiny.*  — TINY variant (binary, < 400 bytes header + 4 section pointers)
 *             Detected when the low nibble of the first byte is non-zero.
 *             External .instr files required; throws to trigger UADE fallback.
 *
 *   snx.*   — Generic SNX variant (binary, 4 section lengths + speed + event streams)
 *             Detected when the low nibble of the first byte is zero.
 *             Parsed to TrackerSong: tempo, 4-channel note event streams.
 *             Instruments are silent Sampler placeholders (real samples are external).
 *
 * Detection is ported 1:1 from the DTP_Check2 routine in
 * "Sonix Music Driver_v1.asm" (Wanted Team eagleplayer).
 *
 * SNX binary layout (from SonixMusicDriver_v1.asm InitScore + PlaySNX):
 *   Bytes  0–15:  4 × u32BE section lengths (one per voice channel)
 *   Bytes 16–17:  u16BE speed/tempo value (CIA timer divisor)
 *   Bytes 18–19:  u16BE loop/repeat count
 *   Bytes 20+:    4 voice event streams (packed after each other, lengths from above)
 *
 * SNX voice event stream (16-bit words, big-endian):
 *   0xFFFF          end of track (loop back)
 *   0xC000–0xFFFE   rest/delay for (word & 0x3FFF) ticks
 *   0x83nn          volume set to nn (0–127)
 *   0x82nn          tempo change to nn
 *   0x81nn          loop control
 *   0x80nn          instrument change to register nn
 *   0x0000          empty (end-of-row marker or rest, advance one row)
 *   0x0Nnn–0x7Fnn   note on: high byte = note index (1–127), low byte = volume
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { idGenerator } from '@utils/idGenerator';
import { sonixEncoder, sonixTinyEncoder } from '@/engine/uade/encoders/SonixMusicDriverEncoder';

// ── Constants ─────────────────────────────────────────────────────────────

const MIN_FILE_SIZE_SNX  = 21;  // at minimum: 4 longs (16) + 4-byte skip + 1 byte
const MIN_FILE_SIZE_SMUS = 28;  // FORM(4)+size(4)+SMUS(4)+SHDR(4)+?(8)+byte23

// ── Binary helpers ─────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

// ── Sub-format detection helpers ───────────────────────────────────────────

/**
 * SNX sub-format detection.
 *
 * Precondition: first word & 0x00F0 == 0 and first 4 bytes != 'FORM'.
 *
 * Ported from the "else" branch of Check2 (lines 410-440):
 *
 *   A0 = data, A1 = data (saved copy), D4 = fileSize
 *   D3 = 20, D1 = 3
 *   NextPos loop (4 iters):
 *     D2 = u32BE(A0); A0 += 4
 *     if D2 == 0 || D2 < 0 || D2 odd  → fault
 *     D3 += D2
 *   if D3 >= D4  → fault
 *   A0 += 4
 *   SecPass loop (4 iters):
 *     byte at A0 must have bit7 set (bpl fault)
 *     if word at A0 == 0xFFFF  → OK1
 *     else if byte > 0x84      → fault
 *   OK1:
 *     A0 += u32BE(A1); A1 += 4
 *   after loop: byte at A0 must be non-zero
 */
function isSnxFormat(buf: Uint8Array): boolean {
  const fileSize = buf.length;
  if (fileSize < MIN_FILE_SIZE_SNX) return false;

  // Must be < 8 bytes to read 4 longs safely
  if (fileSize < 20) return false;

  let offA0 = 0;
  let offA1 = 0; // saved A1 = original A0
  let d3 = 20;

  // NextPos loop: 4 iterations (D1 = 3 down to 0 inclusive)
  const lengths: number[] = [];
  for (let i = 0; i < 4; i++) {
    if (offA0 + 4 > fileSize) return false;
    const d2 = u32BE(buf, offA0);
    offA0 += 4;
    if (d2 === 0) return false;                         // beq fault
    if ((d2 & 0x80000000) !== 0) return false;          // bmi fault
    if ((d2 & 1) !== 0) return false;                   // btst #0 / bne fault
    d3 += d2;
    lengths.push(d2);
  }

  // cmp.l D4, D3 / bge fault — D3 must be < fileSize
  if (d3 >= fileSize) return false;

  // addq.l #4, A0
  offA0 += 4;

  // SecPass loop: 4 iterations (D1 = 3 down to 0)
  for (let i = 0; i < 4; i++) {
    if (offA0 >= fileSize) return false;

    // tst.b (A0) / bpl fault — bit7 must be set (i.e. byte >= 0x80)
    const b = buf[offA0];
    if ((b & 0x80) === 0) return false;

    // cmp.w #-1, (A0) / beq OK1 — word == 0xFFFF is unconditionally accepted
    if (offA0 + 2 <= fileSize) {
      const w = u16BE(buf, offA0);
      if (w !== 0xFFFF) {
        // cmp.b #$84, (A0) / bhi fault — byte must be <= 0x84
        if (b > 0x84) return false;
      }
    } else {
      // Can't read word: just check the byte
      if (b > 0x84) return false;
    }

    // add.l (A1)+, A0 — advance A0 by lengths[i] (A1 walks the saved original lengths)
    if (offA1 + 4 > fileSize) return false;
    offA0 += lengths[offA1 / 4];
    offA1 += 4;
  }

  // tst.b (A0) / beq fault — must be non-zero
  if (offA0 >= fileSize) return false;
  if (buf[offA0] === 0) return false;

  return true;
}

/**
 * TINY sub-format detection.
 *
 * Precondition: first word & 0x00F0 != 0 (low nibble of high byte is non-zero).
 *
 * Ported from TinyCheck (lines 443-472):
 *
 *   fileSize > 332
 *   u32BE at offset 48 must == 0x140
 *   A1 = data + 52 (= offset 48 + 4)
 *   D1 = 2 (3 iterations)
 *   NextPos2 loop (3 iters):
 *     D2 = u32BE(A1); A1 += 4
 *     D2 != 0, D2 >= 0, D2 even, D2 < fileSize
 *     A2 = data + D2
 *     if word at A2 == 0xFFFF → OK2
 *     else:
 *       u32BE(A2) == 0; u16BE(A2+4) == 0; byte at A2+6 has bit7 set; byte <= 0x82
 */
function isTinyFormat(buf: Uint8Array): boolean {
  const fileSize = buf.length;
  if (fileSize <= 332) return false; // cmp.l #332, D4 / ble fault

  // u32BE at offset 48 must == 0x140
  if (fileSize < 56) return false;
  if (u32BE(buf, 48) !== 0x140) return false;

  // A1 starts at offset 52 (after the 0x140 long)
  let offA1 = 52;

  // NextPos2: 3 iterations (D1 = 2 down to 0)
  for (let i = 0; i < 3; i++) {
    if (offA1 + 4 > fileSize) return false;
    const d2 = u32BE(buf, offA1);
    offA1 += 4;

    if (d2 === 0) return false;                         // beq fault
    if ((d2 & 0x80000000) !== 0) return false;          // bmi fault
    if ((d2 & 1) !== 0) return false;                   // btst #0 / bne fault
    if (d2 >= fileSize) return false;                   // cmp.l D2, D4 / ble fault

    // A2 = data + D2
    const offA2 = d2; // offset from start of buf

    if (offA2 + 2 > fileSize) return false;
    const w = u16BE(buf, offA2);
    if (w === 0xFFFF) {
      // OK2: accepted immediately
      continue;
    }

    // tst.l (A2)+ → u32BE(A2) must be 0; then A2 += 4
    if (offA2 + 7 > fileSize) return false;
    if (u32BE(buf, offA2) !== 0) return false;
    // tst.w (A2)+ → u16BE(A2+4) must be 0; then A2 += 2 → A2 at +6
    if (u16BE(buf, offA2 + 4) !== 0) return false;
    // tst.b (A2) / bpl fault — bit7 must be set
    const b = buf[offA2 + 6];
    if ((b & 0x80) === 0) return false;
    // cmp.b #$82, (A2) / bhi fault — byte must be <= 0x82
    if (b > 0x82) return false;
  }

  return true;
}

/**
 * SMUS sub-format detection.
 *
 * Precondition: first 4 bytes == 'FORM' (0x464F524D).
 *
 * Ported from SmusCheck (lines 475-514):
 *
 *   bytes 8-11 must be 'SMUS'
 *   byte 23 must be non-zero
 *   A1 = data + 24
 *   'NAME' chunk at A1; advance past it (round up chunk size to even)
 *   'SNX1' chunk at A1; advance past it
 *   Loop checking 'INS1' chunks until 'TRAK' appears:
 *     byte at A1+0: sample number, must be <= 63
 *     byte at A1+1: MIDI flag, must be 0
 *     advance by INS1 chunk size
 */
function isSmusFormat(buf: Uint8Array): boolean {
  const fileSize = buf.length;
  if (fileSize < MIN_FILE_SIZE_SMUS) return false;

  // bytes 8-11 must be 'SMUS' (0x534D5553)
  if (u32BE(buf, 8) !== 0x534D5553) return false; // 'SMUS'

  // byte at offset 23 must be non-zero
  if (buf[23] === 0) return false;

  // A1 starts at offset 24
  let off = 24;

  // Expect 'NAME' chunk (0x4E414D45)
  if (off + 8 > fileSize) return false;
  if (u32BE(buf, off) !== 0x4E414D45) return false; // 'NAME'
  off += 4;
  let chunkSize = u32BE(buf, off);
  off += 4;
  if ((chunkSize & 0x80000000) !== 0) return false; // bmi fault
  // addq.l #1, D1; bclr #0, D1 — round up to even
  chunkSize = (chunkSize + 1) & ~1;
  off += chunkSize;

  // Expect 'SNX1' chunk (0x534E5831)
  if (off + 8 > fileSize) return false;
  if (u32BE(buf, off) !== 0x534E5831) return false; // 'SNX1'
  off += 4;
  chunkSize = u32BE(buf, off);
  off += 4;
  if ((chunkSize & 0x80000000) !== 0) return false; // bmi fault
  chunkSize = (chunkSize + 1) & ~1;
  off += chunkSize;

  // Loop: expect 'INS1' chunks until 'TRAK' is found
  while (true) {
    if (off + 4 > fileSize) return false;
    const tag = u32BE(buf, off);

    // cmp.l #'TRAK', (A1) — if TRAK, we're done (valid)
    if (tag === 0x5452414B) { // 'TRAK'
      break;
    }

    // cmp.l #'INS1', (A1)+ / bne fault
    if (tag !== 0x494E5331) return false; // 'INS1'
    off += 4;

    if (off + 4 > fileSize) return false;
    chunkSize = u32BE(buf, off);
    off += 4;
    if ((chunkSize & 0x80000000) !== 0) return false; // bmi fault

    // cmp.b #63, (A1) — sample number at current A1 (= off) must be <= 63
    if (off >= fileSize) return false;
    if (buf[off] > 63) return false;

    // tst.b 1(A1) — MIDI flag at off+1 must be 0
    if (off + 1 >= fileSize) return false;
    if (buf[off + 1] !== 0) return false;

    // Advance by INS1 chunk size (rounded up to even)
    chunkSize = (chunkSize + 1) & ~1;
    off += chunkSize;
  }

  return true;
}

// ── Sub-format enum ────────────────────────────────────────────────────────

export type SonixSubFormat = 'smus' | 'tiny' | 'snx';

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Detects a Sonix Music Driver module and returns the sub-format, or null if not detected.
 *
 * Routing mirrors Check2 in Sonix Music Driver_v1.asm:
 *   if first 4 bytes == 'FORM' → SmusCheck  (prefix: smus.)
 *   else if first word & 0x00F0 != 0 → TinyCheck (prefix: tiny.)
 *   else → SNX check  (prefix: snx.)
 */
export function detectSonixFormat(buffer: ArrayBuffer | Uint8Array): SonixSubFormat | null {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < 4) return null;

  const firstLong = u32BE(buf, 0);

  if (firstLong === 0x464F524D) { // 'FORM'
    return isSmusFormat(buf) ? 'smus' : null;
  }

  const firstWord = u16BE(buf, 0);
  if ((firstWord & 0x00F0) !== 0) {
    return isTinyFormat(buf) ? 'tiny' : null;
  }

  return isSnxFormat(buf) ? 'snx' : null;
}

/**
 * Returns true if the buffer is any Sonix Music Driver variant.
 */
export function isSonixFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  return detectSonixFormat(buffer) !== null;
}

// ── SNX binary parser ──────────────────────────────────────────────────────

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

/**
 * Parse a single SNX voice event stream into TrackerCells.
 *
 * SNX event format (16-bit words, big-endian):
 *   0xFFFF          end of track (stop parsing)
 *   0xC000–0xFFFE   rest for (word & 0x3FFF) ticks
 *   0x83nn          volume set to nn
 *   0x82nn          tempo change to nn (ignored — apply in initialBPM)
 *   0x81nn          loop control (ignored)
 *   0x80nn          instrument change (nn = register 0–63, map to 1-based index)
 *   0x0000          rest for 1 tick
 *   0x0Nnn          note on: high byte = note index (1–127), low byte = volume
 *
 * Note index → XM note: note indices are a direct pitch offset used by the SNX player
 * against the instrument's base frequency. Without instrument data we map index
 * directly: xmNote = clamp(noteIndex, 1, 96).
 */
function parseSnxVoiceStream(
  buf: Uint8Array,
  startOff: number,
  length: number,
): TrackerCell[] {
  const cells: TrackerCell[] = [];
  const endOff = Math.min(startOff + length, buf.length);
  let pos = startOff;
  let currentInstr = 1;
  let currentVol = 0; // 0 = not set (leave empty in cell)

  while (pos + 2 <= endOff) {
    const word = u16BE(buf, pos);
    pos += 2;

    if (word === 0xFFFF) break; // end of track

    if (word >= 0xC000) {
      // Rest/delay for N ticks
      const ticks = Math.max(1, word & 0x3FFF);
      for (let t = 0; t < ticks; t++) cells.push(emptyCell());
      continue;
    }

    if (word >= 0x8000) {
      const cmd = (word >> 8) & 0xFF;
      const param = word & 0xFF;
      switch (cmd) {
        case 0x80:
          // Instrument change: register param maps to 1-based instrument index
          currentInstr = param + 1;
          break;
        case 0x83:
          // Volume set: 0–127 → XM volume column 0x10–0x50
          currentVol = param > 0
            ? 0x10 + Math.min(64, Math.round((param / 127) * 64))
            : 0x10; // explicit mute
          break;
        // 0x81 loop, 0x82 tempo: no visual representation needed
        default:
          break;
      }
      // Commands don't advance pattern rows; continue
      continue;
    }

    if (word === 0x0000) {
      // Rest for one tick
      cells.push(emptyCell());
      continue;
    }

    // Note on: high byte = note index (1–127), low byte = volume
    const noteIndex = (word >> 8) & 0x7F;
    const velByte   = word & 0xFF;

    if (noteIndex === 0) {
      cells.push(emptyCell());
    } else {
      const xmNote = Math.max(1, Math.min(96, noteIndex));
      const xmVol = currentVol !== 0
        ? currentVol
        : velByte > 0
          ? 0x10 + Math.min(64, Math.round((velByte / 127) * 64))
          : 0; // no explicit volume column
      cells.push({
        note: xmNote,
        instrument: currentInstr,
        volume: xmVol,
        effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      });
    }
  }

  return cells;
}

function buildPatterns(
  channelFlat: TrackerCell[][],
  filename: string,
  numChannels: number,
): Pattern[] {
  let totalRows = 0;
  for (const ch of channelFlat) {
    if (ch.length > totalRows) totalRows = ch.length;
  }
  if (totalRows === 0) totalRows = 64;
  for (const ch of channelFlat) {
    while (ch.length < totalRows) ch.push(emptyCell());
  }

  const PATTERN_LENGTH = 64;
  const numPatterns = Math.max(1, Math.ceil(totalRows / PATTERN_LENGTH));
  const patterns: Pattern[] = [];
  const AMIGA_PAN = [-50, 50, 50, -50];

  for (let p = 0; p < numPatterns; p++) {
    const startRow = p * PATTERN_LENGTH;
    const endRow = Math.min(startRow + PATTERN_LENGTH, totalRows);
    const patLen = endRow - startRow;

    const channels: ChannelData[] = channelFlat.map((cells, ch) => ({
      id:         idGenerator.generate('sonix-ch'),
      name:       `Channel ${ch + 1}`,
      muted:      false,
      solo:       false,
      collapsed:  false,
      volume:     100,
      pan:        AMIGA_PAN[ch % 4] ?? 0,
      instrumentId: null,
      color:      null,
      rows:       cells.slice(startRow, endRow),
    }));

    patterns.push({
      id:     idGenerator.generate('sonix-pat'),
      name:   `Pattern ${p + 1}`,
      length: patLen,
      channels,
      importMetadata: {
        sourceFormat:          'Sonix' as const,
        sourceFile:            filename,
        importedAt:            new Date().toISOString(),
        originalChannelCount:  numChannels,
        originalPatternCount:  numPatterns,
        originalInstrumentCount: 0,
      },
    });
  }

  return patterns;
}

/**
 * Parse SNX binary format (snx.* prefix).
 *
 * Layout (from SonixMusicDriver_v1.asm InitScore):
 *   Bytes  0–15:  4 × u32BE section lengths
 *   Bytes 16–17:  u16BE speed/CIA-timer-divisor
 *   Bytes 18–19:  u16BE loop count
 *   Bytes 20+:    4 packed voice event streams
 *
 * Instruments are placeholder Samplers — actual samples live in external files
 * (.instr / .ss) that UADE loads separately.
 */
function parseSnxBinary(buf: Uint8Array, filename: string): TrackerSong {
  const fileSize = buf.length;
  if (fileSize < 22) throw new Error('SNX file too small');

  // Read 4 section lengths
  const sectionLengths = [
    u32BE(buf, 0), u32BE(buf, 4), u32BE(buf, 8), u32BE(buf, 12),
  ];

  // Sanity check
  let totalVoiceBytes = 20;
  for (const len of sectionLengths) totalVoiceBytes += len;
  if (totalVoiceBytes > fileSize) throw new Error('SNX section lengths exceed file size');

  // Speed word (bytes 16–17); used as CIA timer divisor in player
  // We can't reliably convert this to BPM without knowing the CIA clock context,
  // so default to ProTracker 125 BPM / speed 6.
  // Speed word at offset 16 — not mapped to BPM (CIA clock context unknown)

  // Parse 4 voice streams
  const voiceStart = 20;
  let offset = voiceStart;
  const channelFlat: TrackerCell[][] = [];
  for (let ch = 0; ch < 4; ch++) {
    channelFlat.push(parseSnxVoiceStream(buf, offset, sectionLengths[ch]));
    offset += sectionLengths[ch];
  }

  // Build placeholder instruments (1 per used register, up to 16)
  const usedRegisters = new Set<number>();
  for (const cells of channelFlat) {
    for (const cell of cells) {
      if (cell.instrument > 0) usedRegisters.add(cell.instrument);
    }
  }
  const instruments: InstrumentConfig[] = Array.from(
    { length: Math.max(1, usedRegisters.size) },
    (_, i) => ({
      id:         i + 1,
      name:       `Sample ${i + 1}`,
      type:       'synth' as const,
      synthType:  'SonixSynth' as const,
      effects:    [],
      volume:     0,
      pan:        0,
    }) as InstrumentConfig,
  );

  const baseName = (filename.split('/').pop() ?? filename).replace(/^snx\./i, '');
  const patterns = buildPatterns(channelFlat, filename, 4);

  // Build UADEVariablePatternLayout for chip RAM editing.
  // SNX has 4 voice event streams packed sequentially starting at byte 20.
  // Each voice stream is treated as a separate file-level pattern.
  const NUM_CHANNELS = 4;
  const voiceStreamStart = 20;
  const filePatternAddrs: number[] = [];
  const filePatternSizes: number[] = [];
  // Structural raw-block carrier: each voice stream is a single contiguous command
  // stream that buildPatterns splits across many display patterns (shared via
  // trackMap). The whole-stream inverse can't be reconstructed from one display
  // pattern's rows, so stash the original bytes + the full decoded per-channel
  // baseline. encodeVariableBlock emits the raw bytes verbatim when a stream is
  // unedited (byte-exact) and only runs sonixEncoder.encodePattern once edited.
  const blockRawBytes: Uint8Array[] = [];
  const blockRows: TrackerCell[][] = [];
  let streamOffset = voiceStreamStart;
  for (let ch = 0; ch < NUM_CHANNELS; ch++) {
    filePatternAddrs.push(streamOffset);
    filePatternSizes.push(sectionLengths[ch]);
    blockRawBytes.push(buf.subarray(streamOffset, streamOffset + sectionLengths[ch]));
    blockRows.push(channelFlat[ch]);
    streamOffset += sectionLengths[ch];
  }

  // trackMap: each TrackerSong pattern maps its channels to file-level voice streams.
  // Voice stream ch is shared across all TrackerSong patterns for that channel.
  const trackMap: number[][] = patterns.map(() =>
    Array.from({ length: NUM_CHANNELS }, (_, ch) => ch),
  );

  const rowsPerPattern = patterns.map(p => p.length);

  const uadeVariableLayout: UADEVariablePatternLayout = {
    formatId: 'sonixMusicDriver',
    numChannels: NUM_CHANNELS,
    numFilePatterns: NUM_CHANNELS, // one file-level stream per voice
    rowsPerPattern,
    moduleSize: fileSize,
    encoder: sonixEncoder,
    filePatternAddrs,
    filePatternSizes,
    trackMap,
    blockRows,
    blockRawBytes,
  };

  return {
    name:           `${baseName} [SNX]`,
    format:         'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions:  patterns.map((_, i) => i),
    songLength:     patterns.length,
    restartPosition: 0,
    numChannels:    NUM_CHANNELS,
    initialSpeed:   6,
    initialBPM:     125,
    linearPeriods:  false,
    uadeEditableFileData: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadeVariableLayout,
  };
}

// ── TINY binary parser ─────────────────────────────────────────────────────

/**
 * Parse a single TINY voice event stream into TrackerCells.
 *
 * TINY opcodes DIFFER from SNX (verified against SonixMusicDriver_v1 ASM +
 * byte-probe of a real module — 0x80/0x81 are SWAPPED vs SNX and the note
 * low byte is DURATION not volume):
 *
 *   0xFFFF          end of track (stop parsing)
 *   0x0000          skip (zero duration — no-op, used as stream warm-up padding)
 *   0x81nn          instrument change (nn = table index 0–63 → 1-based)
 *   0x80nn          rest for nn ticks
 *   0x00–0x7Fnn     note on: high byte = note index (semitone), low byte = DURATION in ticks
 *
 * Note index is a direct pitch offset used by the TINY synth against the
 * instrument's base frequency; without running the type-1 synth we map it
 * directly (grid pitch = raw index, clamp 1–96), same convention as SNX.
 * One tracker row = one player tick, so a note of duration d occupies its
 * on-row plus (d-1) hold rows (matching how SNX rests expand).
 */
function parseTinyVoiceStream(
  buf: Uint8Array,
  startOff: number,
  length: number,
): TrackerCell[] {
  const cells: TrackerCell[] = [];
  const endOff = Math.min(startOff + length, buf.length);
  let pos = startOff;
  let currentInstr = 1;

  while (pos + 2 <= endOff) {
    const word = u16BE(buf, pos);
    pos += 2;

    if (word === 0xFFFF) break;   // end of track
    if (word === 0x0000) continue; // skip (zero duration)

    const hi = (word >> 8) & 0xFF;
    const lo = word & 0xFF;

    if (hi === 0x81) {
      // Instrument change: table index → 1-based instrument
      currentInstr = lo + 1;
      continue;
    }
    if (hi === 0x80) {
      // Rest for lo ticks
      const ticks = Math.max(1, lo);
      for (let t = 0; t < ticks; t++) cells.push(emptyCell());
      continue;
    }
    if (hi >= 0x82) {
      // Unknown control (detection admits bytes up to 0x82) — ignore, no rows
      continue;
    }

    // Note on: high byte = note index, low byte = duration in ticks
    const noteIndex = hi;
    const dur = Math.max(1, lo);
    if (noteIndex === 0) {
      for (let t = 0; t < dur; t++) cells.push(emptyCell());
    } else {
      const xmNote = Math.max(1, Math.min(96, noteIndex));
      cells.push({
        note: xmNote,
        instrument: currentInstr,
        volume: 0,
        effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      });
      for (let t = 1; t < dur; t++) cells.push(emptyCell()); // hold rows
    }
  }

  return cells;
}

/**
 * Read the fixed 4-byte ASCII instrument-name table at file offset 0x40.
 * Entries are the base names of the external .instr companion files
 * (e.g. "CE01" → CE01.instr).
 *
 * The table runs from 0x40 up to the first voice-stream pointer (`tableEnd`).
 * Slot i maps to instrument i+1 (the stream's 0x81nn opcode sets instrument
 * nn+1). Empty (all-zero) slots are index GAPS, not a terminator — some modules
 * pad unused registers with zeros between named entries (e.g. maintitle:
 * WT15,----,WT20,----,WT13,WT18,...). Reading must NOT stop at the first zero
 * slot (the old bug: only "WT15" survived). Gaps become `Sample N` placeholders;
 * trailing empty slots are trimmed so the table length tracks the last real name.
 */
function readTinyInstrumentNames(buf: Uint8Array, tableEnd: number): string[] {
  const TABLE_OFF = 0x40;
  const ENTRY = 4;
  const end = Math.min(tableEnd, buf.length);
  const names: string[] = [];
  let lastNamed = -1;
  for (let i = 0; TABLE_OFF + i * ENTRY + ENTRY <= end; i++) {
    const off = TABLE_OFF + i * ENTRY;
    let name = '';
    for (let b = 0; b < ENTRY; b++) {
      const c = buf[off + b];
      if (c >= 0x20 && c < 0x7F) name += String.fromCharCode(c);
    }
    if (name.trim().length > 0) {
      names.push(name);
      lastNamed = i;
    } else {
      names.push(`Sample ${i + 1}`);
    }
  }
  // Trim trailing placeholder slots — keep only up to the last real name.
  return names.slice(0, lastNamed + 1);
}

/** Scan a TINY voice stream from ptr, returning its byte length up to and
 *  including the terminating 0xFFFF word (falls back to file end). */
function tinyStreamLength(buf: Uint8Array, ptr: number): number {
  let pos = ptr;
  while (pos + 2 <= buf.length) {
    const w = u16BE(buf, pos);
    pos += 2;
    if (w === 0xFFFF) return pos - ptr;
  }
  return buf.length - ptr;
}

/**
 * Parse TINY binary format (tiny.* prefix). Synthesis-engine variant of Sonix.
 *
 * Layout (verified against a real module + isTinyFormat detection):
 *   Bytes  0–47:  header (volume, tempo, tuning — not yet mapped to BPM)
 *   Bytes 48–63:  4 × u32BE voice-stream pointers (first == 0x140)
 *   Byte  0x40+:  4-byte ASCII instrument name table (.instr companion basenames)
 *   Stream bytes: 4 packed voice event streams, each terminated by 0xFFFF
 *
 * Instruments are placeholder Samplers named from the 0x40 table — actual PCM
 * lives in external .instr/.ss files the Sonix WASM engine loads via sidecars.
 */
function parseTinyBinary(buf: Uint8Array, filename: string): TrackerSong {
  const NUM_CHANNELS = 4;
  const fileSize = buf.length;
  if (fileSize < 64) throw new Error('TINY file too small');

  // 4 voice-stream pointers at bytes 48/52/56/60 (C engine authority — the
  // 0x140 the detector treats as a marker IS voice-0's pointer).
  const ptrs: number[] = [];
  for (let ch = 0; ch < NUM_CHANNELS; ch++) {
    ptrs.push(u32BE(buf, 48 + ch * 4));
  }

  const channelFlat: TrackerCell[][] = [];
  const streamSizes: number[] = [];
  for (let ch = 0; ch < NUM_CHANNELS; ch++) {
    const ptr = ptrs[ch];
    if (ptr <= 0 || ptr >= fileSize) {
      channelFlat.push([]);
      streamSizes.push(0);
      continue;
    }
    const len = tinyStreamLength(buf, ptr);
    channelFlat.push(parseTinyVoiceStream(buf, ptr, len));
    streamSizes.push(len);
  }

  // Instruments named from the 0x40 table; ensure at least the used registers.
  // The table ends where the first voice stream begins (smallest valid pointer).
  const tableEnd = ptrs
    .filter((p) => p > 0x40 && p <= fileSize)
    .reduce((min, p) => Math.min(min, p), fileSize);
  const tableNames = readTinyInstrumentNames(buf, tableEnd);
  let maxRegister = 0;
  for (const cells of channelFlat) {
    for (const cell of cells) {
      if (cell.instrument > maxRegister) maxRegister = cell.instrument;
    }
  }
  const instrCount = Math.max(1, tableNames.length, maxRegister);
  const instruments: InstrumentConfig[] = Array.from(
    { length: instrCount },
    (_, i) => ({
      id:         i + 1,
      name:       tableNames[i] ?? `Sample ${i + 1}`,
      type:       'synth' as const,
      synthType:  'SonixSynth' as const,
      effects:    [],
      volume:     0,
      pan:        0,
    }) as InstrumentConfig,
  );

  const baseName = (filename.split('/').pop() ?? filename).replace(/^tiny\./i, '');
  const patterns = buildPatterns(channelFlat, filename, NUM_CHANNELS);

  // Structural raw-block carrier (see parseSnxBinary): each voice stream is one
  // contiguous command stream buildPatterns splits across many display patterns,
  // so the whole-stream inverse can't be rebuilt from one pattern's rows. Stash
  // the raw bytes + full decoded baseline so encodeVariableBlock emits the raw
  // bytes verbatim when unedited (byte-exact) and only runs the TINY packer once
  // a cell diverges.
  const filePatternAddrs: number[] = [];
  const filePatternSizes: number[] = [];
  const blockRawBytes: Uint8Array[] = [];
  const blockRows: TrackerCell[][] = [];
  for (let ch = 0; ch < NUM_CHANNELS; ch++) {
    const ptr = ptrs[ch];
    const len = streamSizes[ch];
    filePatternAddrs.push(ptr);
    filePatternSizes.push(len);
    blockRawBytes.push(buf.subarray(ptr, ptr + len));
    blockRows.push(channelFlat[ch]);
  }

  const trackMap: number[][] = patterns.map(() =>
    Array.from({ length: NUM_CHANNELS }, (_, ch) => ch),
  );
  const rowsPerPattern = patterns.map(p => p.length);

  const uadeVariableLayout: UADEVariablePatternLayout = {
    formatId: 'sonixMusicDriverTiny',
    numChannels: NUM_CHANNELS,
    numFilePatterns: NUM_CHANNELS,
    rowsPerPattern,
    moduleSize: fileSize,
    encoder: sonixTinyEncoder,
    filePatternAddrs,
    filePatternSizes,
    trackMap,
    blockRows,
    blockRawBytes,
  };

  return {
    name:           `${baseName} [TINY]`,
    format:         'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions:  patterns.map((_, i) => i),
    songLength:     patterns.length,
    restartPosition: 0,
    numChannels:    NUM_CHANNELS,
    initialSpeed:   6,
    initialBPM:     125,
    linearPeriods:  false,
    uadeEditableFileData: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadeVariableLayout,
  };
}

// ── Main export ───────────────────────────────────────────────────────────

/**
 * Parse a Sonix Music Driver module into a TrackerSong.
 *
 * Sub-format routing:
 *   smus → IffSmusParser.parseIffSmusFile (complete IFF SMUS implementation)
 *   snx  → parseSnxBinary (basic binary parser; instruments are placeholders)
 *   tiny → throws (external .instr files required; UADE fallback handles it)
 */
/** Virtual memfs song dir for the Sonix WASM engine (see sonixSidecarFiles). */
export const SONIX_MEMFS_DIR = 'sonix';
/** Path passed to sonix_song_load_instruments; its parent dir (SONIX_MEMFS_DIR) is walked for sidecars. */
export const SONIX_MEMFS_SONG_PATH = `${SONIX_MEMFS_DIR}/song`;

/**
 * Map import companion files (.instr / .ss, keyed e.g. "Instruments/hihat.ss") to
 * SonixEngine memfs sidecar entries under SONIX_MEMFS_DIR/Instruments/. Returns
 * undefined when there are no usable instrument files (self-contained / none provided).
 */
export function buildSonixSidecarFiles(
  companionFiles?: Map<string, ArrayBuffer>,
): Array<{ path: string; data: ArrayBuffer }> | undefined {
  if (!companionFiles) return undefined;
  const out: Array<{ path: string; data: ArrayBuffer }> = [];
  for (const [name, data] of companionFiles) {
    if (!/\.(instr|ss)$/i.test(name)) continue;
    const base = name.split('/').pop() ?? name; // strip any "Instruments/" prefix
    out.push({ path: `${SONIX_MEMFS_DIR}/Instruments/${base}`, data });
  }
  return out.length > 0 ? out : undefined;
}

export async function parseSonixFile(
  buffer: ArrayBuffer,
  filename: string,
  companionFiles?: Map<string, ArrayBuffer>,
): Promise<TrackerSong> {
  const buf = new Uint8Array(buffer);
  const subFormat = detectSonixFormat(buf);
  if (subFormat === null) throw new Error('Not a Sonix Music Driver module');

  if (subFormat === 'smus') {
    // IFF SMUS: full implementation in IffSmusParser
    const { parseIffSmusFile } = await import('./IffSmusParser');
    const song = await parseIffSmusFile(buffer, filename, companionFiles);
    song.sonixFileData = buffer.slice(0);
    song.sonixSidecarFiles = buildSonixSidecarFiles(companionFiles);
    return song;
  }

  if (subFormat === 'tiny') {
    // TINY binary format: decode the 4 voice command streams to an editable grid
    // (byte-exact via raw-block carrier) and attach the file + companion sidecars
    // so the Sonix WASM engine renders synthesis from the external .instr/.ss.
    const song = parseTinyBinary(buf, filename);
    song.sonixFileData = buffer.slice(0);
    song.sonixSidecarFiles = buildSonixSidecarFiles(companionFiles);
    return song;
  }

  // SNX binary format: parse note streams, placeholder instruments
  const song = parseSnxBinary(buf, filename);
  song.sonixFileData = buffer.slice(0);
  song.sonixSidecarFiles = buildSonixSidecarFiles(companionFiles);
  return song;
}

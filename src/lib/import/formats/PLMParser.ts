/**
 * PLMParser.ts — Disorder Tracker 2 (.plm) PC format parser
 *
 * Disorder Tracker 2 uses a unique "2D canvas" design where patterns are
 * placed at (x=row_position, y=channel_offset) within a virtual grid. The
 * parser splits this continuous canvas into 64-row chunks to produce a
 * standard order list and pattern array.
 *
 * Binary layout:
 *   PLMFileHeader (96 bytes):
 *     +0   magic[4]     "PLM\x1A"
 *     +4   headerSize   (uint8)  — bytes in header including magic (≥ 96)
 *     +5   version      (uint8)  — must be 0x10
 *     +6   songName[48] — null/space terminated
 *     +54  numChannels  (uint8, 1–32)
 *     +55  flags        (uint8)
 *     +56  maxVol       (uint8)
 *     +57  amplify      (uint8)
 *     +58  tempo        (uint8)  → initial BPM
 *     +59  speed        (uint8)  → initial speed (ticks per row)
 *     +60  panPos[32]   (uint8 each, 0–15; pan = val × 0x11)
 *     +92  numSamples   (uint8)
 *     +93  numPatterns  (uint8)
 *     +94  numOrders    (uint16LE)
 *
 *   After header (at offset fileHeader.headerSize):
 *     numOrders   × PLMOrderItem (4 bytes each)
 *     numPatterns × uint32LE pattern file offsets
 *     numSamples  × uint32LE sample file offsets
 *
 *   PLMPatternHeader (32 bytes):
 *     +0  size        (uint32LE)
 *     +4  numRows     (uint8)
 *     +5  numChannels (uint8)
 *     +6  color       (uint8)
 *     +7  name[25]    (null-terminated)
 *
 *   PLMSampleHeader (71 bytes):
 *     +0  magic[4]    "PLS\x1A"
 *     +4  headerSize  (uint8)
 *     +5  version     (uint8)
 *     +6  name[32]    (null-terminated)
 *     +38 filename[12]
 *     +50 panning     (uint8, 0–15 or 255=no pan)
 *     +51 volume      (uint8, 0–64)
 *     +52 flags       (uint8): 1=16-bit, 2=pingpong
 *     +53 sampleRate  (uint16LE)
 *     +55 unused[4]
 *     +59 loopStart   (uint32LE, bytes)
 *     +63 loopEnd     (uint32LE, bytes)
 *     +67 length      (uint32LE, bytes)
 *
 * Reference: OpenMPT Load_plm.cpp
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Binary helpers ────────────────────────────────────────────────────────────

function u8(v: DataView, off: number): number    { return v.getUint8(off); }
function u16le(v: DataView, off: number): number { return v.getUint16(off, true); }
function u32le(v: DataView, off: number): number { return v.getUint32(off, true); }

function readString(v: DataView, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const ch = v.getUint8(off + i);
    if (ch === 0) break;
    s += String.fromCharCode(ch);
  }
  // PLM uses either null-terminated or space-padded strings; trim trailing spaces.
  return s.replace(/\s+$/, '');
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PLM_VERSION  = 0x10;
const ROWS_PER_PAT = 64;
const MAX_CHANNELS = 32;

// Sample flag bits (PLMSampleHeader.flags)
const SMP_16BIT    = 0x01;
const SMP_PINGPONG = 0x02;

// ── Effect translation table ──────────────────────────────────────────────────
//
// Maps PLM command codes 0–22 to XM-style effect type codes (effTyp field of
// TrackerCell). Where a command maps to CMD_S3MCMDEX (XM 0x0E) the param is
// further transformed inside transformEffect().
//
// XM effTyp values used here:
//   0x00 = none           0x01 = portamento up    0x02 = portamento down
//   0x03 = tone porta     0x04 = vibrato          0x05 = tonePorta+volSlide
//   0x06 = vibrato+vol    0x07 = tremolo          0x09 = sample offset
//   0x0A = vol slide      0x0B = position jump    0x0E = extra fine / S3M Sxx
//   0x0F = set speed/BPM  0x15 = fine vibrato     0x1B = retrigger
//
// Source: effTrans[] in OpenMPT Load_plm.cpp
const EFF_TRANS: ReadonlyArray<number> = [
  0x00,  //  0 — none
  0x01,  //  1 — portamento up
  0x02,  //  2 — portamento down
  0x03,  //  3 — tone portamento
  0x0A,  //  4 — volume slide
  0x07,  //  5 — tremolo
  0x04,  //  6 — vibrato
  0x0E,  //  7 — S3M Sxx: tremolo waveform  (param = 0x40|(p&3))
  0x0E,  //  8 — S3M Sxx: vibrato waveform  (param = 0x30|(p&3))
  0x0F,  //  9 — tempo (BPM ≥ 0x20 in XM convention)
  0x0F,  // 10 — speed (ticks per row)
  0x0B,  // 11 — position jump (to order)
  0x0B,  // 12 — position jump (break to end of order)
  0x09,  // 13 — sample offset
  0x0E,  // 14 — S3M Sxx: GUS panning       (param = 0x80|(p&0xF))
  0x1B,  // 15 — retrigger
  0x0E,  // 16 — S3M Sxx: note delay        (param = 0xD0|min(p,0xF))
  0x0E,  // 17 — S3M Sxx: note cut          (param = 0xC0|min(p,0xF))
  0x0E,  // 18 — S3M Sxx: pattern delay     (param = 0xE0|min(p,0xF))
  0x15,  // 19 — fine vibrato
  0x06,  // 20 — vibrato + volume slide
  0x05,  // 21 — tone portamento + volume slide
  0x09,  // 22 — offset percentage (treated as sample offset)
];

// ── Pan conversion ────────────────────────────────────────────────────────────

/**
 * Convert a PLM channel pan value (0–15) to the −50…+50 range used by
 * ChannelData.pan.
 *
 * PLM pan byte × 0x11 = 0–255 linear range.
 * Map 0–255 → −50…+50: (rawPan − 128) × 50 / 128.
 */
function plmPanToChannelPan(panByte: number): number {
  const raw = Math.min(panByte, 15) * 0x11;   // clamp to valid range first
  return Math.round((raw - 128) * 50 / 128);
}

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Returns true when the buffer passes all PLM format validation checks:
 * magic "PLM\x1A", version 0x10, numChannels 1–32, headerSize ≥ 96.
 */
export function isPLMFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 96) return false;
  const v = new DataView(buffer);
  if (u8(v, 0) !== 0x50) return false;  // 'P'
  if (u8(v, 1) !== 0x4C) return false;  // 'L'
  if (u8(v, 2) !== 0x4D) return false;  // 'M'
  if (u8(v, 3) !== 0x1A) return false;
  const headerSize  = u8(v, 4);
  const version     = u8(v, 5);
  const numChannels = u8(v, 54);
  if (version     !== PLM_VERSION)  return false;
  if (numChannels  < 1)             return false;
  if (numChannels  > MAX_CHANNELS)  return false;
  if (headerSize   < 96)            return false;
  return true;
}

// ── Effect parameter transformation ──────────────────────────────────────────

/**
 * Apply PLM-specific parameter transformations for a given command code.
 * Returns [effTyp, effParam] ready to store in TrackerCell.
 *
 * Replicates the switch statement in OpenMPT Load_plm.cpp ReadPLM().
 */
function transformEffect(cmd: number, param: number): [number, number] {
  if (cmd >= EFF_TRANS.length) return [0x00, 0x00];

  const effTyp  = EFF_TRANS[cmd];
  let   effParam = param;

  switch (cmd) {
    case 0x07:  // Tremolo waveform: S3M Sxx, param = 0x40|(p&3)
      effParam = 0x40 | (param & 0x03);
      break;
    case 0x08:  // Vibrato waveform: S3M Sxx, param = 0x30|(p&3)
      effParam = 0x30 | (param & 0x03);
      break;
    case 0x0E:  // GUS panning: S3M Sxx, param = 0x80|(p&0xF)
      effParam = 0x80 | (param & 0x0F);
      break;
    case 0x10:  // Note delay: S3M Sxx, param = 0xD0|min(p,0xF)
      effParam = 0xD0 | Math.min(param, 0x0F);
      break;
    case 0x11:  // Note cut: S3M Sxx, param = 0xC0|min(p,0xF)
      effParam = 0xC0 | Math.min(param, 0x0F);
      break;
    case 0x12:  // Pattern delay: S3M Sxx, param = 0xE0|min(p,0xF)
      effParam = 0xE0 | Math.min(param, 0x0F);
      break;
    case 0x04:  // Volume slide
    case 0x14:  // Vibrato + volume slide
    case 0x15:  // Tone portamento + volume slide
      // If both nibbles are set and the upper nibble is not 0xF, treat as
      // fine volume slide up by forcing the lower nibble to 0xF.
      if ((param & 0xF0) && (param & 0x0F) && (param & 0xF0) !== 0xF0) {
        effParam = param | 0x0F;
      }
      break;
    default:
      break;
  }

  return [effTyp, effParam];
}

// ── Interfaces ────────────────────────────────────────────────────────────────

interface PLMOrderItem {
  x:       number;   // Starting absolute row in the virtual canvas
  y:       number;   // First channel index to write into
  pattern: number;   // Pattern index (into patternOffsets)
}

interface PLMSampleMeta {
  name:       string;
  panning:    number | null;  // null = no per-sample pan (panning byte was 255)
  volume:     number;         // 0–64
  is16Bit:    boolean;
  isPingPong: boolean;
  sampleRate: number;         // C5 speed in Hz
  loopStart:  number;         // in sample frames
  loopEnd:    number;         // in sample frames
  length:     number;         // in sample frames
  pcmOffset:  number;         // byte offset of PCM data in the file
  pcmBytes:   number;         // raw byte count in the file (before /2 for 16-bit)
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse a Disorder Tracker 2 (.plm) file into a TrackerSong.
 *
 * @throws If the file fails PLM magic/version validation.
 */
export async function parsePLMFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  if (!isPLMFormat(buffer)) {
    throw new Error('PLMParser: file does not pass PLM format validation');
  }

  const v     = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // ── File header ────────────────────────────────────────────────────────────

  const headerSize  = u8(v, 4);
  const songName    = readString(v, 6, 48) || filename.replace(/\.[^/.]+$/, '');
  const numChannels = u8(v, 54);
  const tempo       = u8(v, 58);  // initial BPM
  const speed       = u8(v, 59);  // initial speed (ticks per row)

  // Channel panning: panPos[0..31], each 0–15
  const panPos: number[] = [];
  for (let c = 0; c < MAX_CHANNELS; c++) {
    panPos.push(u8(v, 60 + c));
  }

  const numSamples  = u8(v, 92);
  const numPatterns = u8(v, 93);
  const numOrders   = u16le(v, 94);

  // ── Tables (order items, pattern offsets, sample offsets) ─────────────────
  // All three live contiguously immediately after the file header.

  let cursor = headerSize;

  const orderItems: PLMOrderItem[] = [];
  for (let i = 0; i < numOrders; i++) {
    orderItems.push({
      x:       u16le(v, cursor),
      y:       u8(v, cursor + 2),
      pattern: u8(v, cursor + 3),
    });
    cursor += 4;
  }

  const patternOffsets: number[] = [];
  for (let i = 0; i < numPatterns; i++) {
    patternOffsets.push(u32le(v, cursor));
    cursor += 4;
  }

  const sampleOffsets: number[] = [];
  for (let i = 0; i < numSamples; i++) {
    sampleOffsets.push(u32le(v, cursor));
    cursor += 4;
  }

  // ── Sample headers ─────────────────────────────────────────────────────────

  const sampleMeta: PLMSampleMeta[] = [];

  for (let smp = 0; smp < numSamples; smp++) {
    const smpOff = sampleOffsets[smp];

    if (
      smpOff === 0 ||
      smpOff + 71 > buffer.byteLength ||
      u8(v, smpOff + 0) !== 0x50 ||   // 'P'
      u8(v, smpOff + 1) !== 0x4C ||   // 'L'
      u8(v, smpOff + 2) !== 0x53 ||   // 'S'
      u8(v, smpOff + 3) !== 0x1A
    ) {
      sampleMeta.push(makeEmptySampleMeta(smp));
      continue;
    }

    const smpHeaderSize  = u8(v, smpOff + 4);
    const smpName        = readString(v, smpOff + 6, 32) || `Sample ${smp + 1}`;
    const panningByte    = u8(v, smpOff + 50);
    const volume         = Math.min(u8(v, smpOff + 51), 64);
    const flags          = u8(v, smpOff + 52);
    const sampleRate     = u16le(v, smpOff + 53);
    // +55: unused[4]
    const loopStartBytes = u32le(v, smpOff + 59);
    const loopEndBytes   = u32le(v, smpOff + 63);
    const lengthBytes    = u32le(v, smpOff + 67);

    const is16Bit    = (flags & SMP_16BIT)    !== 0;
    const isPingPong = (flags & SMP_PINGPONG) !== 0;

    // For 16-bit samples, length/loopStart/loopEnd are byte values — divide
    // by 2 to convert to sample-frame counts.
    const divisor   = is16Bit ? 2 : 1;
    const loopStart = Math.floor(loopStartBytes / divisor);
    const loopEnd   = Math.floor(loopEndBytes   / divisor);
    const length    = Math.floor(lengthBytes    / divisor);

    sampleMeta.push({
      name:       smpName,
      panning:    panningByte <= 15 ? panningByte * 0x11 : null,
      volume,
      is16Bit,
      isPingPong,
      sampleRate: sampleRate || 8363,  // default to FT2 C-5 rate if zero
      loopStart,
      loopEnd,
      length,
      pcmOffset:  smpOff + smpHeaderSize,
      pcmBytes:   lengthBytes,          // raw byte count before /2 adjustment
    });
  }

  // ── Pattern data — 2D canvas split into 64-row chunks ─────────────────────
  //
  // PLM places patterns at (x=absRow, y=startChannel) on a virtual canvas.
  // We map absRow → (chunkIdx, rowInChunk) where:
  //   chunkIdx    = Math.floor(absRow / ROWS_PER_PAT)
  //   rowInChunk  = absRow % ROWS_PER_PAT
  //
  // Each chunk becomes one Pattern in the song. We allocate cells on demand
  // and use empty cells for rows/channels that no order item writes into.

  // patternCells[chunkIdx][channelIdx][rowIdx] = TrackerCell
  const patternCells: Map<number, TrackerCell[][]> = new Map();

  // Track highest absolute row written to trim the last pattern accurately.
  let maxAbsRow = 0;

  for (const ord of orderItems) {
    if (ord.pattern >= numPatterns) continue;
    if (ord.y >= numChannels)       continue;

    const patOff = patternOffsets[ord.pattern];
    if (patOff === 0 || patOff + 32 > buffer.byteLength) continue;

    // PLMPatternHeader (32 bytes)
    const patNumRows  = u8(v, patOff + 4);
    const patNumChans = u8(v, patOff + 5);
    if (patNumRows === 0) continue;

    // Number of channels from this pattern that fit in the song's layout
    const writableChans = Math.min(patNumChans, numChannels - ord.y);

    let absRow  = ord.x;
    let cellOff = patOff + 32;  // cell data follows immediately after the 32-byte header

    for (let r = 0; r < patNumRows; r++, absRow++) {
      const chunkIdx   = Math.floor(absRow / ROWS_PER_PAT);
      const rowInChunk = absRow % ROWS_PER_PAT;

      // Allocate the chunk grid if this is the first time we see this chunk
      if (!patternCells.has(chunkIdx)) {
        const grid: TrackerCell[][] = [];
        for (let ch = 0; ch < numChannels; ch++) {
          const col: TrackerCell[] = [];
          for (let row = 0; row < ROWS_PER_PAT; row++) {
            col.push(makeEmptyCell());
          }
          grid.push(col);
        }
        patternCells.set(chunkIdx, grid);
      }

      const grid = patternCells.get(chunkIdx)!;

      // Read all cells for this row (skip channels beyond writable range)
      for (let c = 0; c < patNumChans; c++, cellOff += 5) {
        if (cellOff + 5 > buffer.byteLength) break;

        const noteByte = u8(v, cellOff);
        const instr    = u8(v, cellOff + 1);
        const volByte  = u8(v, cellOff + 2);
        const cmd      = u8(v, cellOff + 3);
        const param    = u8(v, cellOff + 4);

        if (c >= writableChans) continue;
        const destCh = ord.y + c;
        if (destCh >= numChannels) continue;

        // Note encoding (from OpenMPT):
        //   noteByte == 0       → empty
        //   noteByte >= 0x90    → ignore (beyond valid range)
        //   else: (hi_nibble * 12) + lo_nibble + 12 + 1 (NOTE_MIN=1)
        // Example: 0x11 → (1*12) + 1 + 13 = 26 → C-2 in XM numbering
        let note = 0;
        if (noteByte > 0 && noteByte < 0x90) {
          note = ((noteByte >> 4) * 12) + (noteByte & 0x0F) + 12 + 1;
        }

        // Volume column: 0xFF = empty; 0–64 = explicit volume.
        // XM volume column encoding: 0x00 = empty, 0x10–0x50 = vol 0–64.
        const volume = volByte !== 0xFF ? 0x10 + Math.min(volByte, 64) : 0x00;

        const [effTyp, eff] = transformEffect(cmd, param);

        grid[destCh][rowInChunk] = {
          note,
          instrument: instr,
          volume,
          effTyp,
          eff,
          effTyp2: 0,
          eff2:    0,
        };
      }

      maxAbsRow = Math.max(maxAbsRow, absRow);
    }
  }

  // ── Build Pattern objects from chunks ──────────────────────────────────────

  const chunkIndices = Array.from(patternCells.keys()).sort((a, b) => a - b);
  const maxChunk     = chunkIndices.length > 0
    ? chunkIndices[chunkIndices.length - 1]
    : 0;

  // Song order list: one entry per chunk index, in order 0..maxChunk.
  // Gaps (missing chunks) become empty patterns.
  const songPositions: number[] = [];
  const patterns: Pattern[]     = [];

  for (let ci = 0; ci <= maxChunk; ci++) {
    songPositions.push(ci);   // order[ci] references pattern index ci (1:1)

    const grid = patternCells.get(ci);

    // The last chunk may be shorter than ROWS_PER_PAT.
    let numRows = ROWS_PER_PAT;
    if (ci === Math.floor(maxAbsRow / ROWS_PER_PAT)) {
      const usedRows = (maxAbsRow % ROWS_PER_PAT) + 1;
      if (usedRows < ROWS_PER_PAT) numRows = usedRows;
    }

    const channels: ChannelData[] = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const rows: TrackerCell[] = [];
      for (let row = 0; row < numRows; row++) {
        rows.push(grid?.[ch]?.[row] ?? makeEmptyCell());
      }
      channels.push({
        id:           `channel-${ch}`,
        name:         `Channel ${ch + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          plmPanToChannelPan(panPos[ch] ?? 7),
        instrumentId: null,
        color:        null,
        rows,
      });
    }

    patterns.push({
      id:      `pattern-${ci}`,
      name:    `Pattern ${ci}`,
      length:  numRows,
      channels,
      importMetadata: {
        sourceFormat:            'PLM',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    numChannels,
        originalPatternCount:    numPatterns,
        originalInstrumentCount: numSamples,
      },
    });
  }

  // ── Sample PCM data → InstrumentConfig ────────────────────────────────────

  const instruments: InstrumentConfig[] = [];

  for (let smp = 0; smp < numSamples; smp++) {
    const meta = sampleMeta[smp];
    const id   = smp + 1;

    if (
      meta.length === 0 ||
      meta.pcmOffset === 0 ||
      meta.pcmOffset + meta.pcmBytes > buffer.byteLength
    ) {
      instruments.push(makeSilentInstrument(id, meta.name));
      continue;
    }

    const rawPcm = bytes.slice(meta.pcmOffset, meta.pcmOffset + meta.pcmBytes);

    // Convert unsigned PCM to signed 8-bit before passing to createSamplerInstrument.
    // 8-bit: XOR 0x80 on each byte.
    // 16-bit (unsigned LE): take the high byte of each sample then XOR 0x80.
    const signed8 = new Uint8Array(meta.length);
    if (meta.is16Bit) {
      for (let i = 0; i < meta.length; i++) {
        const hi = rawPcm[i * 2 + 1] ?? 0x80;
        signed8[i] = hi ^ 0x80;
      }
    } else {
      for (let i = 0; i < meta.length; i++) {
        signed8[i] = rawPcm[i] ^ 0x80;
      }
    }

    const hasLoop   = meta.loopEnd > meta.loopStart;
    const loopStart = hasLoop ? meta.loopStart : 0;
    const loopEnd   = hasLoop ? Math.min(meta.loopEnd, meta.length) : 0;

    const instrument = createSamplerInstrument(
      id,
      meta.name,
      signed8,
      meta.volume,
      meta.sampleRate,
      loopStart,
      loopEnd,
    );

    // Patch ping-pong loop type: createSamplerInstrument only sets 'forward'.
    if (hasLoop && meta.isPingPong && instrument.sample) {
      instrument.sample.loopType = 'pingpong';
    }

    instruments.push(instrument);
  }

  // ── Assemble TrackerSong ───────────────────────────────────────────────────

  return {
    name:            songName,
    format:          'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength:      songPositions.length,
    restartPosition: 0,
    numChannels,
    initialSpeed:    speed || 6,
    initialBPM:      tempo || 125,
    linearPeriods:   false,
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function makeEmptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function makeEmptySampleMeta(idx: number): PLMSampleMeta {
  return {
    name:       `Sample ${idx + 1}`,
    panning:    null,
    volume:     64,
    is16Bit:    false,
    isPingPong: false,
    sampleRate: 8363,
    loopStart:  0,
    loopEnd:    0,
    length:     0,
    pcmOffset:  0,
    pcmBytes:   0,
  };
}

function makeSilentInstrument(id: number, name: string): InstrumentConfig {
  return {
    id,
    name,
    type:      'sample'  as const,
    synthType: 'Sampler' as const,
    effects:   [],
    volume:    -60,
    pan:       0,
  } as unknown as InstrumentConfig;
}

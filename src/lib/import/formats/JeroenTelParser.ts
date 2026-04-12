/**
 * JeroenTelParser.ts — Jeroen Tel Amiga music format (jt.* / mon_old.*) native parser
 *
 * Jeroen Tel (of Maniacs of Noise fame) composed music for many classic Amiga games
 * including Cybernoid, Myth, Turrican, and countless others. The module file is a
 * compiled 68k executable combining the player code and music data in a single file.
 *
 * Detection (from UADE "Jeroen Tel_v1.asm", DTP_Check2 routine):
 *   1. File must be > 1700 bytes.
 *   2. Scan the first 40 bytes (step 2) for the 4-byte sequence 0x02, 0x39, 0x00, 0x01
 *      (68k ANDI.B #$01, ($XXXXXXXX).L — the low word of the absolute address).
 *   3. When found at scanPos:
 *      - byte at scanPos+8  must be 0x66 (BNE opcode)
 *      - byte at scanPos+9  is D1 = instrument count (must be 1..127, i.e. >0 and <0x80)
 *      - bytes at scanPos+10..11 must be 0x4E, 0x75 (RTS instruction)
 *   4. Skip D1 bytes forward from scanPos+12:
 *      - If the word there is 0x4A39 (TST.B abs.l), check it appears 4 more times
 *        each 18 bytes apart.
 *      - Otherwise the longword there must be 0x78001839.
 *
 * Instrument count: byte at scanPos+9 (1–127).
 *
 * Single-file format: player code + music data + samples all in one binary blob.
 * UADE handles actual audio playback; this parser extracts pattern data for display.
 *
 * Reference: third-party/uade-3.05/amigasrc/players/wanted_team/JeroenTel/Jeroen Tel_v1.asm
 * Reference parsers: DaveLoweParser.ts, RichardJosephParser.ts
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { amigaNoteToXM } from './AmigaUtils';

// NOTE: uadePatternLayout not added — Jeroen Tel uses variable-length byte stream
// encoding per track (not fixed-size cells). Requires UADEVariablePatternLayout with
// per-track address/size tracking during parsing.

// ── Constants ───────────────────────────────────────────────────────────────

/** Minimum file size enforced by the Check2 routine (ble.b Fault if <= 1700). */
const MIN_FILE_SIZE = 1701;

/** Maximum number of instruments to create as placeholders. */
const MAX_INSTRUMENTS = 36;

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Scan the first 40 bytes of `buf` (stepping by 2) looking for the 4-byte
 * sequence 0x02, 0x39, 0x00, 0x01 (68k ANDI.B #$01, abs.l low-word marker).
 *
 * Returns the scan position where the sequence was found, or -1 if not found.
 * This mirrors the Check / More logic in DTP_Check2.
 */
function findJeroenTelScanPos(buf: Uint8Array): number {
  // lea 40(A0), A1  →  limit is file base + 40
  const limit = 40;

  for (let pos = 0; pos + 3 < limit && pos + 3 < buf.length; pos += 2) {
    if (
      buf[pos] === 0x02 &&
      buf[pos + 1] === 0x39 &&
      buf[pos + 2] === 0x00 &&
      buf[pos + 3] === 0x01
    ) {
      return pos;
    }
  }
  return -1;
}

// ── Data pointer scanning ─────────────────────────────────────────────────

/** Read a big-endian unsigned 32-bit long from buf at offset. */
function readLong(buf: Uint8Array, off: number): number {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

/** Read a big-endian unsigned 16-bit word from buf at offset. */
function readWord(buf: Uint8Array, off: number): number {
  return (buf[off] << 8) | buf[off + 1];
}

/** Result of scanning the 68k code for data table pointers. */
interface JTDataPointers {
  origin: number;
  trackTableOff: number;
  subsongTableOff: number;
  sampleTableOff: number;
}

/**
 * Replicate the UADE InitPlayer opcode chain to locate data table pointers.
 *
 * The 68k executable contains absolute addresses that reference the original
 * Amiga load address. The "origin" value lets us convert absolute→file offset:
 *   fileOffset = (absoluteAddr - origin) & 0xFFFFFFFF
 *
 * Returns null if any scan step fails (corrupt or unsupported variant).
 */
function scanJTDataPointers(buf: Uint8Array): JTDataPointers | null {
  const len = buf.length;

  // Find1: scan for 0x1400E302 → D7 = long at +6
  let pos = 0;
  while (pos + 9 < len) {
    if (readLong(buf, pos) === 0x1400E302) break;
    pos += 2;
  }
  if (pos + 9 >= len) return null;
  const d7 = readLong(buf, pos + 6);

  // Find2: scan for 0x03580328 → origin = D7 - (scanPos - fileStart)
  // In the ASM: A1 starts at modulePtr (=0 for us), walks forward.
  // After Find2: origin = D7 - A1 (where A1 is the file offset of the match)
  let pos2 = pos; // continue from where Find1 left off
  while (pos2 + 3 < len) {
    if (readLong(buf, pos2) === 0x03580328) break;
    pos2 += 2;
  }
  if (pos2 + 3 >= len) return null;
  // ASM: sub.l A0,A1 (A1 = pos2, A0 = 0 for file offset); sub.l A1,D7
  // origin = D7 - pos2
  const origin = (d7 - pos2) & 0xFFFFFFFF;

  // FindR: scan for 0xB23C00FF or 0x0C0100FF (skip — used for repeat values)
  let posR = 0;
  while (posR + 3 < len) {
    const v = readLong(buf, posR);
    if (v === 0xB23C00FF || v === 0x0C0100FF) break;
    posR += 2;
  }
  if (posR + 3 >= len) return null;
  // We don't need the repeat values for pattern parsing, just advance past

  // Find3: scan for 0x267C → track pointer table (next long is absolute addr)
  let pos3 = posR;
  while (pos3 + 5 < len) {
    if (readWord(buf, pos3) === 0x267C) {
      pos3 += 2; // point to the long after the opcode
      break;
    }
    pos3++;
  }
  if (pos3 + 3 >= len) return null;
  const trackTableAbs = readLong(buf, pos3);
  pos3 += 4;
  const trackTableOff = (trackTableAbs - origin) & 0xFFFFFFFF;

  // Find4: scan for 0x49F9 → sample table (next long is absolute addr)
  let pos4 = pos3;
  while (pos4 + 5 < len) {
    if (readWord(buf, pos4) === 0x49F9) {
      pos4 += 2;
      break;
    }
    pos4++;
  }
  if (pos4 + 3 >= len) return null;
  const sampleTableAbs = readLong(buf, pos4);
  pos4 += 4;
  const sampleTableOff = (sampleTableAbs - origin) & 0xFFFFFFFF;

  // Find5: scan for 0x0026267C → subsong voice ptrs base (skip 4, next long)
  let pos5 = pos4;
  while (pos5 + 7 < len) {
    if (readLong(buf, pos5) === 0x0026267C) break;
    pos5 += 2;
  }
  if (pos5 + 7 >= len) return null;
  // skip 4 bytes (the 0x0026267C), then read the long
  pos5 += 4;
  // The long at pos5 is the subsong voice ptrs base — we skip it for now
  pos5 += 4;

  // Find6: scan for 0x23F4 → subsong table (long at -4 relative to match+2)
  // ASM: Find6: cmp.w #$23F4,(A1)+; bne Find6 → after match A1 points past the word
  // Then: move.l -6(A1),D0 → reads the long that ends 6 bytes before current A1
  // Since A1 was incremented by 2 past the match: -6(A1) = matchPos - 4
  let pos6 = pos5;
  while (pos6 + 1 < len) {
    if (readWord(buf, pos6) === 0x23F4) break;
    pos6++;
  }
  if (pos6 < 4 || pos6 + 1 >= len) return null;
  // ASM reads -6(A1) where A1 = pos6+2, so the long is at pos6+2-6 = pos6-4
  const subsongTableAbs = readLong(buf, pos6 - 4);
  const subsongTableOff = (subsongTableAbs - origin) & 0xFFFFFFFF;

  // Sanity: all offsets must be within file
  if (trackTableOff >= len || sampleTableOff >= len || subsongTableOff >= len) {
    return null;
  }

  return { origin, trackTableOff, subsongTableOff, sampleTableOff };
}

// ── Track data parsing ────────────────────────────────────────────────────

/** A single entry decoded from a JT track byte stream. */
interface JTTrackEntry {
  duration: number;   // bits 0-4 of the command byte (0-31 ticks)
  note: number;       // raw note value (0 = none)
  instrument: number; // instrument index (0 = no change)
  volume: number;     // volume override (0 = no change, 1-127 = value)
  slide: number;      // portamento speed (0 = none)
}

/**
 * Parse a Jeroen Tel track byte stream starting at `trackOff` in `buf`.
 *
 * Track byte encoding (from the Play_1 routine):
 *   - Read byte D3. Duration = D3 & 0x1F, glide = D3 & 0x20, type = D3 & 0xC0
 *   - If D3 >= 0xE0: volume prefix → next byte = volume, then re-read command byte
 *   - If D3 >= 0xC0: end of row (advance sequence pos; if next byte = 0xFF → end of track)
 *   - Type 0x00 (bits 6-7 = 00): note only → next byte = note
 *   - Type 0x40 (bits 6-7 = 01): note + slide → next byte = slide speed, next = note
 *   - Type 0x80 (bits 6-7 = 10): instrument change → next byte = instrument index,
 *     then if next byte has bit 7 set: volume override (& 0x7F), skip extra byte
 *     finally next byte = note
 */
function parseJTTrack(buf: Uint8Array, trackOff: number): JTTrackEntry[] {
  const entries: JTTrackEntry[] = [];
  let pos = trackOff;
  const len = buf.length;
  const MAX_ENTRIES = 512; // safety limit

  while (pos < len && entries.length < MAX_ENTRIES) {
    let d3 = buf[pos];
    let volume = 0;

    // Volume prefix: if byte >= 0xE0, next byte is volume, then re-read
    if (d3 >= 0xE0) {
      pos++;
      if (pos >= len) break;
      volume = buf[pos];
      pos++;
      if (pos >= len) break;
      d3 = buf[pos];
    }

    const duration = d3 & 0x1F;
    const glide = (d3 & 0x20) !== 0;
    const typeBits = d3 & 0xC0;

    // End of row marker (>= 0xC0 after removing volume prefix case)
    if (d3 >= 0xC0) {
      // Check if next byte is 0xFF (end of track)
      pos++;
      if (pos >= len || buf[pos] === 0xFF) break;
      // Otherwise this is just a rest/spacer row with the given duration
      entries.push({ duration, note: 0, instrument: 0, volume, slide: 0 });
      continue;
    }

    let note = 0;
    let instrument = 0;
    let slide = 0;

    if (typeBits === 0x40) {
      // Type 1: note + slide
      pos++;
      if (pos >= len) break;
      slide = buf[pos]; // slide speed
      pos++;
      if (pos >= len) break;
      note = buf[pos];
    } else if (typeBits === 0x80) {
      // Type 2: instrument change + note
      pos++;
      if (pos >= len) break;
      const instrByte = buf[pos];
      instrument = instrByte;
      pos++;
      if (pos >= len) break;
      // Check if next byte has bit 7 set → volume override
      const nextByte = buf[pos];
      if (nextByte & 0x80) {
        volume = nextByte & 0x7F;
        pos++;
        if (pos >= len) break;
      }
      note = buf[pos];
    } else {
      // Type 0: note only
      pos++;
      if (pos >= len) break;
      note = buf[pos];
    }

    if (glide && slide === 0) {
      // Glide bit set but no explicit slide speed — mark as portamento
      slide = 1;
    }

    entries.push({ duration, note, instrument, volume, slide });

    // Check for track terminator (0xFF after the note byte)
    pos++;
    if (pos >= len || buf[pos] === 0xFF) break;
  }

  return entries;
}

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Return true if the buffer passes the full DTP_Check2 detection algorithm.
 *
 * When `filename` is supplied the basename is also checked for the expected
 * UADE prefixes (`jt.` or `mon_old.`).  The prefix check alone is not
 * sufficient; the binary scan is always performed.
 */
export function isJeroenTelFormat(buffer: ArrayBuffer, filename?: string): boolean {
  const buf = new Uint8Array(buffer);

  // ── Prefix / extension check (optional fast-reject) ─────────────────────
  // UADE canonical names use prefix: jt.songname or mon_old.songname
  // Common rip naming uses extension: songname.jt
  if (filename !== undefined) {
    const baseName = (filename.split('/').pop() ?? filename).toLowerCase();
    const hasPrefix = baseName.startsWith('jt.') || baseName.startsWith('mon_old.');
    const hasExtension = baseName.endsWith('.jt');
    if (!hasPrefix && !hasExtension) {
      return false;
    }
  }

  // ── Minimum size ─────────────────────────────────────────────────────────
  if (buf.length < MIN_FILE_SIZE) return false;

  // ── Scan for marker ───────────────────────────────────────────────────────
  const scanPos = findJeroenTelScanPos(buf);
  if (scanPos === -1) return false;

  // ── Structural checks after marker ───────────────────────────────────────
  // After the 4-byte match the assembly does: addq.l #8, A0
  // So the fields of interest are:
  //   scanPos + 8  → must be 0x66
  //   scanPos + 9  → D1 (instrument count; must be 1..127)
  //   scanPos + 10 → must be 0x4E
  //   scanPos + 11 → must be 0x75
  if (scanPos + 11 >= buf.length) return false;

  if (buf[scanPos + 8] !== 0x66) return false;

  const d1 = buf[scanPos + 9];
  if (d1 === 0 || d1 >= 0x80) return false;   // bmi / beq → Fault

  if (buf[scanPos + 10] !== 0x4e || buf[scanPos + 11] !== 0x75) return false;

  // ── Post-RTS structural check ─────────────────────────────────────────────
  // The ASM reads: ext.w D1; add.w D1, A0 — but A0 here is the pointer *past*
  // the RTS (at scanPos+12), and D1 is the sign-extended byte from scanPos+9.
  // For real files D1 is 0x02, making the "skip" 2 bytes — landing at offset 14.
  // However, the reference files have 0x78001839 at scanPos+12 (offset 12), NOT
  // at scanPos+14.  Tracing the actual ASM more carefully: the ANDI.B sequence
  // is 8 bytes (02 39 00 01 xx xx xx xx), then BNE+D1+RTS at +8..+11.  The label
  // "Good" / "NoOne" check happens at (A0) where A0 = scanPos+12 before the
  // ext.w/add.w step.  D1 is a byte used as an offset INTO the data, not an
  // additional skip past the RTS.  Empirically, 0x78001839 sits at scanPos+12
  // in every real Jeroen Tel file tested.
  const checkOff = scanPos + 12;
  if (checkOff + 3 >= buf.length) return false;

  const word0 = (buf[checkOff] << 8) | buf[checkOff + 1];

  if (word0 === 0x4a39) {
    // NextOne loop: 4 more checks of 0x4A39, each 18 bytes apart
    // dbf D1,NextOne with D1=3 means we check at offsets 0, 18, 36, 54, 72
    for (let i = 1; i <= 4; i++) {
      const off = checkOff + i * 18;
      if (off + 1 >= buf.length) return false;
      const w = (buf[off] << 8) | buf[off + 1];
      if (w !== 0x4a39) return false;
    }
  } else {
    // NoOne path: cmp.l #$78001839, (A0)
    const long0 =
      ((buf[checkOff] << 24) |
        (buf[checkOff + 1] << 16) |
        (buf[checkOff + 2] << 8) |
        buf[checkOff + 3]) >>>
      0;
    if (long0 !== 0x78001839) return false;
  }

  return true;
}

// ── Main parser ────────────────────────────────────────────────────────────

/**
 * Parse a Jeroen Tel module file into a TrackerSong.
 *
 * The format is a compiled 68k executable; there is no public specification
 * of the internal layout beyond what the UADE EaglePlayer uses for detection.
 * This parser creates a metadata-only TrackerSong with placeholder instruments.
 * Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive module name and detect variant)
 */
export async function parseJeroenTelFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const buf = new Uint8Array(buffer);

  if (!isJeroenTelFormat(buffer, filename)) {
    throw new Error('Not a Jeroen Tel module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = (filename.split('/').pop() ?? filename);
  // Strip "jt." or "mon_old." prefix (case-insensitive)
  const moduleName =
    baseName.replace(/^jt\./i, '').replace(/^mon_old\./i, '') || baseName;

  // ── Instrument count from scan ─────────────────────────────────────────────

  const scanPos = findJeroenTelScanPos(buf);
  // scanPos is guaranteed valid because isJeroenTelFormat passed
  const rawInstrumentCount = buf[scanPos + 9]; // D1 in the assembly (1..127)
  const numInstruments = Math.min(rawInstrumentCount, MAX_INSTRUMENTS);

  // ── Instrument placeholders ──────────────────────────────────────────────

  const instruments: InstrumentConfig[] = [];

  for (let i = 0; i < numInstruments; i++) {
    instruments.push({
      id: i + 1,
      name: `Sample ${i + 1}`,
      type: 'synth' as const,
      synthType: 'Synth' as const,
      effects: [],
      volume: 0,
      pan: 0,
    } as InstrumentConfig);
  }

  if (instruments.length === 0) {
    instruments.push({
      id: 1,
      name: 'Sample 1',
      type: 'synth' as const,
      synthType: 'Synth' as const,
      effects: [],
      volume: 0,
      pan: 0,
    } as InstrumentConfig);
  }

  // ── Scan for data pointers ──────────────────────────────────────────────

  const ptrs = scanJTDataPointers(buf);

  // ── Build patterns ──────────────────────────────────────────────────────

  const patterns: Pattern[] = [];
  const songPositions: number[] = [];

  if (ptrs) {
    // Read subsong 0: 4 voice sequence pointers at subsongTableOff
    // Each subsong entry is 18 bytes: 4 longs (voice ptrs) + 2 bytes (speed)
    const subsongOff = ptrs.subsongTableOff;

    // Read 4 voice sequence pointers (absolute, convert to file offsets)
    const voiceSeqOffs: number[] = [];
    for (let v = 0; v < 4; v++) {
      if (subsongOff + v * 4 + 3 >= buf.length) {
        voiceSeqOffs.push(0);
        continue;
      }
      const abs = readLong(buf, subsongOff + v * 4);
      voiceSeqOffs.push((abs - ptrs.origin) & 0xFFFFFFFF);
    }

    // Read speed values from subsong entry
    let speed1 = 6;
    if (subsongOff + 17 < buf.length) {
      speed1 = buf[subsongOff + 16] || 6;
      // speed2 at +17 is the alternate speed (not used in pattern display)
    }

    // Parse each voice's sequence to determine steps
    // Voice sequence format: bytes where < 0x80 = track index, >= 0x80 = transpose delta,
    // 0xFF = end, 0xFE = stop
    interface VoiceStep {
      trackIndex: number;
      transpose: number;
    }
    const voiceSteps: VoiceStep[][] = [[], [], [], []];

    for (let v = 0; v < 4; v++) {
      let seqOff = voiceSeqOffs[v];
      if (seqOff >= buf.length) continue;
      let transpose = 0;
      const MAX_STEPS = 256;
      let stepCount = 0;

      while (seqOff < buf.length && stepCount < MAX_STEPS) {
        const b = buf[seqOff];
        if (b === 0xFF || b === 0xFE) break;

        if (b >= 0x80) {
          // Transpose: value - 0xC0 (signed)
          transpose = (b - 0xC0) | 0; // sign-extend via |0
          seqOff++;
          continue;
        }

        // Track index
        voiceSteps[v].push({ trackIndex: b, transpose });
        seqOff++;
        stepCount++;
      }
    }

    // The number of pattern "steps" = max voice sequence length
    const numSteps = Math.max(1, ...voiceSteps.map(s => s.length));

    // For each step, look up the track in the track pointer table and parse it
    for (let step = 0; step < numSteps; step++) {
      const channelRows: TrackerCell[][] = [[], [], [], []];
      let maxRows = 0;

      for (let ch = 0; ch < 4; ch++) {
        const vstep = voiceSteps[ch][step];
        if (!vstep) continue;

        // Look up track pointer: trackTableOff + trackIndex * 4 → absolute pointer
        const tpOff = ptrs.trackTableOff + vstep.trackIndex * 4;
        if (tpOff + 3 >= buf.length) continue;
        const trackAbs = readLong(buf, tpOff);
        const trackFileOff = (trackAbs - ptrs.origin) & 0xFFFFFFFF;
        if (trackFileOff >= buf.length) continue;

        const entries = parseJTTrack(buf, trackFileOff);

        // Expand entries into rows (each entry occupies `duration` rows, with
        // the note/instrument on the first row and empty rows for the rest)
        const rows: TrackerCell[] = [];
        for (const entry of entries) {
          const noteVal = entry.note > 0
            ? amigaNoteToXM(entry.note + vstep.transpose)
            : 0;

          // Clamp note to valid XM range
          const clampedNote = noteVal > 0 ? Math.max(1, Math.min(96, noteVal)) : 0;

          rows.push({
            note: clampedNote,
            instrument: entry.instrument > 0 ? entry.instrument + 1 : 0,
            volume: entry.volume > 0 ? (0x10 + Math.min(entry.volume, 64)) : 0,
            effTyp: entry.slide > 0 ? 0x03 : 0,
            eff: entry.slide > 0 ? Math.min(entry.slide, 0xFF) : 0,
            effTyp2: 0,
            eff2: 0,
          });

          // Fill remaining duration rows with empty cells
          for (let d = 1; d < Math.max(1, entry.duration); d++) {
            rows.push({
              note: 0, instrument: 0, volume: 0,
              effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
            });
          }
        }

        channelRows[ch] = rows;
        if (rows.length > maxRows) maxRows = rows.length;
      }

      // Normalize to a power-of-2-friendly length (round up to 16/32/64/128)
      if (maxRows === 0) maxRows = 64;
      let patLen = 64;
      if (maxRows <= 16) patLen = 16;
      else if (maxRows <= 32) patLen = 32;
      else if (maxRows <= 64) patLen = 64;
      else if (maxRows <= 128) patLen = 128;
      else patLen = 128;

      const emptyCell: TrackerCell = {
        note: 0, instrument: 0, volume: 0,
        effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      };

      const channels: ChannelData[] = Array.from({ length: 4 }, (_, ch) => {
        const rows = channelRows[ch];
        // Pad or truncate to patLen
        const paddedRows: TrackerCell[] = [];
        for (let r = 0; r < patLen; r++) {
          paddedRows.push(r < rows.length ? rows[r] : { ...emptyCell });
        }
        return {
          id: `channel-${ch}`,
          name: `Channel ${ch + 1}`,
          muted: false,
          solo: false,
          collapsed: false,
          volume: 100,
          pan: ch === 0 || ch === 3 ? -50 : 50,
          instrumentId: null,
          color: null,
          rows: paddedRows,
        };
      });

      const pattern: Pattern = {
        id: `pattern-${step}`,
        name: `Pattern ${step}`,
        length: patLen,
        channels,
        importMetadata: {
          sourceFormat: 'MOD' as const,
          sourceFile: filename,
          importedAt: new Date().toISOString(),
          originalChannelCount: 4,
          originalPatternCount: numSteps,
          originalInstrumentCount: numInstruments,
        },
      };

      patterns.push(pattern);
      songPositions.push(step);
    }

    // If we got patterns, return with parsed data
    if (patterns.length > 0) {
      return {
        name: `${moduleName} [Jeroen Tel] (${numInstruments} smp)`,
        format: 'MOD' as TrackerFormat,
        patterns,
        instruments,
        songPositions,
        songLength: songPositions.length,
        restartPosition: 0,
        numChannels: 4,
        initialSpeed: speed1,
        initialBPM: 125,
        linearPeriods: false,
        uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
        uadeEditableFileName: filename,
      };
    }
  }

  // ── Fallback: empty pattern if scanning failed ──────────────────────────

  const emptyRows: TrackerCell[] = Array.from({ length: 64 }, () => ({
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0,
  }));

  const fallbackPattern: Pattern = {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4,
      originalPatternCount: 1,
      originalInstrumentCount: numInstruments,
    },
  };

  return {
    name: `${moduleName} [Jeroen Tel] (${numInstruments} smp)`,
    format: 'MOD' as TrackerFormat,
    patterns: [fallbackPattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
  };
}

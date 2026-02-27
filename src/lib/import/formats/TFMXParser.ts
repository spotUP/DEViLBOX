/**
 * TFMXParser.ts — TFMX Professional format parser
 *
 * TFMX (The Final Music eXpander) was created by Jochen Hippel for the Amiga.
 * This parser handles the TFMX Professional (mdat.*) format.
 *
 * File layout (from TFMX Professional 2.0 format documentation and
 * NostalgicPlayer TfmxIdentifier.cs):
 *
 *   0x000  10 bytes  Magic: "TFMX-SONG " (note trailing space)
 *   0x00A   2 bytes  Reserved word (ignored)
 *   0x00C   4 bytes  Reserved long (ignored)
 *   0x010 240 bytes  Text area (40×6 lines, null-padded)
 *   0x100  64 bytes  Song start positions (32 × u16BE)
 *   0x140  64 bytes  Song end positions (32 × u16BE)
 *   0x180  64 bytes  Song tempo values (32 × u16BE)
 *   0x1C0  16 bytes  Padding / reserved
 *   0x1D0  12 bytes  Packed-module offsets (3 × u32BE):
 *                      [0] trackstep ptr  (0 → use 0x600)
 *                      [1] pattern ptr    (0 → use 0x200)
 *                      [2] macro ptr      (0 → use 0x400)
 *   — followed by pattern data, macro data, trackstep data, sample data —
 *
 * TFMX Pro uses 4 PCM channels on the Amiga (Paula hardware).
 * TFMX 7-Voices uses 7.
 *
 * References:
 *   - Jonathan H. Pickard, "TFMX Professional 2.0 Song File Format" (1993-1998)
 *   - NostalgicPlayer TfmxIdentifier.cs / TfmxWorker.cs
 *   - libxmp docs/formats/tfmx-format.txt
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, InstrumentConfig } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Minimum file size: header (0x1D0) + some data. */
const TFMX_MIN_SIZE = 0x200;

/** Number of subsong slots in the song table. */
const TFMX_SONG_SLOTS = 32;

/** Fixed trackstep offset for unpacked modules (ptrs at 0x1D0 are zero). */
const TFMX_TRACKSTEP_UNPACKED = 0x600;


/** Bytes per trackstep entry: 8 voices × 2 bytes per voice entry. */
const TFMX_TRACKSTEP_ENTRY_SIZE = 16;

/** Stop-all marker in the trackstep (high byte of a word entry). */
const TFMX_TRACK_END = 0xFF;

/** Hold-previous marker. */
const TFMX_TRACK_HOLD = 0x80;

// ── Utilities ─────────────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  if (off + 1 >= buf.length) return 0;
  return (buf[off] << 8) | buf[off + 1];
}

function u32BE(buf: Uint8Array, off: number): number {
  if (off + 3 >= buf.length) return 0;
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

// ── Magic detection ───────────────────────────────────────────────────────────

/**
 * Scan the first 0x200 bytes for the TFMX magic.
 *
 * Known variants (from NostalgicPlayer TfmxIdentifier.cs lines 88-93):
 *   "TFMX-SONG " — TFMX Professional / TFMX 7-Voices
 *   "TFMX_SONG"  — alternative underscore separator
 *   "tfmxsong"   — lower-case variant
 *   "TFMX " (old) — TFMX 1.5 / early format (high byte T, 4th byte space)
 *   "TFHD"        — single-file TFHD wrapper (handled separately)
 *
 * Returns the byte offset of the start of the TFMX header, or -1 if not found.
 */
function findTFMXMagic(buf: Uint8Array): number {
  const limit = Math.min(0x200, buf.length - 10);
  for (let i = 0; i < limit; i++) {
    // Fast check: first byte must be 'T' (0x54) or 't' (0x74)
    const b0 = buf[i];
    if (b0 !== 0x54 && b0 !== 0x74) continue;

    // "TFMX-SONG " (10 bytes) — TFMX Pro / 7V
    if (
      buf[i + 0] === 0x54 && buf[i + 1] === 0x46 && buf[i + 2] === 0x4D && buf[i + 3] === 0x58 &&
      buf[i + 4] === 0x2D && buf[i + 5] === 0x53 && buf[i + 6] === 0x4F && buf[i + 7] === 0x4E &&
      buf[i + 8] === 0x47 && buf[i + 9] === 0x20
    ) {
      return i;
    }

    // "TFMX_SONG" (9 bytes, underscore variant)
    if (
      buf[i + 0] === 0x54 && buf[i + 1] === 0x46 && buf[i + 2] === 0x4D && buf[i + 3] === 0x58 &&
      buf[i + 4] === 0x5F && buf[i + 5] === 0x53 && buf[i + 6] === 0x4F && buf[i + 7] === 0x4E &&
      buf[i + 8] === 0x47
    ) {
      return i;
    }

    // "tfmxsong" (lower-case, 8 bytes)
    if (
      buf[i + 0] === 0x74 && buf[i + 1] === 0x66 && buf[i + 2] === 0x6D && buf[i + 3] === 0x78 &&
      buf[i + 4] === 0x73 && buf[i + 5] === 0x6F && buf[i + 6] === 0x6E && buf[i + 7] === 0x67
    ) {
      return i;
    }

    // Old TFMX 1.5: "TFMX " — 'T','F','M','X' then ' ' (0x20) then something ≠ 'S' and ≠ '_'
    // NostalgicPlayer check: (mark2 & 0xff000000) == 0x20000000 && mark3 != 'G' ('47')
    //   and (mark2 & 0x00ffffff) != 0x00534f4e ('SON')
    if (
      buf[i + 0] === 0x54 && buf[i + 1] === 0x46 && buf[i + 2] === 0x4D && buf[i + 3] === 0x58 &&
      buf[i + 4] === 0x20 && buf[i + 8] !== 0x47 &&
      !(buf[i + 5] === 0x53 && buf[i + 6] === 0x4F && buf[i + 7] === 0x4E)
    ) {
      return i;
    }
  }
  return -1;
}

export function isTFMXFile(buffer: ArrayBuffer): boolean {
  return findTFMXMagic(new Uint8Array(buffer)) >= 0;
}

// ── Note conversion ───────────────────────────────────────────────────────────

/**
 * Convert a TFMX pattern note byte to XM note number.
 * TFMX notes are 0-based period-table indices (0 = C-1 in Amiga terms).
 * Adding 13 maps Amiga index 24 (C-3, 428 Hz) to XM note 37 (C-3).
 */
function tfmxNoteToXM(noteIdx: number): number {
  return Math.max(1, Math.min(96, (noteIdx & 0x7F) + 13));
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseTFMXFile(
  buffer: ArrayBuffer,
  filename: string,
  subsong = 0,
): TrackerSong {
  const buf = new Uint8Array(buffer);

  // 1. Locate TFMX header
  const h = findTFMXMagic(buf);
  if (h < 0) throw new Error('[TFMXParser] Not a TFMX file (no magic found)');

  if (buf.length < TFMX_MIN_SIZE) {
    throw new Error('[TFMXParser] File too small to be a valid TFMX module');
  }

  // 2. Read song table at h+0x100 (32 starts, 32 ends, 32 tempos)
  const songStarts: number[] = [];
  const songEnds:   number[] = [];
  const songTempos: number[] = [];

  for (let i = 0; i < TFMX_SONG_SLOTS; i++) {
    songStarts.push(u16BE(buf, h + 0x100 + i * 2));
    songEnds.push(  u16BE(buf, h + 0x140 + i * 2));
    songTempos.push(u16BE(buf, h + 0x180 + i * 2));
  }

  // 3. Read section offsets at h+0x1D0 (three u32BE)
  let trackstepOff = u32BE(buf, h + 0x1D0);
  // Packed module offsets are absolute (from file start).
  // If zero → unpacked module, use fixed absolute offsets.
  if (trackstepOff === 0) trackstepOff = h + TFMX_TRACKSTEP_UNPACKED;

  // 4. Select subsong
  const clampedSong = Math.max(0, Math.min(TFMX_SONG_SLOTS - 1, subsong));
  let firstStep     = songStarts[clampedSong];
  let lastStep      = songEnds[clampedSong];
  const tempo       = songTempos[clampedSong];

  // Sanity-clamp: if the song table is corrupt, fall back to a single empty step
  if (firstStep > lastStep || firstStep > 0x3FFF || lastStep > 0x3FFF) {
    firstStep = 0;
    lastStep  = 0;
  }

  // 5. Build TrackerSong patterns from the trackstep table
  //
  // Each TFMX Pro trackstep entry is 16 bytes = 8 voices × 2 bytes.
  //   Word byte 0 (high): pattern number (or 0xFF = end, 0x80 = hold)
  //   Word byte 1 (low):  signed transpose (two's complement)
  //
  // TFMX Pro uses 4 hardware channels (Amiga Paula DMA).
  // We map the first 4 voices to channels 0-3.
  const NUM_CHANNELS = 4;
  const ROWS_PER_PATTERN = 32; // arbitrary display length for the stub pattern

  const trackerPatterns: Pattern[] = [];

  for (let stepIdx = firstStep; stepIdx <= lastStep; stepIdx++) {
    const stepOff = trackstepOff + stepIdx * TFMX_TRACKSTEP_ENTRY_SIZE;
    if (stepOff + TFMX_TRACKSTEP_ENTRY_SIZE > buf.length) break;

    // Read voice data for this step
    const voicePatNums: number[] = [];
    const voiceTransposes: number[] = [];
    let isEnd = false;

    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const hi = buf[stepOff + ch * 2];
      const lo = buf[stepOff + ch * 2 + 1];
      if (hi === TFMX_TRACK_END) { isEnd = true; break; }
      voicePatNums.push(hi === TFMX_TRACK_HOLD ? -1 : hi);
      voiceTransposes.push(lo < 128 ? lo : lo - 256);
    }

    if (isEnd) break;

    // Emit a single pattern row (note trigger from the trackstep)
    const channelRows: TrackerCell[][] = Array.from({ length: NUM_CHANNELS }, () => []);
    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const patNum = voicePatNums[ch] ?? 0;
        // Emit a trigger note only on row 0; subsequent rows are empty
        const xmNote = row === 0 && patNum >= 0 ? tfmxNoteToXM(patNum) : 0;
        channelRows[ch].push({
          note: xmNote,
          instrument: 0,
          volume: 0,
          effTyp: 0,
          eff: 0,
          effTyp2: 0,
          eff2: 0,
        });
      }
    }

    trackerPatterns.push({
      id:     `pattern-${trackerPatterns.length}`,
      name:   `Pattern ${trackerPatterns.length + 1}`,
      length: ROWS_PER_PATTERN,
      channels: channelRows.map((rows, ch) => ({
        id:           `channel-${ch}`,
        name:         `Channel ${ch + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          (ch === 0 || ch === 3) ? -50 : 50,
        instrumentId: null,
        color:        null,
        rows,
      })),
      importMetadata: {
        sourceFormat: 'TFMX',
        sourceFile:   filename,
        importedAt:   new Date().toISOString(),
        originalChannelCount:    NUM_CHANNELS,
        originalPatternCount:    lastStep - firstStep + 1,
        originalInstrumentCount: 0,
      },
    });
  }

  // Ensure at least one pattern
  if (trackerPatterns.length === 0) {
    const emptyRows: TrackerCell[] = Array.from({ length: ROWS_PER_PATTERN }, () => ({
      note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
    }));
    trackerPatterns.push({
      id:     'pattern-0',
      name:   'Pattern 0',
      length: ROWS_PER_PATTERN,
      channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
        id:           `channel-${ch}`,
        name:         `Channel ${ch + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          (ch === 0 || ch === 3) ? -50 : 50,
        instrumentId: null,
        color:        null,
        rows:         emptyRows,
      })),
      importMetadata: {
        sourceFormat: 'TFMX',
        sourceFile:   filename,
        importedAt:   new Date().toISOString(),
        originalChannelCount:    NUM_CHANNELS,
        originalPatternCount:    0,
        originalInstrumentCount: 0,
      },
    });
  }

  // 6. Determine initial BPM/speed from tempo value
  // Tempo > 15 → BPM value directly; otherwise → divisor of 50 Hz
  let initialBPM   = 125;
  let initialSpeed = 6;
  if (tempo > 15) {
    initialBPM = tempo;
  } else if (tempo > 0) {
    // Approximate: 50 Hz / (tempo+1) frames per row, BPM ≈ 50/(tempo+1)*2.5
    initialBPM   = Math.round(50 / (tempo + 1) * 2.5);
    initialSpeed = tempo + 1;
  }

  // 7. No instrument metadata extractable at this level (macros require
  //    full TFMX engine emulation).  Leave instruments empty.
  const instruments: InstrumentConfig[] = [];

  return {
    name:            filename.replace(/\.[^/.]+$/, ''),
    format:          'TFMX' as TrackerFormat,
    patterns:        trackerPatterns,
    instruments,
    songPositions:   trackerPatterns.map((_, i) => i),
    songLength:      trackerPatterns.length,
    restartPosition: 0,
    numChannels:     NUM_CHANNELS,
    initialSpeed,
    initialBPM,
    linearPeriods:   false,
  };
}

/**
 * PeterVerswyvelenPackerParser.ts — Peter Verswyvelen Packer Amiga music format native parser
 *
 * Peter Verswyvelen Packer is a Wanted Team Amiga packed music format. Detection
 * is performed by validating 31 sample header blocks (8 bytes each) followed by
 * a metadata block with pattern count, song length, and a non-decreasing step table.
 *
 * Detection (from UADE Peter Verswyvelen Packer_2.asm Check2 routine):
 *   31 sample headers at offsets i*8 (i=0..30), each 8 bytes:
 *     word 0 at i*8+0: bit 15 clear (non-negative)
 *     word 1 at i*8+2: <= 64 and bit 15 clear
 *     word 2 at i*8+4: bit 15 clear
 *     word 3 at i*8+6: bit 15 clear
 *   At offset 248: patCount — non-zero, bit 15 clear
 *   At offset 250: songLen  — non-zero, bit 15 clear, must be even
 *   At offset 252: val252   — songLen must be strictly less than val252
 *   At offset 254: limit    — non-zero, bit 15 clear
 *   Step table starting at offset 256: (patCount - 2) words, each must be
 *     even, bit 15 clear, <= limit, and non-decreasing
 *
 * Binary layout:
 *   0x00-0xF7: 31 sample headers × 8 bytes each
 *     +0: u16BE length (in words), +2: u16BE volume (0-64),
 *     +4: u16BE repeat offset (in words), +6: u16BE repeat length (in words)
 *   0xF8: u16BE patCount (number of patterns)
 *   0xFA: u16BE songLen (number of positions × 2, i.e. songLen/2 positions)
 *   0xFC: u16BE val252 (unused for extraction)
 *   0xFE: u16BE limit
 *   0x100: Step table — (patCount - 2) words, non-decreasing offsets
 *   After step table: pattern data (each pattern = 64 rows × 4 channels × 4 bytes)
 *
 * Pattern cell format (4 bytes, standard MOD-like):
 *   byte 0: upper 4 bits = instrument high nibble, lower 4 bits = period high byte (bits 8-11)
 *   byte 1: period low byte (bits 0-7)
 *   byte 2: upper 4 bits = instrument low nibble, lower 4 bits = effect type
 *   byte 3: effect parameter
 *
 * File prefix: "PVP."
 * Actual audio playback is delegated to UADE.
 *
 * Reference: third-party/uade-3.05/amigasrc/players/wanted_team/PeterVerswyvelenPacker/Peter Verswyvelen Packer_2.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern, TrackerCell, ChannelData } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeMODCell } from '@/engine/uade/encoders/MODEncoder';

// ── Constants ───────────────────────────────────────────────────────────────

const MIN_FILE_SIZE = 260;
const NUM_CHANNELS = 4;
const ROWS_PER_PATTERN = 64;
const BYTES_PER_CELL = 4;
const NUM_SAMPLES = 31;

/** PVP period table from assembly source. */
const PVP_PERIODS = [
  0x358, 0x328, 0x2FA, 0x2D0, 0x2A6, 0x280, 0x25C, 0x23A, 0x21A, 0x1FC, 0x1E0, 0x1C5,
  0x1AC, 0x194, 0x17D, 0x168, 0x153, 0x140, 0x12E, 0x11D, 0x10D, 0x0FE, 0x0F0, 0x0E2,
  0x0D6, 0x0CA, 0x0BE, 0x0B4, 0x0AA, 0x0A0, 0x097, 0x08F, 0x087, 0x07F, 0x078, 0x071,
];

// ── Binary helpers ──────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

// ── Note conversion ─────────────────────────────────────────────────────────

/**
 * Convert an Amiga period value to a tracker note (1-96, FT2 style).
 * Searches the PVP period table for the closest match.
 * Period table index 0 = C-1 (ProTracker) = tracker note 1.
 */
function periodToNote(period: number): number {
  if (period === 0) return 0;
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < PVP_PERIODS.length; i++) {
    const dist = Math.abs(PVP_PERIODS[i] - period);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return 0;
  // PVP period table: index 0 = C-1 in ProTracker = C-2 in FT2 = note 13
  // Actually: 3 octaves × 12 notes. index 0 = lowest = C-1 (PT) = note 1 (XM C-0)
  // Standard mapping: FT2 note 1 = C-0. PT C-1 = FT2 C-1 = note 13.
  const note = bestIdx + 13;
  return (note >= 1 && note <= 96) ? note : 0;
}

// ── Format detection ────────────────────────────────────────────────────────

export function isPeterVerswyvelenPackerFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // Validate 31 sample headers, 8 bytes each, at offsets i*8 for i=0..30
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const base = i * 8;

    // word 0: bit 15 must be clear (value < 0x8000)
    if ((u16BE(buf, base) & 0x8000) !== 0) return false;

    // word 1: must be <= 64 and bit 15 clear
    const w1 = u16BE(buf, base + 2);
    if (w1 > 0x40) return false;
    if ((w1 & 0x8000) !== 0) return false;

    // word 2: bit 15 must be clear
    if ((u16BE(buf, base + 4) & 0x8000) !== 0) return false;

    // word 3: bit 15 must be clear
    if ((u16BE(buf, base + 6) & 0x8000) !== 0) return false;
  }

  // offset 248: patCount — non-zero, bit 15 clear
  const patCount = u16BE(buf, 248);
  if (patCount === 0) return false;
  if ((patCount & 0x8000) !== 0) return false;

  // offset 250: songLen — non-zero, bit 15 clear, must be even
  const songLen = u16BE(buf, 250);
  if (songLen === 0) return false;
  if ((songLen & 0x8000) !== 0) return false;
  if ((songLen & 1) !== 0) return false;

  // offset 252: val252 — songLen must be strictly less than val252
  const val252 = u16BE(buf, 252);
  if (songLen >= val252) return false;

  // offset 254: limit — non-zero, bit 15 clear
  const limit = u16BE(buf, 254);
  if (limit === 0) return false;
  if ((limit & 0x8000) !== 0) return false;

  // Step table at offset 256: (patCount - 2) words
  // Guard against patCount < 2 (would make stepCount negative — skip loop)
  if (patCount >= 2) {
    const stepCount = patCount - 2;
    const stepTableEnd = 256 + stepCount * 2;
    if (buf.length < stepTableEnd) return false;

    for (let i = 0; i < stepCount; i++) {
      const s = u16BE(buf, 256 + i * 2);

      // Each step: bit 15 clear, even, <= limit
      if ((s & 0x8000) !== 0) return false;
      if ((s & 1) !== 0) return false;
      if (s > limit) return false;

      // Non-decreasing: each step must be <= the next step
      if (i < stepCount - 1) {
        const next = u16BE(buf, 258 + i * 2);
        if (s > next) return false;
      }
    }
  }

  return true;
}

// ── Pattern extraction ──────────────────────────────────────────────────────

/**
 * Parse a single 4-byte MOD-like pattern cell.
 * Returns { period, instrument, effTyp, eff }.
 */
function parseCell(buf: Uint8Array, off: number): { period: number; instrument: number; effTyp: number; eff: number } {
  const b0 = buf[off];
  const b1 = buf[off + 1];
  const b2 = buf[off + 2];
  const b3 = buf[off + 3];
  const instrument = (b0 & 0xF0) | ((b2 >> 4) & 0x0F);
  const period = ((b0 & 0x0F) << 8) | b1;
  const effTyp = b2 & 0x0F;
  const eff = b3;
  return { period, instrument, effTyp, eff };
}

/**
 * Extract patterns from the PVP binary. The step table entries are offsets
 * that map song positions to pattern data. Unique offsets correspond to
 * unique patterns.
 */
function extractPVPPatterns(
  buf: Uint8Array,
  patCount: number,
  songLen: number,
): { patterns: Pattern[]; songPositions: number[]; instrumentCount: number } | null {
  const stepCount = patCount >= 2 ? patCount - 2 : 0;
  const stepTableStart = 0x100; // offset 256
  const patternDataStart = stepTableStart + stepCount * 2;

  // Read step table entries (offsets into pattern data)
  const stepEntries: number[] = [];
  for (let i = 0; i < stepCount; i++) {
    stepEntries.push(u16BE(buf, stepTableStart + i * 2));
  }

  // Build unique pattern offsets and a position-to-pattern map
  // Each step table entry is a byte offset relative to pattern data start (shifted).
  // Deduplicate to get unique patterns.
  const uniqueOffsets: number[] = [];
  const offsetToPatIdx = new Map<number, number>();
  for (const off of stepEntries) {
    if (!offsetToPatIdx.has(off)) {
      offsetToPatIdx.set(off, uniqueOffsets.length);
      uniqueOffsets.push(off);
    }
  }

  // Song positions: songLen is stored as 2× actual positions
  const numPositions = Math.floor(songLen / 2);
  const songPositions: number[] = [];
  for (let i = 0; i < numPositions && i < stepEntries.length; i++) {
    songPositions.push(offsetToPatIdx.get(stepEntries[i]) ?? 0);
  }
  if (songPositions.length === 0) songPositions.push(0);

  // Parse each unique pattern
  const patternSize = ROWS_PER_PATTERN * NUM_CHANNELS * BYTES_PER_CELL; // 1024 bytes
  const patterns: Pattern[] = [];
  let maxInstrument = 0;

  for (let p = 0; p < uniqueOffsets.length; p++) {
    // The step entry offset may be a shifted value — try as direct byte offset first
    const dataOff = patternDataStart + uniqueOffsets[p];
    if (dataOff + patternSize > buf.length) continue;

    const channels: ChannelData[] = [];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const rows: TrackerCell[] = [];
      for (let r = 0; r < ROWS_PER_PATTERN; r++) {
        const cellOff = dataOff + (r * NUM_CHANNELS + ch) * BYTES_PER_CELL;
        if (cellOff + BYTES_PER_CELL > buf.length) {
          rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          continue;
        }
        const cell = parseCell(buf, cellOff);
        const note = periodToNote(cell.period);
        if (cell.instrument > maxInstrument) maxInstrument = cell.instrument;
        rows.push({
          note,
          instrument: cell.instrument,
          volume: 0,
          effTyp: cell.effTyp,
          eff: cell.eff,
          effTyp2: 0,
          eff2: 0,
        });
      }
      channels.push({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: (ch === 0 || ch === 3) ? -50 : 50,
        instrumentId: null,
        color: null,
        rows,
      });
    }

    patterns.push({
      id: `pattern-${p}`,
      name: `Pattern ${p}`,
      length: ROWS_PER_PATTERN,
      channels,
    });
  }

  if (patterns.length === 0) return null;

  // Count notes to verify we actually extracted something meaningful
  let totalNotes = 0;
  for (const pat of patterns) {
    for (const ch of pat.channels) {
      for (const row of ch.rows) {
        if (row.note > 0 && row.note < 97) totalNotes++;
      }
    }
  }
  if (totalNotes === 0) return null;

  return { patterns, songPositions, instrumentCount: maxInstrument };
}

// ── Main parser ─────────────────────────────────────────────────────────────

export function parsePeterVerswyvelenPackerFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isPeterVerswyvelenPackerFormat(buf)) throw new Error('Not a Peter Verswyvelen Packer module');

  const baseName = (filename.split('/').pop() ?? filename).split('\\').pop() ?? filename;
  const moduleName = baseName.replace(/^pvp\./i, '') || baseName;

  // ── Parse sample headers ────────────────────────────────────────────────
  const patCount = u16BE(buf, 248);
  const songLen = u16BE(buf, 250);

  const instruments: InstrumentConfig[] = [];
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const base = i * 8;
    const length = u16BE(buf, base) * 2;     // length in words → bytes
    const volume = u16BE(buf, base + 2);
    if (length > 0) {
      instruments.push({
        id: i + 1,
        name: `Sample ${i + 1}`,
        type: 'synth' as const,
        synthType: 'Synth' as const,
        effects: [],
        volume: Math.min(64, volume),
        pan: 0,
      } as InstrumentConfig);
    }
  }

  // ── Extract patterns ──────────────────────────────────────────────────────
  let patterns: Pattern[] = [];
  let songPositions: number[] = [0];

  const extracted = extractPVPPatterns(buf, patCount, songLen);
  if (extracted) {
    patterns = extracted.patterns;
    songPositions = extracted.songPositions;

    // Ensure we have at least as many instruments as referenced in patterns
    while (instruments.length < extracted.instrumentCount) {
      instruments.push({
        id: instruments.length + 1,
        name: `Sample ${instruments.length + 1}`,
        type: 'synth' as const,
        synthType: 'Synth' as const,
        effects: [],
        volume: 0,
        pan: 0,
      } as InstrumentConfig);
    }
  }

  // Fallback: empty pattern if extraction failed
  if (patterns.length === 0) {
    const emptyRows: TrackerCell[] = Array.from({ length: ROWS_PER_PATTERN }, () => ({
      note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
    }));
    patterns = [{
      id: 'pattern-0',
      name: 'Pattern 0',
      length: ROWS_PER_PATTERN,
      channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: (ch === 0 || ch === 3) ? -50 : 50,
        instrumentId: null,
        color: null,
        rows: emptyRows.map(r => ({ ...r })),
      })),
    }];
    songPositions = [0];
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
  }

  const extractInfo = patterns.length > 1
    ? ` (${patterns.length} pat, ${instruments.length} smp)`
    : '';

  return {
    name: `${moduleName} [Peter Verswyvelen Packer]${extractInfo}`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: {
      formatId: 'mod',
      patternDataFileOffset: 1084,
      bytesPerCell: 4,
      rowsPerPattern: ROWS_PER_PATTERN,
      numChannels: NUM_CHANNELS,
      numPatterns: patterns.length,
      moduleSize: buffer.byteLength,
      encodeCell: encodeMODCell,
    } satisfies UADEPatternLayout,
  };
}

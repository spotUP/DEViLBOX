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
 * Binary layout (nuade third-party/nuade/players/peterverswyvelen/peterverswyvelen.c):
 *   0x00-0xF7: 31 sample headers x 8 bytes (length words, volume, loop start words, loop words)
 *   0xF8: table count, 0xFA: sequence count, 0xFC: restart entry, 0xFE: pattern data bytes
 *   0x100: table of (table count) words, byte offsets into pattern data
 *   then sequence entries of 4 words, one per voice: a byte index into the table
 *   then pattern data: run-length coded 4-byte notes, 16 rows per table pattern
 *   (cell layout: src/engine/uade/encoders/PeterVerswyvelenPackerEncoder.ts)
 *
 * File prefix: "PVP."
 * Actual audio playback is delegated to UADE.
 *
 * Reference: third-party/uade-3.05/amigasrc/players/wanted_team/PeterVerswyvelenPacker/Peter Verswyvelen Packer_2.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern, TrackerCell, ChannelData } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { decodePeterVerswyvelenPackerCell, encodePeterVerswyvelenPackerCell } from '@/engine/uade/encoders/PeterVerswyvelenPackerEncoder';

// ── Constants ───────────────────────────────────────────────────────────────

const MIN_FILE_SIZE = 260;
const NUM_CHANNELS = 4;
const ROWS_PER_PATTERN = 16; // PV_PATTERN_ROWS
const BYTES_PER_CELL = 4;
const NUM_SAMPLES = 31;

// ── Binary helpers ──────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
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

  // offset 252: val252 - the player faults when songLen <= val252 (asm Check2: cmp.w (A0)+,D2; bls Fault)
  const val252 = u16BE(buf, 252);
  if (songLen <= val252) return false;

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

const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

/**
 * Layout per nuade peterverswyvelen.c: a word table at 0x100 (tableCount words,
 * byte offsets into pattern data), then seqCount sequence entries of 4 words
 * (one per voice, a byte index into the table), then patternBytes of
 * run-length coded notes. Every 16 rows each voice reads the table pattern its
 * sequence word names; a note covers 1 + duration rows. One grid pattern per
 * distinct sequence entry; the run-start row is the stored cell, the rows it
 * repeats on show its copy (sounding) or stay empty, with no file place.
 */
function extractPVPPatterns(
  buf: Uint8Array,
  tableCount: number,
  seqCount: number,
): { patterns: Pattern[]; songPositions: number[]; instrumentCount: number; cellOffsets: number[][] } | null {
  const tableAt = 0x100;
  const seqAt = tableAt + tableCount * 2;
  const patAt = seqAt + seqCount * 8;
  const patEnd = patAt + u16BE(buf, 0xfe);
  if (patEnd > buf.length) return null;

  const keyToPat = new Map<string, number>();
  const patterns: Pattern[] = [];
  const cellOffsets: number[][] = [];
  const songPositions: number[] = [];
  let maxInstrument = 0;

  for (let s = 0; s < seqCount; s++) {
    const words = [0, 1, 2, 3].map(v => u16BE(buf, seqAt + s * 8 + v * 2));
    const key = words.join(',');
    let idx = keyToPat.get(key);
    if (idx === undefined) {
      idx = patterns.length;
      keyToPat.set(key, idx);
      const offsets = new Array<number>(ROWS_PER_PATTERN * NUM_CHANNELS).fill(-1);
      const channels: ChannelData[] = words.map((w, ch) => {
        const rows: TrackerCell[] = [];
        let p = tableAt + w + 2 <= seqAt ? patAt + u16BE(buf, tableAt + w) : patEnd;
        while (rows.length < ROWS_PER_PATTERN && p + BYTES_PER_CELL <= patEnd) {
          const bytes = buf.subarray(p, p + BYTES_PER_CELL);
          const cell = decodePeterVerswyvelenPackerCell(bytes);
          if (cell.instrument > maxInstrument) maxInstrument = cell.instrument;
          offsets[rows.length * NUM_CHANNELS + ch] = p;
          rows.push(cell);
          const sounding = (bytes[0] & 0x04) !== 0;
          for (let d = bytes[2] >> 4; d > 0 && rows.length < ROWS_PER_PATTERN; d--) {
            rows.push(sounding ? { ...cell } : emptyCell());
          }
          p += BYTES_PER_CELL;
        }
        while (rows.length < ROWS_PER_PATTERN) rows.push(emptyCell());
        return {
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
        };
      });
      patterns.push({ id: `pattern-${idx}`, name: `Pattern ${idx}`, length: ROWS_PER_PATTERN, channels });
      cellOffsets.push(offsets);
    }
    songPositions.push(idx);
  }

  const totalNotes = patterns.reduce((n, pat) => n + pat.channels.reduce((m, c) => m + c.rows.filter(r => r.note > 0 && r.note < 97).length, 0), 0);
  if (totalNotes === 0) return null;
  return { patterns, songPositions, instrumentCount: maxInstrument, cellOffsets };
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
        name: '',
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
  let cellOffsets: number[][] = [];

  const extracted = extractPVPPatterns(buf, patCount, songLen);
  if (extracted) {
    patterns = extracted.patterns;
    songPositions = extracted.songPositions;
    cellOffsets = extracted.cellOffsets;

    // Ensure we have at least as many instruments as referenced in patterns
    while (instruments.length < extracted.instrumentCount) {
      instruments.push({
        id: instruments.length + 1,
        name: '',
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
        name: '',
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
      formatId: 'peterVerswyvelenPacker',
      patternDataFileOffset: cellOffsets[0]?.find(o => o >= 0) ?? 0,
      bytesPerCell: 4,
      rowsPerPattern: ROWS_PER_PATTERN,
      numChannels: NUM_CHANNELS,
      numPatterns: patterns.length,
      moduleSize: buffer.byteLength,
      encodeCell: encodePeterVerswyvelenPackerCell,
      encodeOverStored: true,
      decodeCell: decodePeterVerswyvelenPackerCell,
      // Run-start rows hold their note's file offset; repeat rows and the empty fallback pattern have no file place.
      getCellFileOffset: (pat, row, ch) => cellOffsets[pat]?.[row * NUM_CHANNELS + ch] ?? -1,
      propagateSharedCells: true,
    } satisfies UADEPatternLayout,
  };
}

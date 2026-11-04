/**
 * jxsGrid.ts - JayTrax (.jxs) module carrier and grid mapping.
 *
 * File layout (little endian): 52 byte header (s16 version 3456 or 3457, s32 pattern
 * count P at 4, s32 subsong count S at 8, s32 instrument count I at 12), S subsongs of
 * 16564 bytes, P patterns of 64 rows x 5 bytes, P pattern names (s32 length + bytes),
 * I instruments of 8712 bytes each followed by its sample when the u32 at 512 is set
 * (length at 516), and a 256 byte arpeggio table.
 *
 * A subsong carries up to 16 channels, each with its own order list of 256 entries
 * {s16 pattern, s16 length} at 180 + 1024 * channel + 4 * entry. An entry plays the first
 * `length` rows of its pattern. The grid lays subsong 0 on the shared timeline: grid
 * pattern b is timeline rows 64b..64b+63, and a channel's cell there is the row of the
 * pattern its order entry puts on that timeline row.
 *
 * The carrier is the original image. Edits are shared-pattern edits: a cell that differs
 * from what the file shows is written into the pattern row it came from (every other
 * placement of that pattern changes with it), all other bytes are carried.
 */
import type { TrackerCell } from '@/types';

export const JXS_ROWS = 64;
/** effTyp2 marker: eff2 holds the signed script parameter byte of the row. */
export const JXS_PARAM_EFFECT = 0x7f;

const HEADER = 52;
const SUBSONG = 16564;
const INSTRUMENT = 8712;
const ROW = 5;

const u16 = (b: Uint8Array, o: number): number => b[o] | (b[o + 1] << 8);
const s16 = (b: Uint8Array, o: number): number => (u16(b, o) << 16) >> 16;
const s32 = (b: Uint8Array, o: number): number => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) | 0;

export interface JxsSegment { start: number; length: number; pattern: number }

export interface JxsModule {
  image: Uint8Array;
  version: number;
  patterns: number;
  subsongs: number;
  instruments: number;
  channels: number;
  bpm: number;
  title: string;
  /** Byte offset of pattern 0 row 0. */
  patternOffset: number;
  /** Per channel, the order entries of subsong 0 with their timeline start. */
  segments: JxsSegment[][];
  /** Grid patterns (64 timeline rows each). */
  bars: number;
  /** Subsong 0 play range (bars/steps, as the engine reads them at +88..+112), clamped into the grid. */
  startBar: number;
  startStep: number;
  endBar: number;
  endStep: number;
  loopBar: number;
  loopStep: number;
  loopFlag: number;
}

/**
 * The bars one pass of subsong 0 plays, as the engine runs it (jxs_engine.cpp tick + openSong): it starts at
 * startBar/startStep and stops BEFORE the row at endBar/endStep, so a bar whose end position is step 0 is not
 * played. The engine never jumps to the loop bar during a pass (it sets ended there), so a replay restarts at
 * startBar. Shared by the parser (songPositions) and JxsEngine (bar -> songPos).
 */
export function jxsPlayRange(m: JxsModule): { firstBar: number; lastBar: number } {
  const lastBar = Math.max(m.startBar, m.endStep === 0 ? m.endBar - 1 : m.endBar);
  return { firstBar: m.startBar, lastBar };
}

/** Decode the file; null when it is not a complete JayTrax module. */
export function decodeJxsModule(bytes: Uint8Array): JxsModule | null {
  if (bytes.length < HEADER) return null;
  const version = u16(bytes, 0);
  if (version !== 3456 && version !== 3457) return null;
  const P = s32(bytes, 4), S = s32(bytes, 8), I = s32(bytes, 12);
  if (S < 1 || S > 256 || P < 0 || P > 65536 || I < 0 || I > 4096) return null;
  let off = HEADER;
  const subOff = off;
  off += S * SUBSONG;
  const patternOffset = off;
  off += P * 64 * ROW;
  if (off > bytes.length) return null;
  for (let p = 0; p < P; p++) {
    if (off + 4 > bytes.length) return null;
    const n = s32(bytes, off);
    if (n < 0 || n > 4096) return null;
    off += 4 + n;
    if (off > bytes.length) return null;
  }
  for (let i = 0; i < I; i++) {
    if (off + INSTRUMENT > bytes.length) return null;
    const has = s32(bytes, off + 512) !== 0;
    const len = s32(bytes, off + 516);
    off += INSTRUMENT;
    if (has) {
      if (len < 0 || off + len > bytes.length) return null;
      off += len;
    }
  }
  if (off + 256 > bytes.length) return null;

  const channels = s16(bytes, subOff + 146);
  if (channels < 1 || channels > 16) return null;
  const segments: JxsSegment[][] = [];
  let rows = 0;
  for (let c = 0; c < channels; c++) {
    const list: JxsSegment[] = [];
    let start = 0;
    for (let k = 0; k < 256; k++) {
      const at = subOff + 180 + 1024 * c + 4 * k;
      const length = s16(bytes, at + 2);
      if (length <= 0) continue;
      list.push({ start, length, pattern: s16(bytes, at) });
      start += length;
    }
    rows = Math.max(rows, start);
    segments.push(list);
  }
  let title = '';
  for (let i = 0; i < 32 && bytes[subOff + 114 + i]; i++) title += String.fromCharCode(bytes[subOff + 114 + i]);
  const bars = Math.max(1, Math.ceil(rows / JXS_ROWS));
  const clampBar = (v: number, lo: number): number => Math.min(bars - 1, Math.max(lo, v));
  const clampStep = (v: number): number => Math.min(JXS_ROWS - 1, Math.max(0, v));
  const endBar = clampBar(s32(bytes, subOff + 96), 0);
  const startBar = Math.min(clampBar(s32(bytes, subOff + 88), 0), endBar);
  const loopBar = Math.min(clampBar(s32(bytes, subOff + 104), 0), endBar);
  return {
    startBar, startStep: clampStep(s32(bytes, subOff + 92)),
    endBar, endStep: clampStep(s32(bytes, subOff + 100)),
    loopBar, loopStep: clampStep(s32(bytes, subOff + 108)), loopFlag: s16(bytes, subOff + 112),
    image: bytes, version, patterns: P, subsongs: S, instruments: I, channels,
    bpm: s32(bytes, subOff + 80), title, patternOffset, segments,
    bars,
  };
}

export const isJxsModule = (bytes: Uint8Array): boolean => decodeJxsModule(bytes) !== null;

/** The pattern row that timeline row `t` of a channel plays: [pattern, row], or null. */
export function jxsPlacement(m: JxsModule, channel: number, t: number): [number, number] | null {
  const list = m.segments[channel];
  if (!list) return null;
  for (const s of list) {
    if (t >= s.start && t < s.start + s.length) {
      return s.pattern >= 0 && s.pattern < m.patterns && t - s.start < JXS_ROWS ? [s.pattern, t - s.start] : null;
    }
  }
  return null;
}

const rowAt = (m: JxsModule, pattern: number, row: number): number => m.patternOffset + (pattern * 64 + row) * ROW;

/** The grid cell of a pattern row. */
export function jxsRowCell(image: Uint8Array, m: JxsModule, pattern: number, row: number): TrackerCell {
  const o = rowAt(m, pattern, row);
  const param = image[o + 3];
  return {
    note: image[o], instrument: image[o + 2], volume: 0,
    effTyp: image[o + 4], eff: image[o + 1],
    effTyp2: param !== 0 ? JXS_PARAM_EFFECT : 0, eff2: param,
  };
}

export interface JxsGridEdit { pattern: number; row: number; channel: number; cell: TrackerCell }

const same = (a: TrackerCell, b: TrackerCell): boolean =>
  (a.note ?? 0) === (b.note ?? 0) && (a.instrument ?? 0) === (b.instrument ?? 0) &&
  (a.effTyp ?? 0) === (b.effTyp ?? 0) && (a.eff ?? 0) === (b.eff ?? 0) &&
  (a.effTyp2 ?? 0) === (b.effTyp2 ?? 0) && (a.eff2 ?? 0) === (b.eff2 ?? 0);

/**
 * The file bytes with grid edits written into the pattern rows they sit on; the same
 * array when no cell differs from what it shows. Cells off the timeline are ignored.
 */
export function applyJxsGridEdits(bytes: Uint8Array, edits: readonly JxsGridEdit[]): Uint8Array {
  const m = decodeJxsModule(bytes);
  if (!m) return bytes;
  const out = bytes.slice();
  let changed = false;
  for (const e of edits) {
    const where = jxsPlacement(m, e.channel, e.pattern * JXS_ROWS + e.row);
    if (!where) continue;
    const before = jxsRowCell(bytes, m, where[0], where[1]);
    const c = e.cell;
    if (same(before, c)) continue;
    const o = rowAt(m, where[0], where[1]);
    out[o] = Math.min(127, c.note ?? 0);
    out[o + 1] = (c.eff ?? 0) & 0xff;
    out[o + 2] = (c.instrument ?? 0) & 0xff;
    out[o + 3] = (c.effTyp2 ?? 0) === JXS_PARAM_EFFECT ? (c.eff2 ?? 0) & 0xff : 0;
    out[o + 4] = (c.effTyp ?? 0) & 0xff;
    changed = true;
  }
  return changed ? out : bytes;
}

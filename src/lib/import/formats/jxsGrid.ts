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
import { jxsLayout, JXS_SUBSONG_BYTES } from './jxsInstrument';
import {
  JX_AUX, JX_FX_BASE, JX_RAW_BASE, JX_SINGLE_SCRIPTS, JX_SLOT_BASE, JX_SLOT_FIELDS, JX_WAVE_RESET,
} from './jxsEffectGlyphs';

export const JXS_ROWS = 64;

const ROW = 5;

const u16 = (b: Uint8Array, o: number): number => b[o] | (b[o + 1] << 8);
const s16 = (b: Uint8Array, o: number): number => (u16(b, o) << 16) >> 16;
const s32 = (b: Uint8Array, o: number): number => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) | 0;

export interface JxsSegment { start: number; length: number; pattern: number }

export interface JxsModule {
  image: Uint8Array;
  /** The subsong this grid lays out (0-based); `subsongs` is how many the file holds. */
  subsong: number;
  version: number;
  patterns: number;
  subsongs: number;
  instruments: number;
  /** Instrument names as stored (32 bytes at +2 of each instrument record, up to the first NUL). */
  instrumentNames: string[];
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

/**
 * Decode the file as subsong `subsong` (0-based); null when it is not a complete JayTrax module or has no such subsong.
 * Every subsong shares the patterns and instruments; only its order lists, header fields and play range differ.
 */
export function decodeJxsModule(bytes: Uint8Array, subsong = 0): JxsModule | null {
  const lay = jxsLayout(bytes);
  if (!lay || subsong < 0 || subsong >= lay.subsongs) return null;
  const subOff = lay.subsongOffset + subsong * JXS_SUBSONG_BYTES;
  const patternOffset = lay.patternOffset;
  const version = lay.version;
  const P = lay.patterns, S = lay.subsongs, I = lay.instruments;
  const instrumentNames: string[] = lay.instrumentOffset.map((q) => {
    let name = '';
    for (let k = 0; k < 32 && bytes[q + 2 + k]; k++) name += String.fromCharCode(bytes[q + 2 + k]);
    return name;
  });

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
    image: bytes, subsong, version, patterns: P, subsongs: S, instruments: I, instrumentNames, channels,
    bpm: s32(bytes, subOff + 80), title, patternOffset, segments,
    bars,
  };
}

export const isJxsModule = (bytes: Uint8Array): boolean => decodeJxsModule(bytes) !== null;

/** Does subsong `subsong` start a note: any of its placed pattern rows carries one (the grid's own walk). */
export function jxsSubsongAudible(bytes: Uint8Array, subsong: number): boolean {
  const m = decodeJxsModule(bytes, subsong);
  if (!m) return false;
  return m.segments.some((list) => list.some((s) => {
    if (s.pattern < 0 || s.pattern >= m.patterns) return false;
    for (let r = 0; r < Math.min(s.length, JXS_ROWS); r++) if (bytes[m.patternOffset + (s.pattern * 64 + r) * ROW] > 0) return true;
    return false;
  }));
}

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

/**
 * The ONE place the JayTrax note offset lives. The replayer's frequency table sounds raw note n at
 * MIDI n - 36, and the XM label (note 1 = C-0 = MIDI 12) therefore names it at XM n - 47: raw 48 is C-0,
 * raw 72 is C-2. Raw notes 1..47 sound below the grid's range and have no grid note (they show empty).
 */
export const JXS_RAW_NOTE_OFFSET = 47;

/** Grid (XM) note of a raw row note; 0 for no note or a raw note below the grid's range. */
export const jxsRawToGridNote = (raw: number): number => (raw > JXS_RAW_NOTE_OFFSET ? raw - JXS_RAW_NOTE_OFFSET : 0);

/** Raw row note of a grid (XM) note; 0 stays 0. */
export const jxsGridNoteToRaw = (note: number): number => (note > 0 ? note + JXS_RAW_NOTE_OFFSET : 0);

const rowAt = (m: JxsModule, pattern: number, row: number): number => m.patternOffset + (pattern * 64 + row) * ROW;

const SINGLE = new Set<number>(JX_SINGLE_SCRIPTS);

/** A script byte jxs_engine.cpp script() ignores (0 and 76..255): the row's d and p do nothing. */
const inertScript = (sc: number): boolean => !SINGLE.has(sc) && (sc < 14 || sc > 73);

/** The grid cell of a pattern row (layout: jxsEffectGlyphs.ts). */
export function jxsRowCell(image: Uint8Array, m: JxsModule, pattern: number, row: number): TrackerCell {
  const o = rowAt(m, pattern, row);
  const d = image[o + 1], p = image[o + 3], sc = image[o + 4];
  const cell: TrackerCell = { note: jxsRawToGridNote(image[o]), instrument: image[o + 2], volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
  if (inertScript(sc)) return cell;
  if (SINGLE.has(sc)) {
    cell.effTyp = JX_FX_BASE + sc; cell.eff = d;
    if (p !== 0) { cell.effTyp2 = JX_AUX; cell.eff2 = p; }
  } else if (p === 0 && sc >= 14 && sc <= 57) {
    cell.effTyp = JX_SLOT_BASE + ((sc - 14) % JX_SLOT_FIELDS); cell.eff = d;
    cell.effTyp2 = JX_AUX; cell.eff2 = Math.floor((sc - 14) / JX_SLOT_FIELDS);
  } else if (p === 0 && sc >= 58 && sc <= 73) {
    cell.effTyp = JX_WAVE_RESET; cell.eff = d;
    cell.effTyp2 = JX_AUX; cell.eff2 = sc - 58;
  } else {
    cell.effTyp = JX_RAW_BASE + sc; cell.eff = d;
    if (p !== 0) { cell.effTyp2 = JX_AUX; cell.eff2 = p; }
  }
  return cell;
}

/** The row bytes {d, p, script} of a grid cell: the inverse of jxsRowCell. */
function jxsCellScript(c: TrackerCell): { d: number; p: number; sc: number } {
  const t = c.effTyp ?? 0, d = (c.eff ?? 0) & 0xff;
  const sel = (c.effTyp2 ?? 0) === JX_AUX ? (c.eff2 ?? 0) & 0xff : 0;
  if (t >= JX_RAW_BASE && t < JX_RAW_BASE + 256) return { d, p: sel, sc: t - JX_RAW_BASE };
  if (t >= JX_SLOT_BASE && t < JX_SLOT_BASE + JX_SLOT_FIELDS) return { d, p: 0, sc: 14 + (sel & 3) * JX_SLOT_FIELDS + (t - JX_SLOT_BASE) };
  if (t === JX_WAVE_RESET) return { d, p: 0, sc: 58 + (sel & 15) };
  if (t > JX_FX_BASE && t < JX_FX_BASE + 256 && SINGLE.has(t - JX_FX_BASE)) return { d, p: sel, sc: t - JX_FX_BASE };
  return { d, p: 0, sc: 0 };
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
export function applyJxsGridEdits(bytes: Uint8Array, edits: readonly JxsGridEdit[], subsong = 0): Uint8Array {
  const m = decodeJxsModule(bytes, subsong);
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
    // An unedited note keeps its byte (raw notes under 48 have no grid note and must survive).
    if ((c.note ?? 0) !== before.note) out[o] = Math.min(127, jxsGridNoteToRaw(c.note ?? 0));
    const fx = jxsCellScript(c);
    // A cell with no effect keeps an inert script row's bytes: they never showed and do nothing.
    if (fx.sc === 0 && fx.d === 0 && fx.p === 0 && inertScript(bytes[o + 4])) {
      fx.d = bytes[o + 1]; fx.p = bytes[o + 3]; fx.sc = bytes[o + 4];
    }
    out[o + 1] = fx.d;
    out[o + 2] = (c.instrument ?? 0) & 0xff;
    out[o + 3] = fx.p;
    out[o + 4] = fx.sc;
    changed = true;
  }
  return changed ? out : bytes;
}

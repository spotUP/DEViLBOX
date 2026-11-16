/**
 * jasonPageGrid.ts - the Jason Page tracker grid, read from the module's own track lists and pattern bytes.
 *
 * Read from the Wanted Team eagleplayer third-party/uade-3.05/amigasrc/players/wanted_team/JasonPage/src/Jason Page_v5.s,
 * "new format" (word 0 = 2, the word at the pattern base & 0x0F00 != 0x0F00: Initialize_2_1, Initialize_2_2, Play_2):
 *   - Header words are offsets from the module start: +8 speed table, +12..+26 eight per-voice track index tables,
 *     +28..+42 eight per-voice track bases, +44 pattern offset table, +46 pattern data base. Subsong 0, voice v: its
 *     track list starts at base[v] + the word at index[v] (lbC001548). The speed is the low byte of the speed table's
 *     first word.
 *   - lbC001824 (sequencer): a global counter runs the sequencer once every speed + 1 frames (it starts at 0, so the
 *     first frame reads). Per voice a byte counter ($5A) counts those steps down; at -1 it reloads from the duration
 *     ($5B, starts 0) and reads. One grid row = one sequencer step, so the song speed is speed + 1.
 *   - Track word: high byte FF song end (every voice stops), FE / FC jump to entry (low byte), FD skip, else a pattern
 *     number with the low byte as transpose.
 *   - Pattern bytes (position is a byte, it wraps at 256): below 0x40 a note, ends the step (one more byte, the slide
 *     speed, when the instrument is 0x77: portamento); 0x40..0x7F duration & 0x3F (counter and duration); 0x80..0xF8
 *     instrument & 0x7F; F9 FA FB FD wait, end the step; FC [arg] and FE [hi lo] end the step; FF ends the pattern
 *     (next track entry, same step). Pitch: (note + transpose), clamped to 0x54 when at or above it (signed byte),
 *     indexes the player's period table lbW001334 (in the eagleplayer, not the module).
 *
 * Layers as markCookseyGrid.ts (docs/FORMAT_COMMAND_STREAM_GRID.md): `blockRows` carry every pattern a voice reaches,
 * byte-exact from its start to the last byte the replayer reads (its FF), one carrier cell per byte (cutoff = 1,
 * period = byte). A note byte is played from every track entry that reaches it, so `placements` lists each one with
 * the transpose in force.
 */
import type { Pattern, TrackerCell } from '@/types';
import { cellFieldsEqual } from '@/engine/uade/UADEPatternEncoder';
import { periodToGridNote } from '@/lib/amiga/periodNotes';

export const JASON_PAGE_ROWS_PER_PATTERN = 64;
// A runaway guard only (sequencer steps).
const MAX_STEPS = 100000;
const READ_LIMIT = 4096;
const MAX_NOTE_BYTE = 0x3f;
const PORTA_INSTRUMENT = 0x77;

/** lbW001334, the eagleplayer's period table. */
const PERIODS = [
  0x6b0, 0x650, 0x5f4, 0x5a0, 0x54c, 0x500, 0x4b8, 0x474, 0x434, 0x3f8,
  0x3c0, 0x38a, 0x358, 0x328, 0x2fa, 0x2d0, 0x2a6, 0x280, 0x25c, 0x23a,
  0x21a, 0x1fc, 0x1e0, 0x1c5, 0x1ac, 0x194, 0x17d, 0x168, 0x153, 0x140,
  0x12e, 0x11d, 0x10d, 0xfe, 0xf0, 0xe2, 0xd6, 0xca, 0xbe, 0xb4, 0xa9,
  0xa0, 0x97, 0x8e, 0x86, 0x7f, 0x78, 0x71, 0x6b, 0x65, 0x5f, 0x5a, 0x54,
  0x50, 0x4b, 0x47, 0x43, 0x3f, 0x3c, 0x38, 0x35, 0x32, 0x2f, 0x2d, 0x2a,
  0x28, 0x25, 0x23, 0x21, 0x1f, 0x1e, 0x1c, 0x1a, 0x19, 0x17, 0x16, 0x15,
  0x14, 0x12, 0x11, 0x10, 15, 15, 14,
];

const u16 = (b: Uint8Array, o: number): number => (o >= 0 && o + 1 < b.length ? (b[o] << 8) | b[o + 1] : 0);
const s8 = (v: number): number => (v << 24) >> 24;

/** Grid note of a note byte under a transpose, as lbC001912 computes the period; 0 when it reads past the table. */
export function jasonPageGridNote(byte: number, transpose: number): number {
  const sum = (byte + transpose) & 0xff;
  const index = s8(sum) >= 0x54 ? 0x54 : sum & 0x7f;
  const period = PERIODS[index];
  return period ? periodToGridNote(period) : 0;
}

export interface JasonPageTables { tracks: number[]; patTable: number; patBase: number; speed: number }

/** The module's tables for subsong 0; null when it is not the new-format layout Play_2 reads. */
export function findJasonPageTables(buf: Uint8Array): JasonPageTables | null {
  if (buf.length < 0x40 || u16(buf, 0) !== 2) return null;
  const patBase = u16(buf, 46);
  if (patBase <= 0 || patBase >= buf.length || (u16(buf, patBase) & 0x0f00) === 0x0f00) return null;
  const patTable = u16(buf, 44);
  const tracks = [0, 1, 2, 3].map(v => u16(buf, 28 + 2 * v) + u16(buf, u16(buf, 12 + 2 * v)));
  if (patTable <= 0 || patTable >= buf.length || tracks.some(t => t <= 0 || t + 1 >= buf.length)) return null;
  return { tracks, patTable, patBase, speed: u16(buf, u16(buf, 8)) & 0xff };
}

export function encodeJasonPageStream(rows: TrackerCell[]): Uint8Array {
  return Uint8Array.from(rows, c => (c.period ?? 0) & 0xff);
}

export interface JasonPagePlacement {
  voice: number; tick: number;
  /** File offset of the stored note byte. */
  offset: number;
  note: number;
  transpose: number;
  /** Grid note minus the stored byte. */
  delta: number;
  instrument: number;
}

export interface JasonPageGrid {
  patterns: Pattern[];
  voices: number;
  speed: number;
  filePatternAddrs: number[];
  filePatternSizes: number[];
  trackMap: number[][];
  blockRows: TrackerCell[][];
  placements: JasonPagePlacement[];
  ticks: number;
}

const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

interface Voice { track: number; idx: number; pat: number; pos: number; transpose: number; counter: number; dur: number; instr: number; loopStep: number }

/** Build the grid of subsong 0 of a Jason Page module; null when it is not one the walk can read. */
export function buildJasonPageGrid(buf: Uint8Array, sourceFile: string): JasonPageGrid | null {
  const t = findJasonPageTables(buf);
  if (!t) return null;

  // Pattern start -> one past the last byte the replayer read from it.
  const blockEnd = new Map<number, number>();
  const placements: JasonPagePlacement[] = [];
  const timelines: TrackerCell[][] = [[], [], [], []];
  const voices: Voice[] = t.tracks.map(track => ({ track, idx: 0, pat: -1, pos: 0, transpose: 0, counter: 0, dur: 0, instr: 0, loopStep: -1 }));

  /** One sequencer step of one voice; false when the song ended (track FF) or the data cannot be read. */
  const step = (v: number, w: Voice, tick: number): boolean => {
    w.counter = s8(w.counter - 1);
    if (w.counter >= 0) return true;
    w.counter = w.dur;
    for (let guard = 0; guard < READ_LIMIT; guard++) {
      if (w.pat < 0) {
        const at = w.track + w.idx;
        if (at + 1 >= buf.length) return false;
        const hi = buf[at];
        w.transpose = s8(buf[at + 1]);
        if (hi === 0xff) return false;
        if (hi === 0xfe || hi === 0xfc) {
          const target = buf[at + 1] * 2;
          if (target <= w.idx && w.loopStep < 0) w.loopStep = tick;
          w.idx = target;
          continue;
        }
        if (hi === 0xfd) { w.idx += 2; continue; }
        const pat = t.patBase + u16(buf, t.patTable + hi * 2);
        if (pat >= buf.length) return false;
        w.pat = pat;
        if (!blockEnd.has(pat)) blockEnd.set(pat, pat);
      }
      const at = w.pat + w.pos;
      if (at >= buf.length) return false;
      const b = buf[at];
      let size = 1;
      let endsStep = true;
      if (b < 0x40) {
        if (w.instr === PORTA_INSTRUMENT) size = 2;
        const note = jasonPageGridNote(b, w.transpose);
        if (note > 0) {
          const instrument = w.instr < PORTA_INSTRUMENT ? w.instr + 1 : 0;
          timelines[v][tick] = { ...emptyCell(), note, instrument };
          placements.push({ voice: v, tick, offset: at, note, transpose: w.transpose, delta: note - b, instrument });
        }
      } else if (b < 0x80) { w.dur = b & 0x3f; w.counter = w.dur; endsStep = false; }
      else if (b <= 0xf8) { w.instr = b & 0x7f; endsStep = false; }
      else if (b === 0xfc) size = 2;
      else if (b === 0xfe) size = 3;
      blockEnd.set(w.pat, Math.max(blockEnd.get(w.pat) ?? 0, Math.min(at + size, buf.length)));
      if (b === 0xff) { w.pat = -1; w.pos = 0; w.idx += 2; continue; }
      w.pos = (w.pos + size) & 0xff;
      if (endsStep) return true;
    }
    return false;
  };

  let ticks = 0;
  for (let tick = 0; tick < MAX_STEPS; tick++) {
    if (!voices.every((w, v) => step(v, w, tick))) { ticks = tick; break; }
    if (voices.every(w => w.loopStep >= 0)) { ticks = Math.max(...voices.map(w => w.loopStep)); break; }
    ticks = tick + 1;
  }
  ticks = Math.max(ticks, 1);
  const kept = placements.filter(pl => pl.tick < ticks);
  if (kept.length === 0) return null;

  const addrs = [...blockEnd.keys()];
  const sizes = addrs.map(a => blockEnd.get(a)! - a);
  const blockRows = addrs.map((a, i) => Array.from(buf.subarray(a, a + sizes[i]), byte => ({ ...emptyCell(), cutoff: 1, period: byte })));

  const R = JASON_PAGE_ROWS_PER_PATTERN;
  const numPatterns = Math.ceil(ticks / R);
  const patterns: Pattern[] = Array.from({ length: numPatterns }, (_, p) => ({
    id: `pattern-${p}`, name: `Pattern ${p}`, length: R,
    channels: timelines.map((line, ch) => ({
      id: `channel-${ch}`, name: `Voice ${ch + 1}`, muted: false, solo: false, collapsed: false,
      volume: 100, pan: (ch === 0 || ch === 3) ? -50 : 50, instrumentId: null, color: null,
      rows: Array.from({ length: R }, (_, r) => ({ ...(p * R + r < ticks ? line[p * R + r] ?? emptyCell() : emptyCell()) })),
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const, sourceFile, importedAt: new Date().toISOString(),
      originalChannelCount: 4, originalPatternCount: blockRows.length, originalInstrumentCount: 0,
    },
  }));
  // Each voice's block at a pattern's first note: the pattern a cell there was read from.
  const blockAt: number[][] = [[], [], [], []];
  for (const pl of kept) {
    const block = addrs.findIndex((a, i) => pl.offset >= a && pl.offset < a + sizes[i]);
    const p = Math.floor(pl.tick / R);
    if (blockAt[pl.voice][p] === undefined && block >= 0) blockAt[pl.voice][p] = block;
  }
  const trackMap = patterns.map((_, p) => [0, 1, 2, 3].map(v => blockAt[v][p] ?? -1));
  return { patterns, voices: 4, speed: t.speed, filePatternAddrs: addrs, filePatternSizes: sizes, trackMap, blockRows, placements: kept, ticks };
}

export interface JasonPageEditResult { data: Uint8Array; patched: number; warnings: string[] }

/**
 * Write the grid's note edits into the module. Each changed note cell becomes the note byte (0..0x3F) that plays that
 * note under the transpose in force, nearest the stored one; cells that play the same byte must agree, else the byte
 * is left and a warning returned. Instruments are separate bytes that change the stream's state, so they are not written.
 */
export function applyJasonPageGridEdits(source: Uint8Array, edited: Pattern[]): JasonPageEditResult {
  const base = buildJasonPageGrid(source, '');
  const out = new Uint8Array(source);
  const warnings: string[] = [];
  if (!base) return { data: out, patched: 0, warnings: ['the module is not a Jason Page module this grid can read'] };
  const R = JASON_PAGE_ROWS_PER_PATTERN;
  const cellAt = (voice: number, tick: number): TrackerCell | undefined => edited[Math.floor(tick / R)]?.channels[voice]?.rows[tick % R];
  const placed = new Set<string>();
  const wanted = new Map<number, Set<number>>();
  for (const pl of base.placements) {
    placed.add(`${pl.voice}:${pl.tick}`);
    const cell = cellAt(pl.voice, pl.tick);
    if (!cell) continue;
    const note = cell.note ?? 0;
    if (note !== pl.note) {
      const stored = source[pl.offset];
      let best = -1;
      for (let b = 0; b <= MAX_NOTE_BYTE; b++) {
        if (jasonPageGridNote(b, pl.transpose) === note && (best < 0 || Math.abs(b - stored) < Math.abs(best - stored))) best = b;
      }
      if (note > 0 && best >= 0) {
        if (!wanted.has(pl.offset)) wanted.set(pl.offset, new Set());
        wanted.get(pl.offset)!.add(best);
      } else warnings.push(`voice ${pl.voice + 1} row ${pl.tick}: note ${note} has no note byte under transpose ${pl.transpose} or removes the note; not written`);
    }
    if ((cell.instrument ?? 0) !== pl.instrument) {
      warnings.push(`voice ${pl.voice + 1} row ${pl.tick}: instrument edits are not written (the instrument is a separate stream byte)`);
    }
  }
  let patched = 0;
  for (const [offset, set] of wanted) {
    if (set.size === 1) { out[offset] = [...set][0]; patched++; }
    else warnings.push(`pattern byte ${offset}: cells that play it were edited to different notes; not written`);
  }
  let stray = 0;
  edited.forEach((pat, p) => pat.channels.forEach((chn, v) => chn.rows.forEach((cell, r) => {
    if (placed.has(`${v}:${p * R + r}`)) return;
    if (!cellFieldsEqual(cell, base.patterns[p]?.channels[v]?.rows[r] ?? emptyCell())) stray++;
  })));
  if (stray > 0) warnings.push(`${stray} edited cell(s) are not on a note; not written (the pattern would change length)`);
  return { data: out, patched, warnings };
}

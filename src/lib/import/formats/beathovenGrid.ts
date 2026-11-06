/**
 * Beathoven Synthesizer (.bss) - the time-aligned, read-only grid (phase A; beathovenEdits.ts writes note edits back, phase B) and its byte-exact stream carriers.
 *
 * Three layers (docs/FORMAT_COMMAND_STREAM_GRID.md): the stream bytes in the file are the truth; `blockRows` holds
 * one carrier cell per 16-bit stream word (cutoff 2, period = the word) so the encoder rebuilds the bytes; the display
 * grid shows one row per replayer step (legacy N100: one tick; later engines: one tempo step), a note on the row where
 * it starts and empty rows while it is held.
 *
 * Module layout (third-party/nuade/players/beathoven): an Amiga hunk whose code starts at file offset 0x20 and holds
 * `70FF 4E75 'BEAT' 'HOVE' <engine tag>`. Pointers inside are code addresses (file offset = address + 0x20). The four
 * voice track lists (8-byte entries {stream, note_base}, a zero stream ends the list and the voice wraps to its loop
 * entry) are read from the init routine's `move.l #track,x(a0) / move.l #loop,y(a0)` pairs. Modules with several
 * subsongs or an indexed init are not decoded (gridUnmatchedReason).
 */
import type { Pattern, TrackerCell, ChannelData } from '@/types';
import { periodToNote } from '@/lib/amiga/periodNotes';
import { makeRowClock, exactStepFromOnsets, type RowClock } from './stepRowClock';

const ROWS_PER_PATTERN = 64;
const MAX_ROWS = 32768;
const VOICES = 4;
const CODE = 0x20;
const MAX_COMMANDS = 65536;
const NOTE_OFF_UNUSED = 0;

const u16 = (b: Uint8Array, o: number): number => ((b[o] ?? 0) << 8) | (b[o + 1] ?? 0);
const u32 = (b: Uint8Array, o: number): number => (u16(b, o) * 65536 + u16(b, o + 2)) >>> 0;
const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

/** Find the next occurrence of a byte pattern (-1 is a wildcard) at or after `from`. */
function scan(buf: Uint8Array, pat: number[], from = 0): number {
  outer: for (let i = from; i + pat.length <= buf.length; i += 2) {
    for (let k = 0; k < pat.length; k++) if (pat[k] >= 0 && buf[i + k] !== pat[k]) continue outer;
    return i;
  }
  return -1;
}

export interface BthParams {
  legacy: boolean;
  tag: string;
  trackLists: Array<{ track: number; loop: number }>;
  table: number;
  origin: number;
  bias: number;
  tempo: number;
  /** legacy duration scaling `lsr.w #2 / mulu.w #5` present */
  scaled: boolean;
}

/** Why a module cannot be decoded, or its replayer parameters. */
export function readBthParams(buf: Uint8Array): BthParams | string {
  if (buf.length < CODE + 0x20) return 'the file is too short';
  const hdr = [0x70, 0xff, 0x4e, 0x75, 0x42, 0x45, 0x41, 0x54, 0x48, 0x4f, 0x56, 0x45];
  for (let i = 0; i < hdr.length; i++) if (buf[CODE + i] !== hdr[i]) return 'no Beathoven header';
  const tag = String.fromCharCode(buf[CODE + 12], buf[CODE + 13], buf[CODE + 14], buf[CODE + 15]);
  const legacy = tag === 'N100';
  const [a, b] = legacy ? [0x0a, 0x0e] : [0x04, 0x08];
  const lists: Array<{ track: number; loop: number }> = [];
  for (let at = 0; at >= 0 && lists.length < VOICES;) {
    at = scan(buf, [0x21, 0x7c, -1, -1, -1, -1, 0x00, a, 0x21, 0x7c, -1, -1, -1, -1, 0x00, b], at);
    if (at < 0) break;
    lists.push({ track: u32(buf, at + 2), loop: u32(buf, at + 10) });
    at += 16;
  }
  if (lists.length < VOICES) return `only ${lists.length} voice track lists found in the init routine`;
  if (legacy) {
    const at = scan(buf, [0x45, 0xf9, -1, -1, -1, -1, 0xd0, 0xa8, -1, -1, 0x04, 0x80, -1, -1, -1, -1]);
    if (at < 0) return 'legacy note handler not found';
    const scaled = scan(buf, [0xe4, 0x48, 0xc0, 0xfc, 0x00, 0x05]) >= 0;
    return { legacy, tag, trackLists: lists, table: u32(buf, at + 2), origin: u32(buf, at + 12), bias: 0, tempo: 1, scaled };
  }
  const at = scan(buf, [0x53, 0x40, 0xd0, 0x68, -1, -1, 0x06, 0x40, -1, -1, 0xe3, 0x48, 0x45, 0xf9, -1, -1, -1, -1]);
  if (at < 0) return 'note handler with a constant bias not found';
  const mu = scan(buf, [0xc0, 0xfc, 0x00, -1]);
  if (mu < 0) return 'tempo multiply not found';
  return { legacy, tag, trackLists: lists, table: u32(buf, at + 14), origin: 1, bias: u16(buf, at + 8), tempo: buf[mu + 3], scaled: false };
}

export interface BthStream { offset: number; size: number; broken: boolean }
/** The event a row's note was read from: the 16-bit note number sits at `noteOffset`, played under `base`. */
export type BthRowSource = { stream: number; offset: number; length: number; noteOffset: number; noteNum: number; base: number } | null;

export interface BthGrid {
  patterns: Pattern[];
  songPositions: number[];
  rows: number;
  streams: BthStream[];
  blockRows: TrackerCell[][];
  rowSources: BthRowSource[][][];
  streamAtStart: number[][];
  /** Ticks per row: the exact GCD of every onset gap (plan R4/R7). */
  step: number;
  clock: RowClock;
  /** Each voice's note onset ticks within the first pass (what the step is derived from). */
  onsets: number[][];
}

interface Placed { tick: number; note: number; instrument: number; stream: number; offset: number; length: number; noteOffset: number; noteNum: number; base: number }

/** The tracker note a note number shows under `base` (0 when the table holds no period there). */
export function bthShownNote(buf: Uint8Array, prm: BthParams, num: number, base: number): number {
  const idx = prm.legacy ? num + base - prm.origin : num - 1 + base + prm.bias;
  const p = idx < 0 ? 0 : u16(buf, prm.table + CODE + idx * 2);
  return p > 0 ? periodToNote(p) : 0;
}

export function isBthModule(buf: Uint8Array): boolean {
  return typeof readBthParams(buf) !== 'string';
}

export function buildBthGrid(buf: Uint8Array): BthGrid | string {
  const prm = readBthParams(buf);
  if (typeof prm === 'string') return prm;
  const streams: BthStream[] = [];
  const streamIndex = new Map<number, number>();
  const instruments = new Map<number, number>();

  /** Command size in bytes of the word at `o`, or 0 for the stream end. */
  const cmdSize = (o: number): number => {
    const w = u16(buf, o);
    if (w === 0) return 2;
    if (prm.legacy) {
      if (w === 0x80) return 6;
      if (w === 0x81) return (u16(buf, o + 4) + 3) * 2;
      return 4;
    }
    if (w === 0x80) return 6;
    if (w === 0x84) return 6 + 2 * u16(buf, o + 4);
    return 4;
  };

  const streamOf = (addr: number): number => {
    const known = streamIndex.get(addr);
    if (known !== undefined) return known;
    let o = addr + CODE;
    let broken = false;
    for (let n = 0; ; n++) {
      if (o + 2 > buf.length || n > MAX_COMMANDS) { broken = true; break; }
      const sz = cmdSize(o);
      if (u16(buf, o) === 0) { o += 2; break; }
      o += sz;
    }
    const idx = streams.length;
    streams.push({ offset: addr + CODE, size: Math.min(o, buf.length) - (addr + CODE), broken });
    streamIndex.set(addr, idx);
    return idx;
  };

  const rowUnit = 1;
  const voices: Placed[][] = [];
  const firstPass: number[] = [];
  for (const list of prm.trackLists) {
    const placed: Placed[] = [];
    let row = 0;
    let instrument = 0;
    let ei = list.track;
    let visitedLoop = false;
    let guard = 0;
    while (guard++ < 4096 && row < MAX_ROWS) {
      if (ei === list.loop) { if (visitedLoop) break; visitedLoop = true; }
      const stream = u32(buf, ei + CODE);
      const base = u32(buf, ei + CODE + 4);
      if (stream === 0) {
        if (ei === list.loop) break;
        ei = list.loop;
        continue;
      }
      ei += 8;
      const si = streamOf(stream);
      if (streams[si].broken) return 'a command stream runs past the end of the file';
      let o = stream + CODE;
      const end = o + streams[si].size;
      let n = 0;
      while (o < end && n++ < MAX_COMMANDS && row < MAX_ROWS) {
        const w = u16(buf, o);
        const sz = cmdSize(o);
        const op = u16(buf, o + 2);
        if (w === 0) break;
        const place = (num: number, numAt: number, len: number): void => {
          placed.push({ tick: row, note: bthShownNote(buf, prm, num, base), instrument, stream: si, offset: o, length: sz, noteOffset: numAt, noteNum: num, base });
          row += len * rowUnit;
        };
        const dur = (v: number): number => (prm.legacy ? (prm.scaled ? (v >> 2) * 5 : v) : v);
        if (w === 0x80) {
          const rec = u32(buf, o + 2);
          if (!instruments.has(rec)) instruments.set(rec, instruments.size + 1);
          instrument = instruments.get(rec) ?? 0;
        } else if (prm.legacy) {
          if (w === 0x81) place(u16(buf, o + 6), o + 6, dur(op));
          else if (w === 0x82) { row += dur(op); }
          else place(w, o, dur(op));
        } else if (w === 0x81 || w === 0x82 || w === 0x85) {
          // slide, legato and note bias change the sound, not the timeline
        } else if (w === 0x83) {
          row += op;
        } else if (w === 0x84) {
          place(u16(buf, o + 6), o + 6, op);
        } else {
          place(w, o, op);
        }
        o += sz;
      }
    }
    voices.push(placed);
    firstPass.push(row);
  }

  const ticks = Math.min(MAX_ROWS, Math.max(1, ...firstPass));
  if (voices.every((p) => p.length === 0)) return 'the voices have no notes';
  // plan rule R4/R7: one row is the exact GCD of every onset gap, so every note lands on a row with no offset
  const onsets = voices.map((p) => p.filter((c) => c.tick < ticks).map((c) => c.tick));
  const step = exactStepFromOnsets(onsets);
  const clock = makeRowClock([{ tick: 0, speed: step }]);
  const rows = Math.max(1, clock.rowsForTicks(ticks));

  const grid: TrackerCell[][] = Array.from({ length: VOICES }, () => Array.from({ length: rows }, emptyCell));
  const sources: BthRowSource[][] = Array.from({ length: VOICES }, () => new Array<BthRowSource>(rows).fill(null));
  const streamAtTick: number[][] = Array.from({ length: VOICES }, () => new Array<number>(rows).fill(-1));
  voices.forEach((placed, v) => {
    for (let i = 0; i < placed.length; i++) {
      const p = placed[i];
      if (p.tick >= ticks) break;
      const row = clock.tickToRow(p.tick).row;
      const cell = grid[v][row];
      cell.note = p.note || NOTE_OFF_UNUSED;
      if (p.note > 0) cell.instrument = p.instrument;
      sources[v][row] = { stream: p.stream, offset: p.offset, length: p.length, noteOffset: p.noteOffset, noteNum: p.noteNum, base: p.base };
      const endRow = Math.min(rows, i + 1 < placed.length ? clock.tickToRow(placed[i + 1].tick).row : rows);
      for (let t = row; t < endRow; t++) streamAtTick[v][t] = p.stream;
    }
  });

  const blockRows = streams.map((s) => {
    const out: TrackerCell[] = [];
    for (let o = s.offset; o + 1 < s.offset + s.size + 1 && o < s.offset + s.size; o += 2) {
      out.push({ ...emptyCell(), cutoff: 2, period: u16(buf, o) });
    }
    return out;
  });

  const patterns: Pattern[] = [];
  const songPositions: number[] = [];
  const rowSources: BthRowSource[][][] = [];
  const streamAtStart: number[][] = [];
  for (let start = 0, p = 0; start < rows; start += ROWS_PER_PATTERN, p++) {
    const len = Math.min(ROWS_PER_PATTERN, rows - start);
    const chData: ChannelData[] = grid.map((cells, ch) => ({
      id: `channel-${ch}`, name: `Channel ${ch + 1}`,
      muted: false, solo: false, collapsed: false,
      volume: 100, pan: (ch === 0 || ch === 3) ? -50 : 50, instrumentId: null, color: null,
      rows: cells.slice(start, start + len),
    }));
    patterns.push({ id: `pattern-${p}`, name: `Pattern ${p}`, length: len, channels: chData });
    songPositions.push(p);
    rowSources.push(sources.map((s) => s.slice(start, start + len)));
    streamAtStart.push(streamAtTick.map((s) => s[start]));
  }
  return { patterns, songPositions, rows, streams, blockRows, rowSources, streamAtStart, step, clock, onsets };
}

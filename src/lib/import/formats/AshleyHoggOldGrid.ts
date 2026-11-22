/**
 * AshleyHoggOldGrid.ts - the tick grid of the old Ashley Hogg family (ash.* with the samples inside the file).
 * Grammar (third-party/nuade/players/ashleyhogg/ah_old.c, ah_module.c): the tables are found by the operands of
 * `lea d16(pc)` instructions in the driver code. Subsong 0: voice i starts at track_base + u32(songs + i*4). A track
 * entry is two bytes: transposition (int8) and pattern number, or $81 restart, $80 stop, the fade command (skip). A
 * pattern number with bit 7 set is followed by a repeat count byte. The pattern is read from pattern_base +
 * pattern_offsets[number & $7F]: a byte with bit 7 ends it; $62 release; $64 n ticks per step; $63 n wait n steps;
 * any other byte is a note followed by an instrument ($3F none). After a note or wait an optional $65 x (sustain) and
 * $60 hi lo (slide) follow. The note plays period table[note + transposition]. A note or a wait ends a step.
 * Each pattern is a file block whose `blockRows` carry its bytes; `noteBytes` name the note byte of the first event
 * that plays at each grid cell (docs/FORMAT_COMMAND_STREAM_GRID.md).
 * shortcut: the grid plays each voice up to its first restart or stop; the one idle tick the driver spends between two
 * patterns is not counted; a pattern played again shows on every play but only its first play writes back.
 */
import type { Pattern, TrackerCell } from '@/types';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { ashleyHoggEncoder } from '@/engine/uade/encoders/AshleyHoggEncoder';
import { periodToGridNote } from '@/lib/amiga/periodNotes';

const NUM_CHANNELS = 4;
const MAX_TICKS = 24000;
const MAX_ROWS = 4096;
const MAX_ENTRIES = 4096;
const SEARCH_LIMIT = 0x900;
const NO_INSTRUMENT = 0x3f;

const u16 = (b: Uint8Array, o: number): number => (o >= 0 && o + 1 < b.length ? (b[o] << 8) | b[o + 1] : -1);
const s16 = (b: Uint8Array, o: number): number => (u16(b, o) << 16) >> 16;
const u32 = (b: Uint8Array, o: number): number => (o >= 0 && o + 3 < b.length ? ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0 : -1);

/** Offset of the first even position where the words match (`null` = any word), or -1. */
function findWords(b: Uint8Array, words: Array<number | null>): number {
  for (let o = 0; o + words.length * 2 <= Math.min(b.length, SEARCH_LIMIT); o += 2) {
    if (words.every((w, i) => w === null || u16(b, o + i * 2) === w)) return o;
  }
  return -1;
}
const parse = (p: string): Array<number | null> => p.split(' ').map((w) => (w === 'xxxx' ? null : parseInt(w, 16)));
/** The table a `lea d16(pc)` in the pattern names: operand word `at` plus its signed displacement. */
function table(b: Uint8Array, p: string, at: number): number {
  const m = findWords(b, parse(p));
  return m < 0 ? -1 : m + at * 2 + s16(b, m + at * 2);
}

export interface AhOldTables {
  periods: number; instruments: number; trackBase: number; patternOffsets: number; patternBase: number;
  speeds: number; songs: number; restartOffset: boolean; fadeCommand: number;
}

export function ashleyHoggOldTables(b: Uint8Array): AhOldTables | null {
  const pat = '47fa xxxx 2173 1000 0036 2173 1000 003e 47fa xxxx 220b';
  const t = {
    periods: table(b, '49fa xxxx e34a 3434 2000', 1),
    instruments: table(b, 'c2fc 002c 47fa xxxx d7c1', 3),
    trackBase: table(b, '45fa xxxx b5e8 0032', 1),
    patternOffsets: table(b, pat, 1),
    patternBase: table(b, pat, 9),
    speeds: table(b, '41fa xxxx 1970 0000 002f', 1),
    songs: table(b, '41fa xxxx e948 2970 0000 0032', 1),
    restartOffset: findWords(b, parse('2168 003a 0032')) < 0,
    fadeCommand: findWords(b, parse('0c12 0082')) >= 0 ? 0x82 : findWords(b, parse('0c12 003e')) >= 0 ? 0x3e : 0,
  };
  const ok = [t.periods, t.instruments, t.trackBase, t.patternOffsets, t.patternBase, t.speeds, t.songs].every((a) => a >= 0 && a < b.length);
  return ok && t.speeds > t.songs ? t : null;
}

interface AhEvent { tick: number; at: number; note: number; period: number; inst: number }

/** End offset (after the terminator) of the pattern at `p`, or -1. */
function patternEnd(b: Uint8Array, p: number): number {
  for (let n = 0; n < 4096 && p >= 0 && p < b.length; n++) {
    const e = b[p];
    if (e & 0x80) return p + 1;
    if (e === 0x62) { p += 1; continue; }
    if (e === 0x64) { p += 2; continue; }
    p += 2;
    if (b[p] === 0x65) p += 2;
    if (b[p] === 0x60) p += 3;
  }
  return -1;
}

interface Walk { events: AhEvent[]; patterns: number[] }

function walkVoice(b: Uint8Array, t: AhOldTables, speed: number, entry: number): Walk | null {
  const events: AhEvent[] = [];
  const patterns: number[] = [];
  let track = t.trackBase + entry;
  let tick = 0;
  let step = speed;
  for (let n = 0; n < MAX_ENTRIES && tick < MAX_TICKS; n++) {
    const first = b[track];
    const second = b[track + 1];
    if (first === undefined) return null;
    if (first === 0x81 || first === 0x80) break;
    if (t.fadeCommand !== 0 && first === t.fadeCommand) { track += 2; continue; }
    const transpose = (first << 24) >> 24;
    const patAddr = t.patternBase + u32(b, t.patternOffsets + (second & 0x7f) * 4);
    track += 2;
    let repeats = 1;
    if (second & 0x80) { repeats = b[track]; track++; }
    const end = patternEnd(b, patAddr);
    if (end < 0) return null;
    patterns.push(patAddr);
    for (let r = 0; r < Math.max(1, repeats); r++) {
      for (let p = patAddr; p < end - 1;) {
        const e = b[p];
        if (e === 0x62) { p += 1; continue; }
        if (e === 0x64) { step = Math.max(1, b[p + 1]); p += 2; continue; }
        if (e === 0x63) {
          tick += step * Math.max(1, b[p + 1]);
          p += 2;
        } else {
          const inst = b[p + 1];
          const pi = e + transpose;
          const period = pi >= 0 ? u16(b, t.periods + pi * 2) : -1;
          events.push({ tick, at: p, note: e, period: period > 0 ? period : 0, inst });
          tick += step;
          p += 2;
        }
        if (b[p] === 0x65) p += 2;
        if (b[p] === 0x60) p += 3;
      }
    }
  }
  return { events, patterns };
}

const gcd = (a: number, c: number): number => (c === 0 ? a : gcd(c, a % c));
const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

function carrierRows(b: Uint8Array, start: number, size: number): TrackerCell[] {
  const rows: TrackerCell[] = [];
  for (let p = start; p < start + size;) {
    const n = Math.min(3, start + size - p);
    rows.push({
      note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      cutoff: n, period: b[p], pan: n > 1 ? b[p + 1] : 0, resonance: n > 2 ? b[p + 2] : 0,
    } as TrackerCell);
    p += n;
  }
  return rows;
}

export interface AhOldGrid { pattern: Pattern; layout: UADEVariablePatternLayout; rowTicks: number }

/** The grid and layout of subsong 0 of an old-family module, or null when it is not one or leaves the file. */
export function buildAshleyHoggOldGrid(buf: Uint8Array): AhOldGrid | null {
  const t = ashleyHoggOldTables(buf);
  if (!t) return null;
  const speed = buf[t.speeds];
  if (!speed) return null;
  const voices: AhEvent[][] = [];
  const addrs = new Set<number>();
  for (let v = 0; v < NUM_CHANNELS; v++) {
    const entry = u32(buf, t.songs + v * 4);
    if (entry === 0) { voices.push([]); continue; }
    const w = walkVoice(buf, t, speed, entry);
    if (!w) return null;
    voices.push(w.events);
    w.patterns.forEach((a) => addrs.add(a));
  }
  const blocks = [...addrs].sort((a, c) => a - c).map((start) => ({ start, size: patternEnd(buf, start) - start }));
  for (let i = 1; i < blocks.length; i++) if (blocks[i - 1].start + blocks[i - 1].size > blocks[i].start) return null;
  if (!blocks.length) return null;

  const all = voices.flat();
  const durations = all.flatMap((e, i, l) => [e.tick, l[i + 1] && l[i + 1].tick > e.tick ? l[i + 1].tick - e.tick : 0]);
  const rowTicks = Math.max(1, durations.reduce(gcd, speed));
  const lastTick = Math.max(0, ...all.map((e) => e.tick));
  const rowCount = Math.min(MAX_ROWS, Math.max(1, Math.floor(lastTick / rowTicks) + 1));
  const pattern: Pattern = {
    id: 'pattern-0', name: 'Pattern 0', length: rowCount,
    channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
      id: `channel-${ch}`, name: `Channel ${ch + 1}`, muted: false, solo: false, collapsed: false, volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50, instrumentId: null, color: null,
      rows: Array.from({ length: rowCount }, emptyCell),
    })),
  };
  const noteBytes: NonNullable<UADEVariablePatternLayout['noteBytes']> = [];
  const written = new Set<number>();
  voices.forEach((events, channel) => {
    for (const e of events) {
      const row = Math.floor(e.tick / rowTicks);
      if (row >= rowCount) break;
      const cell = pattern.channels[channel].rows[row];
      const note = e.period ? periodToGridNote(e.period) : 0;
      if (cell.note !== 0 || note === 0) continue;
      cell.note = note;
      if (e.inst !== NO_INSTRUMENT) cell.instrument = e.inst + 1;
      if (!written.has(e.at)) { written.add(e.at); noteBytes.push({ pattern: 0, channel, row, offset: e.at, note }); }
    }
  });
  const layout: UADEVariablePatternLayout = {
    formatId: 'ashleyHogg', numChannels: NUM_CHANNELS, numFilePatterns: blocks.length, rowsPerPattern: rowCount,
    moduleSize: buf.length, encoder: ashleyHoggEncoder,
    filePatternAddrs: blocks.map((x) => x.start), filePatternSizes: blocks.map((x) => x.size),
    trackMap: [Array.from({ length: NUM_CHANNELS }, () => -1)],
    blockRows: blocks.map((x) => carrierRows(buf, x.start, x.size)),
    noteBytes,
  };
  return { pattern, layout, rowTicks };
}

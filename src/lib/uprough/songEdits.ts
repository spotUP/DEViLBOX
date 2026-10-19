/**
 * Side-table edit rules (plan 2026-10-19 E1 D5). One module, called by every cell edit path.
 * A side entry holds what the grid cannot show (exact velocity, hat/808 timing, duration). It rides with its cell and
 * is dropped when the cell's note, instrument or volume changes. `bars[].order` (the humanize hit order) is kept in
 * step: an order key never points at an empty cell, because the Python reader raises on it.
 */
import type { TrackerCell } from '@typedefs/tracker';
import { ROWS_PER_BAR, cellKey, emptyCell, type SideEntry, type UpRoughSong } from './songFile';

const clone = (song: UpRoughSong): UpRoughSong => structuredClone(song);

function sectionIndex(song: UpRoughSong, p: number): number {
  if (!song.meta.sections[p]) throw new RangeError(`Pattern ${p} is not an Up Rough section.`);
  return p;
}
const laneChannel = (song: UpRoughSong, p: number, lane: string) => {
  const ch = song.patterns[p]!.channels.find((c) => c.id === lane);
  if (!ch) throw new RangeError(`Lane "${lane}" does not exist.`);
  return ch;
};
const splitKey = (key: string): [string, number] => {
  const i = key.lastIndexOf(':');
  return [key.slice(0, i), Number(key.slice(i + 1))];
};

function dropOrder(song: UpRoughSong, p: number, key: string): void {
  for (const bar of song.meta.sections[p]!.bars) bar.order = bar.order.filter((k) => k !== key);
}
function addOrder(song: UpRoughSong, p: number, key: string): void {
  const [, row] = splitKey(key);
  const bar = song.meta.sections[p]!.bars[Math.floor(row / ROWS_PER_BAR)];
  if (bar && !bar.order.includes(key)) bar.order.push(key);
}

/** Rewrite the side keys and order keys of one lane through `map` (old row -> new row, or null to drop). */
function remapLane(song: UpRoughSong, p: number, lane: string, map: (row: number) => number | null): void {
  const sid = song.meta.sections[p]!.id;
  const side = song.meta.side[sid];
  const moved: [string, SideEntry][] = [];
  if (side) {
    for (const key of Object.keys(side)) {
      const [l, row] = splitKey(key);
      if (l !== lane) continue;
      const entry = side[key]!;
      delete side[key];
      const to = map(row);
      if (to !== null) moved.push([cellKey(lane, to), entry]);
    }
    for (const [k, e] of moved) side[k] = e;
    if (Object.keys(side).length === 0) delete song.meta.side[sid];
  }
  for (const bar of song.meta.sections[p]!.bars) {
    bar.order = bar.order.flatMap((key) => {
      const [l, row] = splitKey(key);
      if (l !== lane) return [key];
      const to = map(row);
      return to === null ? [] : [cellKey(lane, to)];
    });
  }
  // A key that crossed a bar boundary belongs to the bar of its new row.
  const bars = song.meta.sections[p]!.bars;
  bars.forEach((bar, b) => {
    const stray = bar.order.filter((k) => {
      const [l, row] = splitKey(k);
      return l === lane && Math.floor(row / ROWS_PER_BAR) !== b;
    });
    bar.order = bar.order.filter((k) => !stray.includes(k));
    for (const k of stray) addOrder(song, p, k);
  });
}

/** Does an edit change what the side value must agree with (note, instrument, volume)? */
const sameVoice = (a: TrackerCell, b: TrackerCell): boolean => a.note === b.note && a.instrument === b.instrument && a.volume === b.volume;

/**
 * Set one cell. Changing note, instrument or volume, or clearing the cell, drops its side entry. An effect-column edit
 * keeps it.
 */
export function editCell(song: UpRoughSong, p: number, lane: string, row: number, next: TrackerCell): UpRoughSong {
  const out = clone(song);
  sectionIndex(out, p);
  const ch = laneChannel(out, p, lane);
  const prev = ch.rows[row]!;
  const key = cellKey(lane, row);
  const sid = out.meta.sections[p]!.id;
  ch.rows[row] = { ...next };
  if (next.note === 0) {
    dropEntry(out, sid, key);
    dropOrder(out, p, key);
    return out;
  }
  if (prev.note === 0) addOrder(out, p, key);
  if (!sameVoice(prev, next)) dropEntry(out, sid, key);
  return out;
}

function dropEntry(song: UpRoughSong, sid: string, key: string): void {
  const side = song.meta.side[sid];
  if (!side) return;
  delete side[key];
  if (Object.keys(side).length === 0) delete song.meta.side[sid];
}

/** Transpose one cell by semitones: keeps offset, vel, dur, role; drops cents and glide. */
export function transposeCell(song: UpRoughSong, p: number, lane: string, row: number, semis: number): UpRoughSong {
  const out = clone(song);
  const ch = laneChannel(out, p, lane);
  const cell = ch.rows[row]!;
  if (cell.note === 0) return out;
  ch.rows[row] = { ...cell, note: Math.max(1, Math.min(96, cell.note + semis)) };
  const entry = out.meta.side[out.meta.sections[p]!.id]?.[cellKey(lane, row)];
  if (entry) { delete entry.cents; delete entry.glide; }
  return out;
}

/** Insert an empty row in a lane; rows below shift down with their entries, the last row falls off. */
export function insertRow(song: UpRoughSong, p: number, lane: string, row: number): UpRoughSong {
  const out = clone(song);
  const ch = laneChannel(out, p, lane);
  const len = ch.rows.length;
  ch.rows.splice(row, 0, emptyCell());
  ch.rows.length = len;
  remapLane(out, p, lane, (r) => (r < row ? r : r + 1 < len ? r + 1 : null));
  return out;
}

/** Delete a row from a lane; rows below shift up with their entries, an empty row enters at the end. */
export function deleteRow(song: UpRoughSong, p: number, lane: string, row: number): UpRoughSong {
  const out = clone(song);
  const ch = laneChannel(out, p, lane);
  ch.rows.splice(row, 1);
  ch.rows.push(emptyCell());
  remapLane(out, p, lane, (r) => (r < row ? r : r === row ? null : r - 1));
  return out;
}

/** Move (or copy) a block of rows within one lane. The entries travel with the cells. */
export function moveBlock(song: UpRoughSong, p: number, lane: string, from: number, count: number, to: number, copy = false): UpRoughSong {
  const out = clone(song);
  const ch = laneChannel(out, p, lane);
  const sid = out.meta.sections[p]!.id;
  const side = out.meta.side[sid] ?? {};
  const block = ch.rows.slice(from, from + count).map((c) => ({ ...c }));
  const entries = block.map((_, i) => side[cellKey(lane, from + i)]);
  for (let i = 0; i < count; i++) {
    if (to + i >= ch.rows.length) break;
    // The destination is overwritten: its old entry and order key go.
    dropEntry(out, sid, cellKey(lane, to + i));
    dropOrder(out, p, cellKey(lane, to + i));
  }
  if (!copy) {
    for (let i = 0; i < count; i++) {
      const k = cellKey(lane, from + i);
      ch.rows[from + i] = emptyCell();
      dropEntry(out, sid, k);
      dropOrder(out, p, k);
    }
  }
  for (let i = 0; i < count; i++) {
    const dest = to + i;
    if (dest >= ch.rows.length) break;
    ch.rows[dest] = block[i]!;
    if (block[i]!.note !== 0) addOrder(out, p, cellKey(lane, dest));
    const e = entries[i];
    if (e) (out.meta.side[sid] ??= {})[cellKey(lane, dest)] = structuredClone(e);
  }
  return out;
}

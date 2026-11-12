/**
 * Some modules store a pattern once and play it at several song positions, while the grid holds one pattern per position.
 * An edit at one position is then an edit of the stored cell, so the other positions showing that cell must change too -
 * otherwise they keep the old value on screen and the exporter can save only one of the two.
 *
 * The share information is the layout's own getCellFileOffset: grid cells with the same file offset are one stored cell.
 * A layout opts in with propagateSharedCells (Composer 669). Works at any granularity (whole pattern, one channel, a row range)
 * because it is decided per cell.
 */
import type { UADEPatternLayout, UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { getCellFileOffset } from '@/engine/uade/UADEPatternEncoder';
import type { TrackerCell } from '@/types/tracker';
import { columnPatch, getColumnField, setColumnField } from '@/lib/tracker/noteColumns';

type GridPattern = { channels: Array<{ rows: TrackerCell[] }> };
export interface SharedCellEdit { pattern: number; row: number; channel: number; values: Partial<TrackerCell> }

/**
 * The cells of the other grid patterns that are the same stored cell as a cell `after` changed in pattern `patternIndex`,
 * with the changed fields. Cells that already show the value are not returned.
 */
export function sharedCellEdits(
  layout: UADEPatternLayout | UADEVariablePatternLayout,
  patternIndex: number,
  before: GridPattern,
  after: GridPattern,
  patterns: readonly GridPattern[],
): SharedCellEdit[] {
  if (!layout.propagateSharedCells) return [];
  if ('numFilePatterns' in layout) return sharedNoteEdits(layout, patternIndex, before, after, patterns);
  const out: SharedCellEdit[] = [];
  after.channels.forEach((ch, channel) => ch.rows.forEach((cell, row) => {
    const old = before.channels[channel]?.rows[row];
    if (!old) return;
    const bound = layout.positionBoundFields?.(row, channel) ?? [];
    const keys = ([...new Set([...Object.keys(old), ...Object.keys(cell)])] as Array<keyof TrackerCell>).filter((k) => !bound.includes(k) && JSON.stringify(old[k]) !== JSON.stringify(cell[k]));
    if (keys.length === 0) return;
    const at = getCellFileOffset(layout, patternIndex, row, channel);
    if (at < 0) return;
    patterns.forEach((p, pattern) => {
      if (pattern === patternIndex || getCellFileOffset(layout, pattern, row, channel) !== at) return;
      const there = p.channels[channel]?.rows[row];
      if (!there) return;
      const values: Partial<TrackerCell> = {};
      for (const k of keys) {
        if (JSON.stringify(there[k]) !== JSON.stringify(cell[k])) (values as Record<string, unknown>)[k] = structuredClone(cell[k]);
      }
      if (Object.keys(values).length > 0) out.push({ pattern, row, channel, values });
    });
  }));
  return out;
}

/** Stored note of each grid note cell of a variable layout: the file offset and the base (table index = byte + base) of its command. */
const groupsOf = new WeakMap<object, Map<string, Array<{ pattern: number; channel: number; row: number; col: number }>>>();
function noteGroups(layout: UADEVariablePatternLayout) {
  let groups = groupsOf.get(layout);
  if (!groups) {
    groups = new Map();
    for (const n of layout.noteBytes ?? []) {
      const key = `${n.offset}:${n.base ?? 0}`;
      const list = groups.get(key) ?? [];
      list.push({ pattern: n.pattern, channel: n.channel, row: n.row, col: n.col ?? 0 });
      groups.set(key, list);
    }
    groupsOf.set(layout, groups);
  }
  return groups;
}

/**
 * Variable layouts (the grid is a reading of the player): the cells of noteBytes with one offset and base are one stored note, in
 * any pattern, row, channel or note column. Only the note is stored; a cell with no noteBytes entry has no stored bytes and is
 * never aliased. Aliases already showing the note are not returned.
 */
function sharedNoteEdits(layout: UADEVariablePatternLayout, patternIndex: number, before: GridPattern, after: GridPattern, patterns: readonly GridPattern[]): SharedCellEdit[] {
  const groups = noteGroups(layout);
  const keyOf = new Map<string, string>();
  groups.forEach((list, key) => list.forEach((c) => keyOf.set(`${c.pattern}:${c.channel}:${c.row}:${c.col}`, key)));
  const work = new Map<string, { pattern: number; row: number; channel: number; cell: TrackerCell }>();
  after.channels.forEach((ch, channel) => ch.rows.forEach((cell, row) => {
    const old = before.channels[channel]?.rows[row];
    if (!old) return;
    const cols = Math.max(cell.extraNotes?.length ?? 0, old.extraNotes?.length ?? 0);
    for (let col = 0; col <= cols; col++) {
      const note = getColumnField(cell, col, 'note') ?? 0;
      if (note === (getColumnField(old, col, 'note') ?? 0)) continue;
      const key = keyOf.get(`${patternIndex}:${channel}:${row}:${col}`);
      if (key === undefined) continue;
      for (const a of groups.get(key) ?? []) {
        if (a.pattern === patternIndex && a.channel === channel && a.row === row && a.col === col) continue;
        const k = `${a.pattern}:${a.channel}:${a.row}`;
        let w = work.get(k);
        if (!w) {
          const src = patterns[a.pattern]?.channels[a.channel]?.rows[a.row];
          if (!src) continue;
          w = { pattern: a.pattern, row: a.row, channel: a.channel, cell: structuredClone(src) };
          work.set(k, w);
        }
        setColumnField(w.cell, a.col, 'note', note);
      }
    }
  }));
  const out: SharedCellEdit[] = [];
  for (const w of work.values()) {
    const src = patterns[w.pattern].channels[w.channel].rows[w.row];
    const values: Partial<TrackerCell> = {};
    if (w.cell.note !== src.note) values.note = w.cell.note;
    if (JSON.stringify(w.cell.extraNotes) !== JSON.stringify(src.extraNotes)) Object.assign(values, columnPatch(w.cell, 1, {}));
    if (Object.keys(values).length > 0) out.push({ pattern: w.pattern, row: w.row, channel: w.channel, values });
  }
  return out;
}

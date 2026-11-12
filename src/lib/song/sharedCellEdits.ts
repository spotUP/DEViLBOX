/**
 * Some modules store a pattern once and play it at several song positions, while the grid holds one pattern per position.
 * An edit at one position is then an edit of the stored cell, so the other positions showing that cell must change too -
 * otherwise they keep the old value on screen and the exporter can save only one of the two.
 *
 * The share information is the layout's own getCellFileOffset: grid cells with the same file offset are one stored cell.
 * A layout opts in with propagateSharedCells (Composer 669). Works at any granularity (whole pattern, one channel, a row range)
 * because it is decided per cell.
 */
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { getCellFileOffset } from '@/engine/uade/UADEPatternEncoder';
import type { TrackerCell } from '@/types/tracker';

type GridPattern = { channels: Array<{ rows: TrackerCell[] }> };
export interface SharedCellEdit { pattern: number; row: number; channel: number; values: Partial<TrackerCell> }

/**
 * The cells of the other grid patterns that are the same stored cell as a cell `after` changed in pattern `patternIndex`,
 * with the changed fields. Cells that already show the value are not returned.
 */
export function sharedCellEdits(
  layout: UADEPatternLayout,
  patternIndex: number,
  before: GridPattern,
  after: GridPattern,
  patterns: readonly GridPattern[],
): SharedCellEdit[] {
  if (!layout.propagateSharedCells) return [];
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

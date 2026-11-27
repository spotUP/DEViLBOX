/**
 * liveWrite.ts - Hum to Pattern: the live take written into the pattern while
 * the singer is still singing (HUM-TO-PATTERN).
 *
 * No second pitch tracker and no second note writer: the live notes are the
 * live preview's (liveWindow.previewStep, SwiftF0 + segmenter), the cells are
 * writeToPattern.takeCells (the commit's own rules), and each cell goes in the
 * way record mode enters a note (columnPatchAt + setCell). Every preview step
 * writes only the rows whose cell changed since the last step, so a note the
 * segmenter revises is overwritten and a note it drops is cleared again. The
 * full-take pass on stop then rewrites the channel as one undo step (cleanup).
 */
import { useTrackerStore } from '@/stores/useTrackerStore';
import { columnPatchAt } from '@/lib/tracker/columnPatchAt';
import type { QuantisedNote } from './quantise';
import { takeCells, type WriteTarget } from './writeToPattern';

export interface LiveCellWrite {
  row: number;
  note: number;
  instrument: number;
  volume: number;
}

/**
 * The cell writes that bring the pattern from `written` (row -> note this take
 * wrote so far) to `rows`. Rows the take never wrote are left alone, so a
 * live take does not clear the channel ahead of the singer.
 */
export function liveCellWrites(
  rows: readonly QuantisedNote[],
  target: WriteTarget,
  rowCount: number,
  written: ReadonlyMap<number, number>,
): LiveCellWrite[] {
  const out: LiveCellWrite[] = [];
  const take = takeCells(rows, target, rowCount);
  take.cells.forEach((cell, i) => {
    const row = take.startRow + i;
    if (cell.note !== 0 ? written.get(row) !== cell.note : written.has(row)) {
      out.push({ row, note: cell.note, instrument: cell.note ? cell.instrument : 0, volume: cell.note ? cell.volume : 0 });
    }
  });
  return out;
}

/**
 * Write `writes` on `channelIndex` of the shown pattern as record mode does,
 * and update `written` in place. shortcut: note, instrument and volume only
 * (no effect columns) and the shown pattern only; the stop commit writes the
 * effects and the rows past this pattern.
 */
export function applyLiveWrites(writes: readonly LiveCellWrite[], channelIndex: number, written: Map<number, number>): void {
  const { setCell } = useTrackerStore.getState();
  for (const w of writes) {
    setCell(channelIndex, w.row, columnPatchAt(channelIndex, w.row, 0, { note: w.note, instrument: w.instrument, volume: w.volume }));
    if (w.note) written.set(w.row, w.note);
    else written.delete(w.row);
  }
}

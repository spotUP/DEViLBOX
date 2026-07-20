/**
 * Clipboard selection scope — single source of truth for deciding whether a
 * block selection covers the WHOLE cell or only a SPARSE subset of columns.
 *
 * Copy/cut/paste all branch on this distinction. It used to be spelled inline
 * three times as the magic expression `!columnTypes || columnTypes.length === 0
 * || columnTypes.length > 8` (and its inverse for paste), which is fragile: the
 * `8` is the number of individually-selectable columns, and paste hand-wrote the
 * complement, so the two could drift apart. Naming it once removes the magic
 * number and guarantees copy/cut/paste agree by construction.
 */

import type { CursorPosition } from '@typedefs';

type ColumnType = CursorPosition['columnType'];

/**
 * A selection spanning MORE than this many distinct columns is treated as a
 * full-cell selection. The value is the count of individually-selectable
 * columns (note, instrument, volume, effTyp/effParam, effTyp2/effParam2, flag1,
 * flag2) — a span wider than that means the user selected the entire cell.
 */
export const SPARSE_COLUMN_LIMIT = 8;

/**
 * True when the selection should copy/paste the entire cell rather than a
 * sparse subset of its columns. Absent or empty `columnTypes` also means full
 * cell (single-cell / whole-row fallbacks carry no column mask).
 */
export function isFullCellSelection(
  columnTypes: ColumnType[] | undefined,
): boolean {
  return !columnTypes || columnTypes.length === 0 || columnTypes.length > SPARSE_COLUMN_LIMIT;
}

/**
 * True when the selection carries a sparse column mask — the exact complement
 * of {@link isFullCellSelection}, so paste and copy can never disagree.
 */
export function isSparseColumnSelection(
  columnTypes: ColumnType[] | undefined,
): columnTypes is ColumnType[] {
  return !isFullCellSelection(columnTypes);
}

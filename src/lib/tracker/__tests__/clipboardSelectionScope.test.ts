import { describe, it, expect } from 'vitest';
import {
  isFullCellSelection,
  isSparseColumnSelection,
  SPARSE_COLUMN_LIMIT,
} from '../clipboardSelectionScope';
import type { CursorPosition } from '@typedefs';

type ColumnType = CursorPosition['columnType'];

/**
 * LOW: copy/cut/paste used to spell the full-cell-vs-sparse test inline three
 * times as the magic expression `!columnTypes || length === 0 || length > 8`,
 * with paste hand-writing the complement. This locks the single decider so the
 * two branches can never drift apart.
 */
describe('clipboardSelectionScope (LOW: full-cell vs sparse)', () => {
  it('treats an absent column mask as a full-cell selection', () => {
    expect(isFullCellSelection(undefined)).toBe(true);
    expect(isSparseColumnSelection(undefined)).toBe(false);
  });

  it('treats an empty column mask as a full-cell selection', () => {
    expect(isFullCellSelection([])).toBe(true);
    expect(isSparseColumnSelection([])).toBe(false);
  });

  it('treats a single-column mask as sparse', () => {
    const cols: ColumnType[] = ['volume'];
    expect(isSparseColumnSelection(cols)).toBe(true);
    expect(isFullCellSelection(cols)).toBe(false);
  });

  it('treats a mask at the sparse limit as still sparse', () => {
    const cols = Array.from({ length: SPARSE_COLUMN_LIMIT }, () => 'note') as ColumnType[];
    expect(cols.length).toBe(SPARSE_COLUMN_LIMIT);
    expect(isSparseColumnSelection(cols)).toBe(true);
    expect(isFullCellSelection(cols)).toBe(false);
  });

  it('treats a mask wider than the limit as a full-cell selection', () => {
    const cols = Array.from({ length: SPARSE_COLUMN_LIMIT + 1 }, () => 'note') as ColumnType[];
    expect(isFullCellSelection(cols)).toBe(true);
    expect(isSparseColumnSelection(cols)).toBe(false);
  });

  it('is a strict complement — the two predicates never agree', () => {
    const cases: (ColumnType[] | undefined)[] = [
      undefined,
      [],
      ['note'],
      ['note', 'instrument', 'volume'],
      Array.from({ length: SPARSE_COLUMN_LIMIT }, () => 'note') as ColumnType[],
      Array.from({ length: SPARSE_COLUMN_LIMIT + 3 }, () => 'note') as ColumnType[],
    ];
    for (const c of cases) {
      expect(isFullCellSelection(c)).toBe(!isSparseColumnSelection(c));
    }
  });
});

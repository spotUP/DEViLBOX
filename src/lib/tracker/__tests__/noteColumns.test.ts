import { describe, it, expect } from 'vitest';
import { getColumnField, setColumnField, cellNoteColumns, columnNotes, copyExtraField, clearExtraField, mergeExtraField, setNoteColumn, maxNoteColumns } from '../noteColumns';

describe('noteColumns', () => {
  it('holds more than four columns', () => {
    const c: Parameters<typeof setNoteColumn>[0] = { note: 10 };
    setNoteColumn(c, 6, 40, 3, 2);
    expect(cellNoteColumns(c)).toBe(7);
    expect(getColumnField(c, 6, 'note')).toBe(40);
    expect(getColumnField(c, 6, 'delay')).toBe(2);
    expect(columnNotes(c)).toEqual([10, 0, 0, 0, 0, 0, 40]);
  });
  it('column 0 maps to the cell fields and clearing trims', () => {
    const c: Parameters<typeof setNoteColumn>[0] = { note: 5 };
    expect(getColumnField(c, 0, 'note')).toBe(5);
    setColumnField(c, 2, 'note', 9);
    setColumnField(c, 2, 'note', undefined);
    expect(c.extraNotes).toBeUndefined();
  });
  it('copy, clear, merge act on every extra column', () => {
    const a: Parameters<typeof setNoteColumn>[0] = {};
    const b: Parameters<typeof setNoteColumn>[0] = {};
    setColumnField(a, 1, 'note', 1); setColumnField(a, 4, 'note', 4);
    copyExtraField(b, a, 'note');
    expect(columnNotes(b)).toEqual([0, 1, 0, 0, 4]);
    clearExtraField(b, 'note');
    expect(b.extraNotes).toBeUndefined();
    setColumnField(b, 1, 'note', 7);
    mergeExtraField(b, a, 'note');
    expect(columnNotes(b)).toEqual([0, 7, 0, 0, 4]);
    expect(maxNoteColumns([a, b, undefined])).toBe(5);
  });
});

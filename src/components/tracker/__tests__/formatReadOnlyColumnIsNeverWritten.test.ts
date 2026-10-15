/**
 * KIE-3.1: a read-only format column (a derived "meaning" text) is landed on by the cursor but never written:
 * typing into it, Delete on it and paste all skip it, while the writable columns beside it still take edits.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { handleFormatKey, type FormatKeyHost } from '../formatKeyboard';
import { pasteFormatRows, type ColumnDef, type FormatChannel } from '@/components/shared/format-editor-types';
import { useEditorStore } from '@stores/useEditorStore';

const col = (key: string, over: Partial<ColumnDef> = {}): ColumnDef => ({
  key, label: key, charWidth: 2, type: 'hex', hexDigits: 2, color: 'x', emptyColor: 'x', emptyValue: 0, formatter: String, ...over,
});
const COLS = [col('value'), col('shown', { readOnly: true })];
const CHANNELS: FormatChannel[] = [{ label: 'T', patternLength: 4, rows: [{ value: 0, shown: 0 }, { value: 0, shown: 0 }, { value: 0, shown: 0 }, { value: 0, shown: 0 }] }];

const hostAt = (columnIndex: number, writes: Array<[string, number]>): FormatKeyHost => ({
  columns: COLS, channels: CHANNELS, isPlaying: () => false, playbackRow: () => 0,
  getCursor: () => ({ channelIndex: 0, rowIndex: 1, columnIndex }), setCursor: () => {},
  getSelection: () => null, setSelection: () => {},
  onCellChange: (_c, _r, key, value) => { writes.push([key, value]); },
  copy: () => {}, clearSelection: () => {}, paste: () => {}, transpose: () => {},
  hexTyped: { current: null }, heldArrow: { current: null }, arrowRaf: { current: 0 },
});
const key = (k: string) => ({ key: k, preventDefault: () => {}, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false }) as unknown as KeyboardEvent;

beforeEach(() => { useEditorStore.setState({ recordMode: true }); });

describe('a read-only column', () => {
  it('ignores typed digits and Delete but its writable neighbour takes them', () => {
    const writes: Array<[string, number]> = [];
    handleFormatKey(key('5'), hostAt(1, writes));
    handleFormatKey(key('Delete'), hostAt(1, writes));
    expect(writes).toEqual([]);
    handleFormatKey(key('5'), hostAt(0, writes));
    expect(writes).toEqual([['value', 5]]);
  });

  it('is skipped by paste while the writable column is written', () => {
    const writes: Array<[number, string]> = [];
    const pasted = pasteFormatRows([{ value: 7, shown: 9 }, { value: 8, shown: 9 }], COLS, 0, 2, 4, (_c, r, k) => { writes.push([r, k]); });
    expect(pasted).toBe(2);
    expect(writes).toEqual([[2, 'value'], [3, 'value']]);
  });
});

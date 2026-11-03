/**
 * Owner 2026-11-03: "arrow left/right dont let me change column in the matrix editor only tab. it should work
 * exactly like the pattern editor."
 *
 * The format grid's ArrowLeft/ArrowRight clamped the cursor inside one channel's columns. An order matrix has two
 * columns per channel (pattern, transpose), so the arrows could never reach the next voice. The pattern editor
 * (useCursorStore 'left'/'right') steps past a channel's edge onto the neighbouring channel and wraps at the ends;
 * the format grid now does the same.
 */
import { describe, it, expect } from 'vitest';
import { handleFormatKey, type FormatCursor, type FormatKeyHost } from '@/components/tracker/formatKeyboard';
import type { ColumnDef, FormatChannel } from '@/components/shared/format-editor-types';

const COLUMNS: ColumnDef[] = [
  { key: 'pat', label: 'Pat', charWidth: 2, type: 'hex', hexDigits: 2, color: '#fff', emptyColor: '#000', emptyValue: undefined, formatter: (v: number) => v.toString(16) },
  { key: 'trans', label: 'Tr', charWidth: 3, type: 'hex', hexDigits: 2, color: '#fff', emptyColor: '#000', emptyValue: undefined, formatter: (v: number) => v.toString(16) },
];
const CHANNELS: FormatChannel[] = [0, 1, 2].map((v) => ({
  label: `Voice ${v}`, patternLength: 4, columns: COLUMNS, rows: [0, 1, 2, 3].map(() => ({ pat: 0, trans: 0 })),
}));

function press(keys: string[], start: FormatCursor, shiftKey = false): FormatCursor[] {
  let cursor = start;
  const seen: FormatCursor[] = [];
  const host: FormatKeyHost = {
    columns: COLUMNS, channels: CHANNELS, isPlaying: () => false, playbackRow: () => 0,
    getCursor: () => cursor, setCursor: (u) => { cursor = u(cursor); },
    getSelection: () => null, setSelection: () => {},
    copy: () => {}, clearSelection: () => {}, paste: () => {}, transpose: () => {},
    hexTyped: { current: null }, heldArrow: { current: null }, arrowRaf: { current: 0 },
  };
  for (const key of keys) {
    handleFormatKey({ key, preventDefault: () => {}, ctrlKey: false, metaKey: false, altKey: false, shiftKey, repeat: false } as unknown as KeyboardEvent, host);
    seen.push({ ...cursor });
  }
  return seen;
}

const at = (channelIndex: number, columnIndex: number): FormatCursor => ({ channelIndex, rowIndex: 2, columnIndex });

describe('format grid arrows move across channels like the pattern editor', () => {
  it('ArrowRight walks every column of every channel and wraps to the first', () => {
    expect(press(['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight'], at(0, 0)))
      .toEqual([at(0, 1), at(1, 0), at(1, 1), at(2, 0), at(2, 1), at(0, 0)]);
  });

  it('ArrowLeft walks back onto the previous channel\'s last column and wraps to the last channel', () => {
    expect(press(['ArrowLeft', 'ArrowLeft', 'ArrowLeft'], at(1, 1)))
      .toEqual([at(1, 0), at(0, 1), at(0, 0)]);
    expect(press(['ArrowLeft'], at(0, 0))).toEqual([at(2, 1)]);
  });

  it('Shift+arrow (selection) stays in its channel: the format selection is one channel\'s columns', () => {
    expect(press(['ArrowRight', 'ArrowRight'], at(0, 0), true)).toEqual([at(0, 1), at(0, 1)]);
  });
});

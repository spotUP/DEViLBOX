/**
 * SF2-MATRIX-TRN-ENTRY: the order matrix Trn column displays signed semitones (+3), so typing +3 / -2 must store the
 * matching raw byte (0xA3 / 0x9E), and what was typed must read back the same through the column's own formatter.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { handleFormatKey, type FormatKeyHost } from '@/components/tracker/formatKeyboard';
import type { FormatChannel } from '@/components/shared/format-editor-types';
import { useEditorStore } from '@stores/useEditorStore';
import { SF2_ORDER_COLUMNS, sf2TransposeFromString, sf2TransposeToString } from './SF2OrderMatrix';

const TRN = SF2_ORDER_COLUMNS.findIndex((c) => c.key === 'transpose');
const CHANNELS: FormatChannel[] = [{ label: 'T1', patternLength: 4, rows: [0, 1, 2, 3].map(() => ({ seq: 0, transpose: 0xA0, loop: 0 })) }];

function typeInto(keys: string[]): number[] {
  const writes: number[] = [];
  const host: FormatKeyHost = {
    columns: SF2_ORDER_COLUMNS, channels: CHANNELS, isPlaying: () => false, playbackRow: () => 0,
    getCursor: () => ({ channelIndex: 0, rowIndex: 1, columnIndex: TRN }), setCursor: () => {},
    getSelection: () => null, setSelection: () => {},
    onCellChange: (_c, _r, k, v) => { if (k === 'transpose') writes.push(v); },
    copy: () => {}, clearSelection: () => {}, paste: () => {}, transpose: () => {},
    hexTyped: { current: null }, heldArrow: { current: null }, arrowRaf: { current: 0 },
  };
  for (const k of keys) {
    handleFormatKey({ key: k, preventDefault: () => {}, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false } as unknown as KeyboardEvent, host);
  }
  return writes;
}

beforeEach(() => { useEditorStore.setState({ recordMode: true }); });

describe('SF2 order matrix Trn entry', () => {
  it('typing +3 and -2 stores the raw bytes the display reads back as +3 and -2', () => {
    const plus = typeInto(['+', '3']);
    expect(plus[plus.length - 1]).toBe(0xA3);
    expect(sf2TransposeToString(plus[plus.length - 1])).toBe('+3');
    const minus = typeInto(['-', '2']);
    expect(minus[minus.length - 1]).toBe(0x9E);
    expect(sf2TransposeToString(minus[minus.length - 1])).toBe('-2');
  });

  it('parses unsigned text as positive and rejects bytes outside 0x80..0xFD', () => {
    expect(sf2TransposeFromString('5')).toBe(0xA5);
    expect(sf2TransposeFromString('+0')).toBe(0xA0);
    expect(sf2TransposeFromString('-32')).toBe(0x80);
    expect(sf2TransposeFromString('-33')).toBeNull();
    expect(sf2TransposeFromString('+94')).toBeNull();
    expect(sf2TransposeFromString('x')).toBeNull();
  });
});

import { describe, it, expect, vi } from 'vitest';

vi.mock('@engine/TrackerReplayer', () => ({
  getTrackerReplayer: () => { throw new Error('no audio'); },
  peekTrackerReplayer: () => null,
}));

import { useTrackerStore } from '../useTrackerStore';
import { resampleRowsHelper, nearestInstrumentAbove } from '../tracker/patternEditActions';
import { pasteOverflowHelper } from '../tracker/clipboardActions';
import type { BlockSelection, ClipboardData, CursorPosition, Pattern } from '@typedefs';

function pat(): Pattern {
  const st = useTrackerStore.getState();
  return structuredClone(st.patterns[st.currentPatternIndex]);
}
const sel = (endRow: number): BlockSelection => ({
  startChannel: 0, endChannel: 0, startRow: 0, endRow,
  startColumn: 'note', endColumn: 'note', columnTypes: ['note'],
});
const notes = (p: Pattern, n: number) => Array.from({ length: n }, (_, r) => p.channels[0].rows[r].note);

describe('pattern row operations', () => {
  it('collapses and expands rows by amount', () => {
    const p = pat();
    [1, 2, 3, 4, 5, 6].forEach((n, r) => { p.channels[0].rows[r].note = n; });
    resampleRowsHelper(p, sel(5), 2, 'collapse');
    expect(notes(p, 6)).toEqual([1, 3, 5, 0, 0, 0]);
    resampleRowsHelper(p, sel(5), 2, 'expand');
    expect(notes(p, 6)).toEqual([1, 0, 3, 0, 5, 0]);
  });
  it('absorbs the nearest instrument above', () => {
    const p = pat();
    p.channels[0].rows[1].instrument = 7;
    expect(nearestInstrumentAbove(p, 0, 3)).toBe(7);
    expect(nearestInstrumentAbove(p, 0, 0)).toBeNull();
  });
  it('paste overflow continues in the next pattern of the order', () => {
    const a = pat(); const b = pat();
    const len = a.length;
    const cell = (note: number) => ({ ...a.channels[0].rows[0], note });
    const clip: ClipboardData = { channels: 1, rows: 3, data: [[cell(1), cell(2), cell(3)]] };
    const touched = pasteOverflowHelper([a, b], [0, 1], 0, { channelIndex: 0, rowIndex: len - 1, columnType: 'note' } as CursorPosition, clip, 0xFFFF);
    expect(touched).toEqual([0, 1]);
    expect(a.channels[0].rows[len - 1].note).toBe(1);
    expect(notes(b, 2)).toEqual([2, 3]);
  });
});

import { describe, it, expect, vi } from 'vitest';

vi.mock('@engine/TrackerReplayer', () => ({
  getTrackerReplayer: () => { throw new Error('no audio'); },
  peekTrackerReplayer: () => null,
  syncFurnaceCellEdit: () => {},
}));

import { useTrackerStore } from '../useTrackerStore';
import { pasteHelper, pasteMixHelper, clipboardWithInstrument } from '../tracker/clipboardActions';
import { applyInstrumentToSelectionHelper } from '../tracker/patternEditActions';
import type { ClipboardData, CursorPosition, Pattern, TrackerCell } from '@typedefs';

const ALL = 0xFFFF;
const cursor = { channelIndex: 0, rowIndex: 0, columnType: 'note' } as CursorPosition;

function fixed(): { pattern: Pattern; clip: ClipboardData } {
  const st = useTrackerStore.getState();
  const pattern = structuredClone(st.patterns[st.currentPatternIndex]);
  const cell = (note: number, instrument: number): TrackerCell => ({ ...pattern.channels[0].rows[0], note, instrument });
  const clip: ClipboardData = { channels: 1, rows: 3, data: [[cell(49, 1), cell(0, 0), cell(52, 2)]] };
  pattern.channels[0].rows[0] = { ...pattern.channels[0].rows[0], note: 60, instrument: 7 };
  return { pattern, clip };
}
const notes = (p: Pattern) => [0, 1, 2].map((r) => [p.channels[0].rows[r].note, p.channels[0].rows[r].instrument]);

describe('paste with instrument', () => {
  it('rewrites the instrument of pasted notes only', () => {
    const { pattern, clip } = fixed();
    pasteHelper(pattern, cursor, clipboardWithInstrument(clip, 9), ALL);
    expect(notes(pattern)).toEqual([[49, 9], [0, 0], [52, 9]]);
  });
  it('background mode keeps existing cells and fills empty ones', () => {
    const { pattern, clip } = fixed();
    pasteMixHelper(pattern, cursor, clipboardWithInstrument(clip, 9), ALL);
    expect(notes(pattern)).toEqual([[60, 7], [0, 0], [52, 9]]);
  });
  it('change instrument of selection sets every note and skips empty rows', () => {
    const { pattern, clip } = fixed();
    pasteHelper(pattern, cursor, clip, ALL);
    applyInstrumentToSelectionHelper(pattern, { startChannel: 0, endChannel: 0, startRow: 0, endRow: 2 } as never, cursor, 5);
    expect(notes(pattern)).toEqual([[49, 5], [0, 0], [52, 5]]);
  });
});

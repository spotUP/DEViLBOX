import { describe, it, expect, vi } from 'vitest';

vi.mock('@engine/TrackerReplayer', () => ({
  getTrackerReplayer: () => { throw new Error('no audio'); },
  peekTrackerReplayer: () => null,
}));

import { useTrackerStore } from '../useTrackerStore';
import { useCursorStore } from '../useCursorStore';
import { parseMPTClipboard } from '@/lib/import/MPTClipboardParser';

const TEXT = 'ModPlug Tracker  XM\r\n|C-501v64A01|---........|\r\n|===........|D#302...000|\r\n';

describe('OpenMPT clipboard', () => {
  it('parses fixed-width rows', () => {
    const mpt = parseMPTClipboard(TEXT)!;
    expect(mpt.channels).toBe(2);
    expect(mpt.rows).toHaveLength(2);
    const c = mpt.rows[0][0];
    expect([c.note, c.instrument, c.volume, c.effTyp, c.eff]).toEqual([61, 1, 0x10 + 64, 10, 1]);
    expect(mpt.rows[1][0].note).toBe(97);
    expect(mpt.rows[1][1].note).toBe(40);
  });
  it('rejects other text', () => {
    expect(parseMPTClipboard('hello\nworld')).toBeNull();
    expect(parseMPTClipboard('ModPlug Tracker  XM\n|ZZZ........|')).toBeNull();
  });
  it('pastes at the cursor, undo removes it and restores the cursor', () => {
    useCursorStore.setState({ cursor: { ...useCursorStore.getState().cursor, channelIndex: 0, rowIndex: 3 } });
    expect(useTrackerStore.getState().pasteOpenMpt('nope')).toBe(false);
    expect(useTrackerStore.getState().pasteOpenMpt(TEXT)).toBe(true);
    const st = useTrackerStore.getState();
    expect(st.patterns[st.currentPatternIndex].channels[0].rows[3].note).toBe(61);
    useCursorStore.setState({ cursor: { ...useCursorStore.getState().cursor, rowIndex: 10 } });
    useTrackerStore.getState().undoEdit();
    const after = useTrackerStore.getState();
    expect(after.patterns[after.currentPatternIndex].channels[0].rows[3].note).toBe(0);
    expect(useCursorStore.getState().cursor.rowIndex).toBe(3);
  });
});

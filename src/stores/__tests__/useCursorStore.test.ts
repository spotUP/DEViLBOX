import { describe, it, expect, beforeEach } from 'vitest';
import { useTrackerStore } from '../useTrackerStore';
import { useCursorStore } from '../useCursorStore';
import { resetStore } from './_harness';

/**
 * FT2 rule: an UNMODIFIED cursor move (plain arrow / nav) discards the block
 * mark. A Shift/Alt+move — which builds a selection — must keep it. Before this
 * fix moveCursor never touched `selection`, so a stale block survived plain
 * navigation and the next Ctrl+C/paste/transpose operated on a block the user
 * thought they had abandoned.
 */
describe('useCursorStore — moveCursor selection clearing (M1)', () => {
  beforeEach(() => {
    resetStore(useTrackerStore);
    useCursorStore.setState({
      cursor: { channelIndex: 0, rowIndex: 4, noteColumnIndex: 0, columnType: 'note', digitIndex: 0 },
      selection: null,
    });
  });

  it('an unmodified move discards the block mark', () => {
    useCursorStore.getState().startSelection();
    expect(useCursorStore.getState().selection).not.toBeNull();

    useCursorStore.getState().moveCursor('down');

    expect(useCursorStore.getState().selection).toBeNull();
  });

  it('a selecting move (preserveSelection) keeps the mark', () => {
    useCursorStore.getState().startSelection();
    useCursorStore.getState().moveCursor('down', { preserveSelection: true });

    expect(useCursorStore.getState().selection).not.toBeNull();
  });
});

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

/**
 * FT2 rule: a keyboard Shift+select must build the same multi-column span as a
 * mouse drag over the same cells. endSelection used to update only end
 * row/channel/column and leave `columnTypes` frozen at the start column, so
 * Shift-selecting note->volume yielded a 1-column clipboard shape while
 * dragging the same span yielded 3 columns.
 */
describe('useCursorStore — keyboard selection spans columns like the mouse (M4)', () => {
  beforeEach(() => {
    resetStore(useTrackerStore);
    useCursorStore.setState({
      cursor: { channelIndex: 0, rowIndex: 2, noteColumnIndex: 0, columnType: 'note', digitIndex: 0 },
      selection: null,
    });
  });

  it('endSelection recomputes columnTypes across the note->instrument->volume span', () => {
    // Mark at the note column, then extend the cursor to the volume column.
    useCursorStore.getState().startSelection();
    expect(useCursorStore.getState().selection?.columnTypes).toEqual(['note']);

    useCursorStore.setState({
      cursor: { channelIndex: 0, rowIndex: 5, noteColumnIndex: 0, columnType: 'volume', digitIndex: 0 },
    });
    useCursorStore.getState().endSelection();

    const sel = useCursorStore.getState().selection;
    expect(sel?.endRow).toBe(5);
    expect(sel?.endColumn).toBe('volume');
    // Same span the mouse-drag path (updateSelection) produces.
    expect(sel?.columnTypes).toEqual(['note', 'instrument', 'volume']);
  });
});

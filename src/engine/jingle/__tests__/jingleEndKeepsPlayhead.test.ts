/**
 * A song started while the startup jingle plays (Right Shift on a fresh load)
 * must keep playing where it is when the jingle ends. The jingle parks the
 * cursor on the mouth row and puts it back at the end; that is a view restore.
 * It used moveCursorToRow, the user cursor move, which seeks a playing
 * replayer, so the jingle end jumped playback back to row 0 and row 0 sounded
 * twice.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const replayer = {
  isPlaying: vi.fn(() => true),
  getCurrentPosition: vi.fn(() => 0),
  seekTo: vi.fn(),
};

vi.mock('@engine/TrackerReplayer', () => ({
  peekTrackerReplayer: () => replayer,
  getTrackerReplayer: () => replayer,
}));

import { injectMouthPatterns, teardownMouthPatterns, MOUTH_CENTER_ROW } from '../JinglePatterns';
import { useCursorStore } from '@stores/useCursorStore';

describe('startup jingle end with a song playing', () => {
  beforeEach(() => {
    replayer.seekTo.mockClear();
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    useCursorStore.setState({
      cursor: { channelIndex: 0, rowIndex: 0, noteColumnIndex: 0, columnType: 'note', digitIndex: 0 },
      selection: null,
    });
  });

  it('parks and restores the cursor row without seeking the playhead', () => {
    injectMouthPatterns();
    expect(useCursorStore.getState().cursor.rowIndex).toBe(MOUTH_CENTER_ROW);

    teardownMouthPatterns();

    expect(useCursorStore.getState().cursor.rowIndex).toBe(0);
    expect(replayer.seekTo).not.toHaveBeenCalled();
  });

  it('a user cursor move still seeks a playing replayer', () => {
    useCursorStore.getState().moveCursorToRow(4);
    expect(replayer.seekTo).toHaveBeenCalledWith(0, 4);
  });
});

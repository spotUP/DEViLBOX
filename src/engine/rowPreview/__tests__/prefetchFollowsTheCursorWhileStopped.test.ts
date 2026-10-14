/**
 * RP-6: the cursor prefetch asks for the row under the cursor once the cursor has rested, only while the song is stopped.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// moveCursorToRow tells the replayer; a stopped replayer is all it needs here.
vi.mock('@/engine/TrackerReplayer', () => {
  const replayer = new Proxy({}, { get: (_t, k) => (k === 'isPlaying' ? () => false : () => undefined) });
  return { getTrackerReplayer: () => replayer, peekTrackerReplayer: () => null };
});

import { startRowPreviewPrefetch, ROW_PREFETCH_DELAY_MS } from '../rowPreviewPrefetch';
import { useCursorStore } from '@stores/useCursorStore';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useTransportStore } from '@stores/useTransportStore';

describe('row preview prefetch follows the cursor while stopped', () => {
  let stop: () => void;
  const prepare = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    prepare.mockClear();
    useTransportStore.setState({ isPlaying: false });
    useCursorStore.getState().moveCursorToRow(0);
    useTrackerStore.setState({ currentPositionIndex: 2 });
    stop = startRowPreviewPrefetch({ prepare });
  });
  afterEach(() => { stop(); vi.useRealTimers(); });

  it('three cursor moves within the debounce prepare only the last row', () => {
    useCursorStore.getState().moveCursorToRow(3);
    vi.advanceTimersByTime(50);
    useCursorStore.getState().moveCursorToRow(7);
    vi.advanceTimersByTime(50);
    useCursorStore.getState().moveCursorToRow(9);
    expect(prepare).not.toHaveBeenCalled();
    vi.advanceTimersByTime(ROW_PREFETCH_DELAY_MS);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledWith(2, 9);
  });

  it('a move of the song position prepares the row on the new position', () => {
    useTrackerStore.setState({ currentPositionIndex: 5 });
    vi.advanceTimersByTime(ROW_PREFETCH_DELAY_MS);
    expect(prepare).toHaveBeenCalledWith(5, 0);
  });

  it('prepares nothing while the song plays', () => {
    useTransportStore.setState({ isPlaying: true });
    useCursorStore.getState().moveCursorToRow(4);
    vi.advanceTimersByTime(ROW_PREFETCH_DELAY_MS * 3);
    expect(prepare).not.toHaveBeenCalled();
  });

  it('prepares nothing once stopped', () => {
    useCursorStore.getState().moveCursorToRow(4);
    stop();
    vi.advanceTimersByTime(ROW_PREFETCH_DELAY_MS * 3);
    expect(prepare).not.toHaveBeenCalled();
  });
});

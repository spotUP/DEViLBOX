/**
 * The playhead of a tune that has just been switched to. A subsong switch loads another tune, and
 * another tune starts at its start: song position 0, row 0. Two things would carry the old tune's
 * place across - the transport/tracker stores (a stopped song starts where the cursor is) and the
 * playback hook's structural reload (usePatternPlayback restores the replayer's old position after a
 * reload) - so the switch rewinds both, once, here.
 */
import { useTrackerStore } from '@stores/useTrackerStore';
import { useTransportStore } from '@stores/useTransportStore';
import { useCursorStore } from '@stores/useCursorStore';
import { useWasmPositionStore } from '@stores/useWasmPositionStore';

/** How long a rewind request stays valid for the reload the switch causes. */
const REWIND_WINDOW_MS = 5000;
let rewindRequestedAt = -Infinity;

/** Put the stores' playhead at the start and ask the next playback reload to start there too. */
export function rewindPlayhead(): void {
  rewindRequestedAt = Date.now();
  const tracker = useTrackerStore.getState();
  tracker.setCurrentPosition(0);
  tracker.setCurrentPattern(tracker.patternOrder[0] ?? 0);
  useTransportStore.getState().setCurrentRow(0);
  const cursor = useCursorStore.getState();
  useCursorStore.setState({ cursor: { ...cursor.cursor, rowIndex: 0 } });
  useWasmPositionStore.setState({ row: 0, songPos: 0 });
}

/**
 * The playback hook's reload asks where to resume: the place the replayer was at, or the start when a
 * subsong switch asked for a rewind (consumed by this call).
 */
export function reloadResumePoint(songPos: number, row: number): { songPos: number; row: number } {
  if (Date.now() - rewindRequestedAt <= REWIND_WINDOW_MS) {
    rewindRequestedAt = -Infinity;
    return { songPos: 0, row: 0 };
  }
  return { songPos, row };
}

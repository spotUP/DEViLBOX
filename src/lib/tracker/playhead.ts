/**
 * The playhead of a tune that has just been switched to. A subsong switch loads another tune, and
 * another tune starts at its start: song position 0, row 0. Two things would carry the old tune's
 * place across - the transport/tracker stores (a stopped song starts where the cursor is) and the
 * playback hook's structural reload (usePatternPlayback restores the replayer's old position after a
 * reload). The switch rewinds the stores here; the reload decides from the tune identity.
 */
import { useTrackerStore } from '@stores/useTrackerStore';
import { useTransportStore } from '@stores/useTransportStore';
import { useCursorStore } from '@stores/useCursorStore';
import { useWasmPositionStore } from '@stores/useWasmPositionStore';
import { subsongStatus } from '@/lib/tracker/subsongSwitch';

/** Put the stores' playhead at the start (a stopped song starts where they are). */
export function rewindPlayhead(): void {
  const tracker = useTrackerStore.getState();
  tracker.setCurrentPosition(0);
  tracker.setCurrentPattern(tracker.patternOrder[0] ?? 0);
  useTransportStore.getState().setCurrentRow(0);
  const cursor = useCursorStore.getState();
  useCursorStore.setState({ cursor: { ...cursor.cursor, rowIndex: 0 } });
  useWasmPositionStore.setState({ row: 0, songPos: 0 });
}

/** Which tune of a multi-tune file is loaded: null for songs without subsongs. */
export function tuneIdentity(f: Parameters<typeof subsongStatus>[0]): string | null {
  const status = subsongStatus(f);
  return status ? `${status.source}:${status.current}` : null;
}

/**
 * Where the playback hook's reload resumes: the replayer's old place, or the start when the TUNE
 * changed (decided from the tune identity the replayer last loaded, not from time).
 */
export function resumePointAfterReload(
  prevTune: string | null,
  nextTune: string | null,
  songPos: number,
  row: number,
): { songPos: number; row: number } {
  return prevTune !== nextTune ? { songPos: 0, row: 0 } : { songPos, row };
}

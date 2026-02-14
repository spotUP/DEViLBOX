import { useTrackerStore } from '@stores/useTrackerStore';
import { useTransportStore } from '@stores/useTransportStore';
import { getToneEngine } from '@engine/ToneEngine';

/**
 * Play from Cursor - Start playback from current pattern position
 *
 * Classic tracker command (Alt+F5 in FastTracker 2).
 * Starts playback from the current row instead of pattern beginning.
 * Stops existing playback before restarting from cursor.
 *
 * @returns true (always starts playback from cursor)
 */
export function playFromCursor(): boolean {
  const { cursor } = useTrackerStore.getState();
  const { isPlaying, stop, play } = useTransportStore.getState();

  // Stop if currently playing
  if (isPlaying) {
    stop();
  }

  // Set playback start position to cursor row
  useTransportStore.setState({ startRow: cursor.rowIndex });

  // Start playback (async)
  getToneEngine().init().then(() => play());

  return true;
}

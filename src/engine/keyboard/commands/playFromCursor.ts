import * as Tone from 'tone';
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
  // CRITICAL for iOS: Tone.start() MUST be called synchronously within user gesture
  Tone.start();
  
  const { cursor } = useTrackerStore.getState();
  const { isPlaying, stop, play, setCurrentRow } = useTransportStore.getState();

  // Stop if currently playing
  if (isPlaying) {
    stop();
  }

  // Set playback start position to cursor row
  setCurrentRow(cursor.rowIndex);

  // Start playback (async)
  getToneEngine()
    .init()
    .then(() => play())
    .catch((error) => {
      console.error('[playFromCursor] Failed to initialize audio engine:', error);
    });

  return true;
}

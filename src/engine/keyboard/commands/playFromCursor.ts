import { useTransportStore } from '@stores/useTransportStore';
import { useTrackerStore } from '@stores/useTrackerStore';

/**
 * Play from Cursor - Start playback from current pattern position
 *
 * Classic tracker command (Alt+F5 in FastTracker 2).
 * Starts playback from the current row instead of pattern beginning.
 *
 * @returns true if playback started, false if already playing
 */
export function playFromCursor(): boolean {
  const { isPlaying, play, setCurrentRow, setCurrentPattern } = useTransportStore.getState();

  // Don't interrupt existing playback
  if (isPlaying) {
    return false;
  }

  // Get current position from tracker
  const { currentRow, currentPatternIndex } = useTrackerStore.getState();

  // Set playback position to cursor location
  setCurrentPattern(currentPatternIndex);
  setCurrentRow(currentRow);

  // Start playback
  play();

  return true;
}

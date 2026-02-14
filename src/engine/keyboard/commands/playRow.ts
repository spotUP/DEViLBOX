import { useTrackerStore } from '@stores/useTrackerStore';
import { useTransportStore } from '@stores/useTransportStore';

/**
 * Play Row (Audition) - Play only the current row
 *
 * Classic tracker command (Keypad Enter in Impulse Tracker).
 * Plays the current row once without starting full pattern playback.
 * Used for quick testing of notes/instruments/effects.
 *
 * @returns true (always plays row)
 */
export function playRow(): boolean {
  const { cursor } = useTrackerStore.getState();
  const { isPlaying, stop, playRow: playRowAction } = useTransportStore.getState();

  // Stop any existing playback
  if (isPlaying) {
    stop();
  }

  // Play only the current row
  playRowAction(cursor.rowIndex);

  return true;
}

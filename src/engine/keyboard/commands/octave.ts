/**
 * Octave Commands - Octave up/down navigation
 */

import { useTrackerStore } from '@stores/useTrackerStore';
import { useUIStore } from '@stores/useUIStore';

/**
 * Decrease octave by 1
 */
export function prevOctave(): boolean {
  const { currentOctave, setCurrentOctave } = useTrackerStore.getState();
  const newOctave = Math.max(0, currentOctave - 1);
  setCurrentOctave(newOctave);
  useUIStore.getState().setStatusMessage(`Octave ${newOctave}`, false, 1000);
  return true;
}

/**
 * Increase octave by 1
 */
export function nextOctave(): boolean {
  const { currentOctave, setCurrentOctave } = useTrackerStore.getState();
  const newOctave = Math.min(9, currentOctave + 1);
  setCurrentOctave(newOctave);
  useUIStore.getState().setStatusMessage(`Octave ${newOctave}`, false, 1000);
  return true;
}

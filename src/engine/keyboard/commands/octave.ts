/**
 * Octave Commands - Octave up/down navigation
 */

import { useEditorStore } from '@stores/useEditorStore';
import { useUIStore } from '@stores/useUIStore';

/**
 * Decrease octave by 1
 */
export function prevOctave(): boolean {
  const { currentOctave, setCurrentOctave } = useEditorStore.getState();
  const newOctave = Math.max(0, currentOctave - 1);
  setCurrentOctave(newOctave);
  useUIStore.getState().setStatusMessage(`Octave ${newOctave}`, false, 1000);
  return true;
}

/**
 * Increase octave by 1
 */
export function nextOctave(): boolean {
  const { currentOctave, setCurrentOctave } = useEditorStore.getState();
  const newOctave = Math.min(9, currentOctave + 1);
  setCurrentOctave(newOctave);
  useUIStore.getState().setStatusMessage(`Octave ${newOctave}`, false, 1000);
  return true;
}

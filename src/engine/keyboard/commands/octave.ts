/**
 * Octave Commands - Octave up/down navigation
 */

import { useEditorStore } from '@stores/useEditorStore';
import { useUIStore } from '@stores/useUIStore';
import { TYPING_OCTAVE_HIGHEST, TYPING_OCTAVE_LOWEST } from '@/lib/tracker/noteValue';

/**
 * Decrease octave by 1
 */
export function prevOctave(): boolean {
  const { currentOctave, setCurrentOctave } = useEditorStore.getState();
  const newOctave = Math.max(TYPING_OCTAVE_LOWEST, currentOctave - 1);
  setCurrentOctave(newOctave);
  useUIStore.getState().setStatusMessage(`Octave ${newOctave}`, false, 1000);
  return true;
}

/**
 * Increase octave by 1
 */
export function nextOctave(): boolean {
  const { currentOctave, setCurrentOctave } = useEditorStore.getState();
  const newOctave = Math.min(TYPING_OCTAVE_HIGHEST, currentOctave + 1);
  setCurrentOctave(newOctave);
  useUIStore.getState().setStatusMessage(`Octave ${newOctave}`, false, 1000);
  return true;
}

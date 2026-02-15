/**
 * Edit Commands - Pattern editing operations
 */

import { useTrackerStore } from '@stores/useTrackerStore';
import { useUIStore } from '@stores/useUIStore';

/**
 * Delete note/data at cursor position
 */
export function deleteNote(): boolean {
  const { cursor, clearCell } = useTrackerStore.getState();
  clearCell(cursor.channelIndex, cursor.rowIndex);
  return true;
}

/**
 * Delete row and pull up remaining rows
 */
export function deleteAndPull(): boolean {
  const { cursor, deleteRow } = useTrackerStore.getState();
  deleteRow(cursor.channelIndex, cursor.rowIndex);
  useUIStore.getState().setStatusMessage('Row deleted', false, 1000);
  return true;
}

/**
 * Insert empty row at cursor (push down)
 */
export function insertRow(): boolean {
  const { cursor, insertRow: insert } = useTrackerStore.getState();
  insert(cursor.channelIndex, cursor.rowIndex);
  useUIStore.getState().setStatusMessage('Row inserted', false, 1000);
  return true;
}

/**
 * Toggle edit/record mode
 */
export function toggleEditMode(): boolean {
  const store = useTrackerStore.getState();
  store.toggleRecordMode();
  const newMode = useTrackerStore.getState().recordMode;
  useUIStore.getState().setStatusMessage(newMode ? 'Edit mode ON' : 'Edit mode OFF', false, 1000);
  return true;
}

/**
 * Clear entire pattern
 */
export function clearPattern(): boolean {
  useTrackerStore.getState().clearPattern();
  useUIStore.getState().setStatusMessage('Pattern cleared', false, 1000);
  return true;
}

/**
 * Clear current channel
 */
export function clearChannel(): boolean {
  const { cursor, clearChannel: clear } = useTrackerStore.getState();
  clear(cursor.channelIndex);
  useUIStore.getState().setStatusMessage(`Channel ${cursor.channelIndex + 1} cleared`, false, 1000);
  return true;
}

/**
 * Set current octave (0-9)
 * Creates factory functions for each octave
 */
function createSetOctaveCommand(octave: number) {
  return function(): boolean {
    useTrackerStore.getState().setCurrentOctave(octave);
    useUIStore.getState().setStatusMessage(`Octave ${octave}`, false, 1000);
    return true;
  };
}

export const setOctave0 = createSetOctaveCommand(0);
export const setOctave1 = createSetOctaveCommand(1);
export const setOctave2 = createSetOctaveCommand(2);
export const setOctave3 = createSetOctaveCommand(3);
export const setOctave4 = createSetOctaveCommand(4);
export const setOctave5 = createSetOctaveCommand(5);
export const setOctave6 = createSetOctaveCommand(6);
export const setOctave7 = createSetOctaveCommand(7);
export const setOctave8 = createSetOctaveCommand(8);
export const setOctave9 = createSetOctaveCommand(9);

/**
 * Set edit step (0-16)
 */
function createSetStepCommand(step: number) {
  return function(): boolean {
    useTrackerStore.getState().setEditStep(step);
    useUIStore.getState().setStatusMessage(`Edit step ${step}`, false, 1000);
    return true;
  };
}

export const setStep0 = createSetStepCommand(0);
export const setStep1 = createSetStepCommand(1);
export const setStep2 = createSetStepCommand(2);
export const setStep3 = createSetStepCommand(3);
export const setStep4 = createSetStepCommand(4);
export const setStep5 = createSetStepCommand(5);
export const setStep6 = createSetStepCommand(6);
export const setStep7 = createSetStepCommand(7);
export const setStep8 = createSetStepCommand(8);
export const setStep9 = createSetStepCommand(9);
export const setStep10 = createSetStepCommand(10);
export const setStep11 = createSetStepCommand(11);
export const setStep12 = createSetStepCommand(12);
export const setStep13 = createSetStepCommand(13);
export const setStep14 = createSetStepCommand(14);
export const setStep15 = createSetStepCommand(15);
export const setStep16 = createSetStepCommand(16);

/**
 * Increase edit step by 1
 */
export function increaseStep(): boolean {
  const { editStep, setEditStep } = useTrackerStore.getState();
  const newStep = Math.min(16, editStep + 1);
  setEditStep(newStep);
  useUIStore.getState().setStatusMessage(`Edit step ${newStep}`, false, 1000);
  return true;
}

/**
 * Decrease edit step by 1
 */
export function decreaseStep(): boolean {
  const { editStep, setEditStep } = useTrackerStore.getState();
  const newStep = Math.max(0, editStep - 1);
  setEditStep(newStep);
  useUIStore.getState().setStatusMessage(`Edit step ${newStep}`, false, 1000);
  return true;
}

/**
 * Toggle insert mode (IT-style: insert vs overwrite)
 */
export function toggleInsertMode(): boolean {
  const store = useTrackerStore.getState();
  store.toggleInsertMode();
  const newMode = useTrackerStore.getState().insertMode;
  useUIStore.getState().setStatusMessage(newMode ? 'INSERT mode' : 'OVERWRITE mode', false, 1000);
  return true;
}

/**
 * Advance cursor to next row (ProTracker: Enter in edit mode)
 */
export function advanceToNextRow(): boolean {
  useTrackerStore.getState().moveCursor('down');
  return true;
}

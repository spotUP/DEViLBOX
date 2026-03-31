/**
 * Edit Commands - Pattern editing operations
 */

import { useTrackerStore } from '@stores/useTrackerStore';
import { useEditorStore } from '@stores/useEditorStore';
import { useCursorStore } from '@/stores/useCursorStore';
import { useUIStore } from '@stores/useUIStore';

/**
 * Delete note/data at cursor position — behavior-aware.
 * FT2: clears note+inst+vol for the active note column
 * IT: clears only the field at cursor position
 * PT: clears note+sample (no volume column)
 */
export function deleteNote(): boolean {
  const { cursor } = useCursorStore.getState();
  const { setCell } = useTrackerStore.getState();
  const behavior = useEditorStore.getState().activeBehavior;
  const nci = cursor.noteColumnIndex ?? 0;

  if (behavior.deleteClearsWhat === 'cursor-field') {
    // IT/Renoise style: clear only the current column
    if (cursor.columnType === 'note') {
      const noteField = nci === 0 ? 'note' : nci === 1 ? 'note2' : nci === 2 ? 'note3' : 'note4';
      setCell(cursor.channelIndex, cursor.rowIndex, { [noteField]: 0 });
    } else if (cursor.columnType === 'instrument') {
      const instField = nci === 0 ? 'instrument' : nci === 1 ? 'instrument2' : nci === 2 ? 'instrument3' : 'instrument4';
      setCell(cursor.channelIndex, cursor.rowIndex, { [instField]: 0 });
    } else if (cursor.columnType === 'volume') {
      setCell(cursor.channelIndex, cursor.rowIndex, { volume: 0 });
    } else if (cursor.columnType === 'effTyp') {
      setCell(cursor.channelIndex, cursor.rowIndex, { effTyp: 0, eff: 0, effect: '' });
    } else if (cursor.columnType === 'effParam') {
      setCell(cursor.channelIndex, cursor.rowIndex, { eff: 0 });
    } else if (cursor.columnType === 'effTyp2') {
      setCell(cursor.channelIndex, cursor.rowIndex, { effTyp2: 0, eff2: 0, effect2: '' });
    } else if (cursor.columnType === 'effParam2') {
      setCell(cursor.channelIndex, cursor.rowIndex, { eff2: 0 });
    } else {
      setCell(cursor.channelIndex, cursor.rowIndex, { [cursor.columnType]: 0 });
    }
  } else if (behavior.deleteClearsWhat === 'note-sample') {
    // PT style: clear note+instrument (no volume column)
    if (cursor.columnType === 'note' || cursor.columnType === 'instrument') {
      const fields: Record<string, number | undefined> = {};
      if (nci === 0) { fields.note = 0; fields.instrument = 0; }
      else if (nci === 1) { fields.note2 = 0; fields.instrument2 = 0; }
      else if (nci === 2) { fields.note3 = 0; fields.instrument3 = 0; }
      else { fields.note4 = 0; fields.instrument4 = 0; }
      setCell(cursor.channelIndex, cursor.rowIndex, fields);
    } else if (cursor.columnType === 'effTyp' || cursor.columnType === 'effParam') {
      setCell(cursor.channelIndex, cursor.rowIndex, { effTyp: 0, eff: 0, effect: '' });
    } else {
      setCell(cursor.channelIndex, cursor.rowIndex, { [cursor.columnType]: 0 });
    }
  } else {
    // FT2 style: clear note+inst+vol for the active note column
    if (cursor.columnType === 'note' || cursor.columnType === 'instrument' || cursor.columnType === 'volume') {
      const fields: Record<string, number | undefined> = {};
      if (nci === 0) { fields.note = 0; fields.instrument = 0; fields.volume = 0; }
      else if (nci === 1) { fields.note2 = 0; fields.instrument2 = 0; fields.volume2 = 0; }
      else if (nci === 2) { fields.note3 = 0; fields.instrument3 = 0; fields.volume3 = 0; }
      else { fields.note4 = 0; fields.instrument4 = 0; fields.volume4 = 0; }
      setCell(cursor.channelIndex, cursor.rowIndex, fields);
    } else {
      const { clearCell } = useTrackerStore.getState();
      clearCell(cursor.channelIndex, cursor.rowIndex);
    }
  }

  // Advance cursor if behavior says so
  if (behavior.advanceOnDelete) {
    const editStep = useEditorStore.getState().editStep;
    if (editStep > 0) {
      const ts = useTrackerStore.getState();
      const pattern = ts.patterns[ts.currentPatternIndex];
      useCursorStore.getState().moveCursorToRow((cursor.rowIndex + editStep) % pattern.length);
    }
  }
  return true;
}

/**
 * Delete row and pull up remaining rows
 */
export function deleteAndPull(): boolean {
  const { cursor } = useCursorStore.getState();
  const { deleteRow } = useTrackerStore.getState();
  deleteRow(cursor.channelIndex, cursor.rowIndex);
  useUIStore.getState().setStatusMessage('Row deleted', false, 1000);
  return true;
}

/**
 * Insert empty row at cursor (push down)
 */
export function insertRow(): boolean {
  const { cursor } = useCursorStore.getState();
  const { insertRow: insert } = useTrackerStore.getState();
  insert(cursor.channelIndex, cursor.rowIndex);
  useUIStore.getState().setStatusMessage('Row inserted', false, 1000);
  return true;
}

/**
 * Toggle edit/record mode
 */
export function toggleEditMode(): boolean {
  const store = useEditorStore.getState();
  store.toggleRecordMode();
  const newMode = useEditorStore.getState().recordMode;
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
  const { cursor } = useCursorStore.getState();
  const { clearChannel: clear } = useTrackerStore.getState();
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
    useEditorStore.getState().setCurrentOctave(octave);
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
    useEditorStore.getState().setEditStep(step);
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
  const { editStep, setEditStep } = useEditorStore.getState();
  const newStep = Math.min(16, editStep + 1);
  setEditStep(newStep);
  useUIStore.getState().setStatusMessage(`Edit step ${newStep}`, false, 1000);
  return true;
}

/**
 * Decrease edit step by 1
 */
export function decreaseStep(): boolean {
  const { editStep, setEditStep } = useEditorStore.getState();
  const newStep = Math.max(0, editStep - 1);
  setEditStep(newStep);
  useUIStore.getState().setStatusMessage(`Edit step ${newStep}`, false, 1000);
  return true;
}

/**
 * Toggle insert mode (IT-style: insert vs overwrite)
 */
export function toggleInsertMode(): boolean {
  const store = useEditorStore.getState();
  store.toggleInsertMode();
  const newMode = useEditorStore.getState().insertMode;
  useUIStore.getState().setStatusMessage(newMode ? 'INSERT mode' : 'OVERWRITE mode', false, 1000);
  return true;
}

/**
 * Advance cursor to next row (ProTracker: Enter in edit mode)
 */
export function advanceToNextRow(): boolean {
  useCursorStore.getState().moveCursor('down');
  return true;
}

/**
 * IT mask toggle — comma key toggles mask bit based on cursor column.
 * In IT, this controls which columns are included in copy/paste operations.
 */
export function toggleMaskAtCursor(): boolean {
  const { cursor } = useCursorStore.getState();
  const { MASK_INSTRUMENT, MASK_VOLUME, MASK_EFFECT, MASK_EFFECT2 } = await_masks();
  const store = useEditorStore.getState();

  let bit: number | null = null;
  let label = '';
  if (cursor.columnType === 'instrument') {
    bit = MASK_INSTRUMENT; label = 'Instrument';
  } else if (cursor.columnType === 'volume') {
    bit = MASK_VOLUME; label = 'Volume';
  } else if (cursor.columnType === 'effTyp' || cursor.columnType === 'effParam') {
    bit = MASK_EFFECT; label = 'Effect';
  } else if (cursor.columnType === 'effTyp2' || cursor.columnType === 'effParam2') {
    bit = MASK_EFFECT2; label = 'Effect2';
  }

  if (bit !== null) {
    store.toggleMaskBit('copy', bit);
    store.toggleMaskBit('paste', bit);
    const isOn = (store.copyMask & bit) !== 0;
    useUIStore.getState().setStatusMessage(`${label} mask ${isOn ? 'OFF' : 'ON'}`, false, 1000);
  }
  return true;
}

// Helper to import mask constants without circular deps
function await_masks() {
  // Re-exported from useEditorStore
  return { MASK_INSTRUMENT: 1 << 1, MASK_VOLUME: 1 << 2, MASK_EFFECT: 1 << 3, MASK_EFFECT2: 1 << 4 };
}

/**
 * PT effect macro: store current row's effect to a macro slot (0-9)
 */
export function storeEffectMacro(slot: number): boolean {
  const { cursor } = useCursorStore.getState();
  const ts = useTrackerStore.getState();
  const pattern = ts.patterns[ts.currentPatternIndex];
  const cell = pattern.channels[cursor.channelIndex]?.rows[cursor.rowIndex];
  if (!cell) return true;

  const store = useEditorStore.getState();
  if (!store.effectMacros) return true;
  store.setEffectMacro(slot, cell.effTyp || 0, cell.eff || 0);
  useUIStore.getState().setStatusMessage(`Effect macro ${slot} stored: ${cell.effect || '---'}`, false, 1000);
  return true;
}

/**
 * PT effect macro: recall stored effect from a macro slot (0-9)
 */
export function recallEffectMacro(slot: number): boolean {
  const { cursor } = useCursorStore.getState();
  const store = useEditorStore.getState();
  if (!store.effectMacros) return true;

  const macro = store.getEffectMacro(slot);
  if (!macro) return true;

  const effChar = macro.effTyp < 10 ? macro.effTyp.toString() : String.fromCharCode(55 + macro.effTyp);
  const effectString = effChar + macro.eff.toString(16).padStart(2, '0').toUpperCase();

  useTrackerStore.getState().setCell(cursor.channelIndex, cursor.rowIndex, {
    effTyp: macro.effTyp,
    eff: macro.eff,
    effect: effectString,
  });
  useUIStore.getState().setStatusMessage(`Effect macro ${slot} recalled: ${effectString}`, false, 1000);
  return true;
}

/**
 * Transpose Commands - Semitone and octave shifting
 */

import { useTrackerStore } from '@stores/useTrackerStore';
import { useUIStore } from '@stores/useUIStore';

/**
 * Transpose selection up one semitone
 */
export function transposeUp(): boolean {
  const { selection, transposeSelection } = useTrackerStore.getState();
  if (!selection) {
    useUIStore.getState().setStatusMessage('No selection to transpose', false, 1000);
    return true;
  }
  transposeSelection(1);
  useUIStore.getState().setStatusMessage('Transposed +1 semitone', false, 1000);
  return true;
}

/**
 * Transpose selection down one semitone
 */
export function transposeDown(): boolean {
  const { selection, transposeSelection } = useTrackerStore.getState();
  if (!selection) {
    useUIStore.getState().setStatusMessage('No selection to transpose', false, 1000);
    return true;
  }
  transposeSelection(-1);
  useUIStore.getState().setStatusMessage('Transposed -1 semitone', false, 1000);
  return true;
}

/**
 * Transpose selection up one octave
 */
export function transposeOctaveUp(): boolean {
  const { selection, transposeSelection } = useTrackerStore.getState();
  if (!selection) {
    useUIStore.getState().setStatusMessage('No selection to transpose', false, 1000);
    return true;
  }
  transposeSelection(12);
  useUIStore.getState().setStatusMessage('Transposed +1 octave', false, 1000);
  return true;
}

/**
 * Transpose selection down one octave
 */
export function transposeOctaveDown(): boolean {
  const { selection, transposeSelection } = useTrackerStore.getState();
  if (!selection) {
    useUIStore.getState().setStatusMessage('No selection to transpose', false, 1000);
    return true;
  }
  transposeSelection(-12);
  useUIStore.getState().setStatusMessage('Transposed -1 octave', false, 1000);
  return true;
}

/**
 * Transpose block/selection up (FT2: Ctrl+Q)
 */
export function transposeBlockUp(): boolean {
  return transposeUp();
}

/**
 * Transpose block/selection down (FT2: Ctrl+W for down in some versions)
 */
export function transposeBlockDown(): boolean {
  return transposeDown();
}

/**
 * Transpose block up one octave (FT2: Ctrl+Shift+Q)
 */
export function transposeBlockOctaveUp(): boolean {
  return transposeOctaveUp();
}

/**
 * Transpose block down one octave (FT2: Ctrl+Shift+W)
 */
export function transposeBlockOctaveDown(): boolean {
  return transposeOctaveDown();
}

/**
 * Transpose track up (ProTracker: Ctrl+A)
 */
export function transposeTrackUp(): boolean {
  const { cursor, selectChannel, transposeSelection } = useTrackerStore.getState();
  selectChannel(cursor.channelIndex);
  transposeSelection(1);
  useUIStore.getState().setStatusMessage(`Track ${cursor.channelIndex + 1} transposed +1`, false, 1000);
  return true;
}

/**
 * Transpose track down (ProTracker: Ctrl+Q)
 */
export function transposeTrackDown(): boolean {
  const { cursor, selectChannel, transposeSelection } = useTrackerStore.getState();
  selectChannel(cursor.channelIndex);
  transposeSelection(-1);
  useUIStore.getState().setStatusMessage(`Track ${cursor.channelIndex + 1} transposed -1`, false, 1000);
  return true;
}

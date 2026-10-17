/**
 * Undo/Redo Commands
 */

import { useHistoryStore } from '@stores/useHistoryStore';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useUIStore } from '@stores/useUIStore';

/**
 * Undo last action
 */
export function undo(): boolean {
  const { canUndo } = useHistoryStore.getState();

  if (!canUndo()) {
    useUIStore.getState().setStatusMessage('Nothing to undo', false, 1000);
    return true;
  }
  
  if (useTrackerStore.getState().undoEdit()) {
    useUIStore.getState().setStatusMessage('Undo', false, 1000);
  }
  
  return true;
}

/**
 * Redo last undone action
 */
export function redo(): boolean {
  const { canRedo } = useHistoryStore.getState();

  if (!canRedo()) {
    useUIStore.getState().setStatusMessage('Nothing to redo', false, 1000);
    return true;
  }
  
  if (useTrackerStore.getState().redoEdit()) {
    useUIStore.getState().setStatusMessage('Redo', false, 1000);
  }
  
  return true;
}

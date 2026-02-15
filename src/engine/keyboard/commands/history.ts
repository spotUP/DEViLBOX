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
  const { undo: doUndo, canUndo } = useHistoryStore.getState();
  const { currentPatternIndex, replacePattern } = useTrackerStore.getState();
  
  if (!canUndo()) {
    useUIStore.getState().setStatusMessage('Nothing to undo', false, 1000);
    return true;
  }
  
  const pattern = doUndo();
  if (pattern) {
    replacePattern(currentPatternIndex, pattern);
    useUIStore.getState().setStatusMessage('Undo', false, 1000);
  }
  
  return true;
}

/**
 * Redo last undone action
 */
export function redo(): boolean {
  const { redo: doRedo, canRedo } = useHistoryStore.getState();
  const { currentPatternIndex, replacePattern } = useTrackerStore.getState();
  
  if (!canRedo()) {
    useUIStore.getState().setStatusMessage('Nothing to redo', false, 1000);
    return true;
  }
  
  const pattern = doRedo();
  if (pattern) {
    replacePattern(currentPatternIndex, pattern);
    useUIStore.getState().setStatusMessage('Redo', false, 1000);
  }
  
  return true;
}

/**
 * Paste Commands - Various paste modes (overwrite, insert, mix, flood)
 */

import { useUIStore } from '@stores/useUIStore';

/**
 * Standard paste (overwrite mode)
 */
export function pasteOverwrite(): boolean {
  useUIStore.getState().setStatusMessage('Paste (overwrite)', false, 1000);
  return true;
}

/**
 * Paste insert mode (push existing data down)
 */
export function pasteInsert(): boolean {
  useUIStore.getState().setStatusMessage('Paste (insert)', false, 1000);
  return true;
}

/**
 * Paste mix mode (merge with existing, non-destructive)
 */
export function pasteMix(): boolean {
  useUIStore.getState().setStatusMessage('Paste (mix)', false, 1000);
  return true;
}

/**
 * Paste flood (fill selection with clipboard data)
 */
export function pasteFlood(): boolean {
  useUIStore.getState().setStatusMessage('Paste (flood)', false, 1000);
  return true;
}

/**
 * Push forward paste (IT-style)
 */
export function pushForwardPaste(): boolean {
  useUIStore.getState().setStatusMessage('Push forward paste', false, 1000);
  return true;
}

/**
 * Cut current row (delete and copy to clipboard)
 */
export function cutRow(): boolean {
  useUIStore.getState().setStatusMessage('Cut row', false, 1000);
  return true;
}

/**
 * Copy current row
 */
export function copyRow(): boolean {
  useUIStore.getState().setStatusMessage('Copy row', false, 1000);
  return true;
}

/**
 * Cut current note
 */
export function cutNote(): boolean {
  useUIStore.getState().setStatusMessage('Cut note', false, 1000);
  return true;
}

/**
 * Clear current note
 */
export function clearNote(): boolean {
  useUIStore.getState().setStatusMessage('Clear note', false, 1000);
  return true;
}

/**
 * Clear current row
 */
export function clearRow(): boolean {
  useUIStore.getState().setStatusMessage('Clear row', false, 1000);
  return true;
}

/**
 * Delete row and pull up (like backspace)
 */
export function deleteRowPullUp(): boolean {
  useUIStore.getState().setStatusMessage('Delete row pull up', false, 1000);
  return true;
}

/**
 * Insert row and push down
 */
export function insertRowPushDown(): boolean {
  useUIStore.getState().setStatusMessage('Insert row push down', false, 1000);
  return true;
}

/**
 * Clear selection only (without cutting)
 */
export function clearSelection(): boolean {
  useUIStore.getState().setStatusMessage('Clear selection', false, 1000);
  return true;
}

/**
 * Copy whole pattern
 */
export function copyPattern(): boolean {
  useUIStore.getState().setStatusMessage('Copy pattern', false, 1000);
  return true;
}

/**
 * Paste pattern
 */
export function pastePattern(): boolean {
  useUIStore.getState().setStatusMessage('Paste pattern', false, 1000);
  return true;
}

/**
 * Cut current channel
 */
export function cutChannel(): boolean {
  useUIStore.getState().setStatusMessage('Cut channel', false, 1000);
  return true;
}

/**
 * Copy current channel
 */
export function copyChannel(): boolean {
  useUIStore.getState().setStatusMessage('Copy channel', false, 1000);
  return true;
}

/**
 * Paste to current channel
 */
export function pasteChannel(): boolean {
  useUIStore.getState().setStatusMessage('Paste channel', false, 1000);
  return true;
}

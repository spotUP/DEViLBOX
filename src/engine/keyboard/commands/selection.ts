/**
 * Selection Commands - Block selection, copy, paste, cut operations
 */

import { useTrackerStore } from '@stores/useTrackerStore';
import { useUIStore } from '@stores/useUIStore';

/**
 * Copy current selection to clipboard
 */
export function copySelection(): boolean {
  const { selection, copySelection: copy } = useTrackerStore.getState();
  if (!selection) {
    useUIStore.getState().setStatusMessage('No selection to copy', false, 1000);
    return true;
  }
  copy();
  useUIStore.getState().setStatusMessage('Selection copied', false, 1000);
  return true;
}

/**
 * Cut current selection (copy + clear)
 */
export function cutSelection(): boolean {
  const { selection, cutSelection: cut } = useTrackerStore.getState();
  if (!selection) {
    useUIStore.getState().setStatusMessage('No selection to cut', false, 1000);
    return true;
  }
  cut();
  useUIStore.getState().setStatusMessage('Selection cut', false, 1000);
  return true;
}

/**
 * Paste from clipboard
 */
export function pasteSelection(): boolean {
  const { clipboard, paste } = useTrackerStore.getState();
  if (!clipboard) {
    useUIStore.getState().setStatusMessage('Nothing to paste', false, 1000);
    return true;
  }
  paste();
  useUIStore.getState().setStatusMessage('Pasted', false, 1000);
  return true;
}

/**
 * Select entire pattern
 */
export function selectAll(): boolean {
  useTrackerStore.getState().selectPattern();
  useUIStore.getState().setStatusMessage('Pattern selected', false, 1000);
  return true;
}

/**
 * Select current channel
 */
export function selectChannel(): boolean {
  const { cursor, selectChannel: select } = useTrackerStore.getState();
  select(cursor.channelIndex);
  useUIStore.getState().setStatusMessage(`Channel ${cursor.channelIndex + 1} selected`, false, 1000);
  return true;
}

/**
 * Select current column
 */
export function selectColumn(): boolean {
  const { cursor, selectColumn: select } = useTrackerStore.getState();
  select(cursor.channelIndex, cursor.columnType);
  useUIStore.getState().setStatusMessage('Column selected', false, 1000);
  return true;
}

/**
 * Start/update block selection
 */
export function markBlockStart(): boolean {
  useTrackerStore.getState().startSelection();
  useUIStore.getState().setStatusMessage('Block start marked', false, 1000);
  return true;
}

/**
 * End block selection
 */
export function markBlockEnd(): boolean {
  const { cursor, updateSelection, endSelection } = useTrackerStore.getState();
  updateSelection(cursor.channelIndex, cursor.rowIndex);
  endSelection();
  useUIStore.getState().setStatusMessage('Block end marked', false, 1000);
  return true;
}

/**
 * Clear selection
 */
export function clearSelection(): boolean {
  useTrackerStore.getState().clearSelection();
  return true;
}

/**
 * Copy current track (single channel) - FT2 style
 */
export function copyTrack(): boolean {
  const { cursor, copyTrack: copy } = useTrackerStore.getState();
  copy(cursor.channelIndex);
  useUIStore.getState().setStatusMessage(`Track ${cursor.channelIndex + 1} copied`, false, 1000);
  return true;
}

/**
 * Cut current track (single channel)
 */
export function cutTrack(): boolean {
  const { cursor, cutTrack: cut } = useTrackerStore.getState();
  cut(cursor.channelIndex);
  useUIStore.getState().setStatusMessage(`Track ${cursor.channelIndex + 1} cut`, false, 1000);
  return true;
}

/**
 * Paste to current track
 */
export function pasteTrack(): boolean {
  const { cursor, trackClipboard, pasteTrack: paste } = useTrackerStore.getState();
  if (!trackClipboard) {
    useUIStore.getState().setStatusMessage('No track data to paste', false, 1000);
    return true;
  }
  paste(cursor.channelIndex);
  useUIStore.getState().setStatusMessage(`Pasted to track ${cursor.channelIndex + 1}`, false, 1000);
  return true;
}

/**
 * Paste mix (only fill empty cells)
 */
export function pasteMix(): boolean {
  useTrackerStore.getState().pasteMix();
  useUIStore.getState().setStatusMessage('Paste mixed', false, 1000);
  return true;
}

/**
 * Paste flood (repeat until end of pattern)
 */
export function pasteFlood(): boolean {
  useTrackerStore.getState().pasteFlood();
  useUIStore.getState().setStatusMessage('Paste flooded', false, 1000);
  return true;
}

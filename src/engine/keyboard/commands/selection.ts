/**
 * Selection Commands - Block selection, copy, paste, cut operations
 */

import { useTrackerStore } from '@stores/useTrackerStore';
import { useCursorStore } from '@/stores/useCursorStore';
import { useUIStore } from '@stores/useUIStore';
import { useEditorStore } from '@stores/useEditorStore';

/**
 * Copy current selection to clipboard
 */
export function copySelection(): boolean {
  const { selection } = useCursorStore.getState();
  const { copySelection: copy } = useTrackerStore.getState();
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
  const { selection } = useCursorStore.getState();
  const { cutSelection: cut } = useTrackerStore.getState();
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
  const { clipboard, paste, pasteMix: doMix, pasteFlood: doFlood, pastePushForward: doPush } = useTrackerStore.getState();
  if (!clipboard) {
    useUIStore.getState().setStatusMessage('Nothing to paste', false, 1000);
    return true;
  }
  const mode = useEditorStore.getState().pasteMode;
  switch (mode) {
    case 'mix':
      doMix();
      useUIStore.getState().setStatusMessage('Pasted (mix)', false, 800);
      break;
    case 'flood':
      doFlood();
      useUIStore.getState().setStatusMessage('Pasted (flood)', false, 800);
      break;
    case 'insert':
      doPush();
      useUIStore.getState().setStatusMessage('Pasted (insert)', false, 800);
      break;
    default:
      paste();
      useUIStore.getState().setStatusMessage('Pasted', false, 800);
  }
  return true;
}

/**
 * Swap clipboard with current selection
 */
export function swapSelection(): boolean {
  const { selection } = useCursorStore.getState();
  const { clipboard, swapSelection: swap } = useTrackerStore.getState();
  if (!selection) {
    useUIStore.getState().setStatusMessage('No selection to swap', false, 1000);
    return true;
  }
  if (!clipboard) {
    useUIStore.getState().setStatusMessage('Nothing in clipboard to swap', false, 1000);
    return true;
  }
  swap();
  useUIStore.getState().setStatusMessage('Selection swapped with clipboard', false, 1000);
  return true;
}

/**
 * Select entire pattern
 */
export function selectAll(): boolean {
  useCursorStore.getState().selectPattern();
  useUIStore.getState().setStatusMessage('Pattern selected', false, 1000);
  return true;
}

/**
 * Select current channel
 */
export function selectChannel(): boolean {
  const { cursor, selectChannel: select } = useCursorStore.getState();
  select(cursor.channelIndex);
  useUIStore.getState().setStatusMessage(`Channel ${cursor.channelIndex + 1} selected`, false, 1000);
  return true;
}

/**
 * Select current column
 */
export function selectColumn(): boolean {
  const { cursor, selectColumn: select } = useCursorStore.getState();
  select(cursor.channelIndex, cursor.columnType);
  useUIStore.getState().setStatusMessage('Column selected', false, 1000);
  return true;
}

/**
 * Start/update block selection
 */
export function markBlockStart(): boolean {
  useCursorStore.getState().startSelection();
  useUIStore.getState().setStatusMessage('Block start marked', false, 1000);
  return true;
}

/**
 * End block selection
 */
export function markBlockEnd(): boolean {
  const { cursor, updateSelection, endSelection } = useCursorStore.getState();
  updateSelection(cursor.channelIndex, cursor.rowIndex);
  endSelection();
  useUIStore.getState().setStatusMessage('Block end marked', false, 1000);
  return true;
}

/**
 * Clear selection
 */
export function clearSelection(): boolean {
  useCursorStore.getState().clearSelection();
  return true;
}

/**
 * Copy current track (single channel) - FT2 style
 */
export function copyTrack(): boolean {
  const { cursor } = useCursorStore.getState();
  const { copyTrack: copy } = useTrackerStore.getState();
  copy(cursor.channelIndex);
  useUIStore.getState().setStatusMessage(`Track ${cursor.channelIndex + 1} copied`, false, 1000);
  return true;
}

/**
 * Cut current track (single channel)
 */
export function cutTrack(): boolean {
  const { cursor } = useCursorStore.getState();
  const { cutTrack: cut } = useTrackerStore.getState();
  cut(cursor.channelIndex);
  useUIStore.getState().setStatusMessage(`Track ${cursor.channelIndex + 1} cut`, false, 1000);
  return true;
}

/**
 * Paste to current track
 */
export function pasteTrack(): boolean {
  const { cursor } = useCursorStore.getState();
  const { trackClipboard, pasteTrack: paste } = useTrackerStore.getState();
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

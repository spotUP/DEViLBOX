/**
 * Paste Commands - Various paste modes (overwrite, insert, mix, flood)
 */

import { useTrackerStore } from '@stores/useTrackerStore';

/**
 * Standard paste (overwrite mode)
 */
export function pasteOverwrite(): boolean {
  useTrackerStore.getState().paste();
  return true;
}

/**
 * Paste insert mode (push existing data down)
 */
export function pasteInsert(): boolean {
  useTrackerStore.getState().pastePushForward();
  return true;
}

/**
 * Paste mix mode (merge with existing, non-destructive)
 */
export function pasteMix(): boolean {
  useTrackerStore.getState().pasteMix();
  return true;
}

/**
 * Paste flood (fill selection with clipboard data)
 */
export function pasteFlood(): boolean {
  useTrackerStore.getState().pasteFlood();
  return true;
}

/**
 * Push forward paste (IT-style)
 */
export function pushForwardPaste(): boolean {
  useTrackerStore.getState().pastePushForward();
  return true;
}

/**
 * Cut current row (copy all channels at cursor row, then clear)
 */
export function cutRow(): boolean {
  const store = useTrackerStore.getState();
  const { cursor, patterns, currentPatternIndex } = store;
  const pattern = patterns[currentPatternIndex];
  // Copy row data to clipboard
  const rowData = pattern.channels.map(ch => [{ ...ch.rows[cursor.rowIndex] }]);
  store.setClipboard({ channels: pattern.channels.length, rows: 1, data: rowData, columnTypes: [] });
  // Clear each cell in the row
  for (let ch = 0; ch < pattern.channels.length; ch++) {
    store.clearCell(ch, cursor.rowIndex);
  }
  return true;
}

/**
 * Copy current row (all channels)
 */
export function copyRow(): boolean {
  const store = useTrackerStore.getState();
  const { cursor, patterns, currentPatternIndex } = store;
  const pattern = patterns[currentPatternIndex];
  const rowData = pattern.channels.map(ch => [{ ...ch.rows[cursor.rowIndex] }]);
  store.setClipboard({ channels: pattern.channels.length, rows: 1, data: rowData, columnTypes: [] });
  return true;
}

/**
 * Cut current note (note+instrument columns only)
 */
export function cutNote(): boolean {
  const store = useTrackerStore.getState();
  const { cursor, patterns, currentPatternIndex } = store;
  const cell = patterns[currentPatternIndex].channels[cursor.channelIndex].rows[cursor.rowIndex];
  store.setClipboard({ channels: 1, rows: 1, data: [[{ ...cell }]], columnTypes: ['note', 'instrument'] });
  store.setCell(cursor.channelIndex, cursor.rowIndex, { note: 0, instrument: 0 });
  return true;
}

/**
 * Clear current note (set note + instrument to 0)
 */
export function clearNote(): boolean {
  const store = useTrackerStore.getState();
  const { cursor } = store;
  store.setCell(cursor.channelIndex, cursor.rowIndex, { note: 0, instrument: 0 });
  return true;
}

/**
 * Clear current row (all channels)
 */
export function clearRow(): boolean {
  const store = useTrackerStore.getState();
  const { cursor, patterns, currentPatternIndex } = store;
  const pattern = patterns[currentPatternIndex];
  for (let ch = 0; ch < pattern.channels.length; ch++) {
    store.clearCell(ch, cursor.rowIndex);
  }
  return true;
}

/**
 * Delete row and pull up (all channels)
 */
export function deleteRowPullUp(): boolean {
  const store = useTrackerStore.getState();
  const { cursor, patterns, currentPatternIndex } = store;
  const pattern = patterns[currentPatternIndex];
  for (let ch = 0; ch < pattern.channels.length; ch++) {
    store.deleteRow(ch, cursor.rowIndex);
  }
  return true;
}

/**
 * Insert row and push down (all channels)
 */
export function insertRowPushDown(): boolean {
  const store = useTrackerStore.getState();
  const { cursor, patterns, currentPatternIndex } = store;
  const pattern = patterns[currentPatternIndex];
  for (let ch = 0; ch < pattern.channels.length; ch++) {
    store.insertRow(ch, cursor.rowIndex);
  }
  return true;
}

/**
 * Clear selection only (without cutting to clipboard)
 */
export function clearSelection(): boolean {
  useTrackerStore.getState().cutSelection();
  return true;
}

/**
 * Copy whole pattern (all channels, all rows)
 */
export function copyPattern(): boolean {
  const store = useTrackerStore.getState();
  store.selectPattern();
  store.copySelection();
  return true;
}

/**
 * Paste pattern (standard paste at cursor)
 */
export function pastePattern(): boolean {
  useTrackerStore.getState().paste();
  return true;
}

/**
 * Cut current channel (cursor channel)
 */
export function cutChannel(): boolean {
  const store = useTrackerStore.getState();
  store.cutTrack(store.cursor.channelIndex);
  return true;
}

/**
 * Copy current channel (cursor channel)
 */
export function copyChannel(): boolean {
  const store = useTrackerStore.getState();
  store.copyTrack(store.cursor.channelIndex);
  return true;
}

/**
 * Paste to current channel (cursor channel)
 */
export function pasteChannel(): boolean {
  const store = useTrackerStore.getState();
  store.pasteTrack(store.cursor.channelIndex);
  return true;
}

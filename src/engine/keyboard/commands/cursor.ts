/**
 * Cursor Commands - Navigation within pattern editor
 * 
 * Uses TrackerStore's moveCursor, moveCursorToRow, moveCursorToChannel APIs
 */

import { useTrackerStore } from '@stores/useTrackerStore';

/**
 * Move cursor up one row
 */
export function cursorUp(): boolean {
  useTrackerStore.getState().moveCursor('up');
  return true;
}

/**
 * Move cursor down one row
 */
export function cursorDown(): boolean {
  useTrackerStore.getState().moveCursor('down');
  return true;
}

/**
 * Move cursor left one column
 */
export function cursorLeft(): boolean {
  useTrackerStore.getState().moveCursor('left');
  return true;
}

/**
 * Move cursor right one column
 */
export function cursorRight(): boolean {
  useTrackerStore.getState().moveCursor('right');
  return true;
}

/**
 * Move cursor up one page (16 rows)
 */
export function cursorPageUp(): boolean {
  const { cursor, moveCursorToRow } = useTrackerStore.getState();
  const pageSize = 16;
  const newRow = Math.max(0, cursor.rowIndex - pageSize);
  moveCursorToRow(newRow);
  return true;
}

/**
 * Move cursor down one page (16 rows)
 */
export function cursorPageDown(): boolean {
  const { cursor, patterns, currentPatternIndex, moveCursorToRow } = useTrackerStore.getState();
  const pattern = patterns[currentPatternIndex];
  if (!pattern) return false;
  
  const pageSize = 16;
  const maxRow = pattern.length - 1;
  const newRow = Math.min(maxRow, cursor.rowIndex + pageSize);
  moveCursorToRow(newRow);
  return true;
}

/**
 * Move cursor to beginning of current row (note column)
 */
export function cursorHome(): boolean {
  useTrackerStore.getState().moveCursorToColumn('note');
  return true;
}

/**
 * Move cursor to end of current row (last effect column)
 */
export function cursorEnd(): boolean {
  useTrackerStore.getState().moveCursorToColumn('effParam2');
  return true;
}

/**
 * Move cursor to first row of pattern
 */
export function cursorPatternStart(): boolean {
  useTrackerStore.getState().moveCursorToRow(0);
  return true;
}

/**
 * Move cursor to last row of pattern
 */
export function cursorPatternEnd(): boolean {
  const { patterns, currentPatternIndex, moveCursorToRow } = useTrackerStore.getState();
  const pattern = patterns[currentPatternIndex];
  if (!pattern) return false;
  
  moveCursorToRow(pattern.length - 1);
  return true;
}

/**
 * Move to next channel
 */
export function nextChannel(): boolean {
  const { cursor, patterns, currentPatternIndex, moveCursorToChannel, moveCursorToColumn } = useTrackerStore.getState();
  const pattern = patterns[currentPatternIndex];
  if (!pattern) return false;
  
  const numChannels = pattern.channels.length;
  const newChannel = (cursor.channelIndex + 1) % numChannels;
  moveCursorToChannel(newChannel);
  moveCursorToColumn('note');
  return true;
}

/**
 * Move to previous channel
 */
export function prevChannel(): boolean {
  const { cursor, patterns, currentPatternIndex, moveCursorToChannel, moveCursorToColumn } = useTrackerStore.getState();
  const pattern = patterns[currentPatternIndex];
  if (!pattern) return false;
  
  const numChannels = pattern.channels.length;
  const newChannel = (cursor.channelIndex - 1 + numChannels) % numChannels;
  moveCursorToChannel(newChannel);
  moveCursorToColumn('note');
  return true;
}

/**
 * Move to next column within channel (IT-style Tab)
 */
export function nextColumn(): boolean {
  useTrackerStore.getState().moveCursor('right');
  return true;
}

/**
 * Move to previous column within channel (IT-style Shift+Tab)
 */
export function prevColumn(): boolean {
  useTrackerStore.getState().moveCursor('left');
  return true;
}

/**
 * Jump to row 0 (FT2 F9)
 */
export function jumpToRow0(): boolean {
  useTrackerStore.getState().moveCursorToRow(0);
  return true;
}

/**
 * Jump to row 16 (FT2 F10)
 */
export function jumpToRow16(): boolean {
  useTrackerStore.getState().moveCursorToRow(16);
  return true;
}

/**
 * Jump to row 32 (FT2 F11)
 */
export function jumpToRow32(): boolean {
  useTrackerStore.getState().moveCursorToRow(32);
  return true;
}

/**
 * Jump to row 48 (FT2 F12)
 */
export function jumpToRow48(): boolean {
  useTrackerStore.getState().moveCursorToRow(48);
  return true;
}

/**
 * Jump to row at start of row (same as home, for column navigation)
 */
export function cursorRowStart(): boolean {
  useTrackerStore.getState().moveCursorToColumn('note');
  return true;
}

/**
 * Jump to row at end of row
 */
export function cursorRowEnd(): boolean {
  useTrackerStore.getState().moveCursorToColumn('effParam2');
  return true;
}

/**
 * Increase edit spacing (skip rows)
 */
export function increaseSpacing(): boolean {
  const { editStep, setEditStep } = useTrackerStore.getState();
  const newStep = Math.min(16, editStep + 1);
  setEditStep(newStep);
  // Status message handled by edit.ts setStep functions
  return true;
}

/**
 * Decrease edit spacing
 */
export function decreaseSpacing(): boolean {
  const { editStep, setEditStep } = useTrackerStore.getState();
  const newStep = Math.max(0, editStep - 1);
  setEditStep(newStep);
  return true;
}

/**
 * Set skip rows (OpenMPT-style spacing)
 */
export function setSpacing(spacing: number): boolean {
  useTrackerStore.getState().setEditStep(spacing);
  return true;
}

/**
 * Toggle cursor wrap (wrap to next channel at pattern edges)
 */
export function toggleCursorWrap(): boolean {
  return true;
}

/**
 * Move up by highlight size (configurable)
 */
export function cursorUpByHighlight(): boolean {
  const { cursor, moveCursorToRow } = useTrackerStore.getState();
  const highlightSize = 4; // Could be configurable
  const newRow = Math.max(0, cursor.rowIndex - highlightSize);
  moveCursorToRow(newRow);
  return true;
}

/**
 * Move down by highlight size
 */
export function cursorDownByHighlight(): boolean {
  const { cursor, patterns, currentPatternIndex, moveCursorToRow } = useTrackerStore.getState();
  const pattern = patterns[currentPatternIndex];
  if (!pattern) return false;
  
  const highlightSize = 4;
  const maxRow = pattern.length - 1;
  const newRow = Math.min(maxRow, cursor.rowIndex + highlightSize);
  moveCursorToRow(newRow);
  return true;
}

/**
 * Jump to quarter mark 1/4
 */
export function jumpToQuarter1(): boolean {
  const { patterns, currentPatternIndex, moveCursorToRow } = useTrackerStore.getState();
  const pattern = patterns[currentPatternIndex];
  if (!pattern) return false;
  
  const row = Math.floor(pattern.length / 4);
  moveCursorToRow(row);
  return true;
}

/**
 * Jump to quarter mark 2/4 (half)
 */
export function jumpToQuarter2(): boolean {
  const { patterns, currentPatternIndex, moveCursorToRow } = useTrackerStore.getState();
  const pattern = patterns[currentPatternIndex];
  if (!pattern) return false;
  
  const row = Math.floor(pattern.length / 2);
  moveCursorToRow(row);
  return true;
}

/**
 * Jump to quarter mark 3/4
 */
export function jumpToQuarter3(): boolean {
  const { patterns, currentPatternIndex, moveCursorToRow } = useTrackerStore.getState();
  const pattern = patterns[currentPatternIndex];
  if (!pattern) return false;
  
  const row = Math.floor((pattern.length * 3) / 4);
  moveCursorToRow(row);
  return true;
}

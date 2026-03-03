/**
 * GTBlockOperations — Copy, paste, transpose, and fill operations
 * for GoatTracker Ultra pattern data.
 *
 * All operations work on the clipboard stored in the GTUltra store.
 * Block operations respect the current selection (startRow/endRow, startChannel/endChannel).
 */

import { useGTUltraStore, type GTSelection } from '../../stores/useGTUltraStore';

/** A copied block of pattern cells */
export interface GTClipboard {
  /** Number of rows in the clipboard */
  rows: number;
  /** Number of channels in the clipboard */
  channels: number;
  /** Cell data: [channel][row][4 bytes] */
  data: Uint8Array[][];
}

// Module-level clipboard (persists across component renders)
let clipboard: GTClipboard | null = null;

/**
 * Copy the current selection to clipboard.
 * If no selection, copies the current row on the current channel.
 */
export function gtCopy(): void {
  const state = useGTUltraStore.getState();
  const { selection, cursor } = state;

  const sel = normalizeSelection(selection, cursor);
  const rows = sel.endRow - sel.startRow + 1;
  const channels = sel.endChannel - sel.startChannel + 1;

  // TODO: Read actual data from WASM heap
  // For now, copy empty cells as placeholder
  const data: Uint8Array[][] = [];
  for (let ch = 0; ch < channels; ch++) {
    const channelData: Uint8Array[] = [];
    for (let r = 0; r < rows; r++) {
      channelData.push(new Uint8Array(4)); // [note, inst, cmd, param]
    }
    data.push(channelData);
  }

  clipboard = { rows, channels, data };
  console.log(`[GTUltra] Copied ${rows} rows × ${channels} channels`);
}

/**
 * Paste clipboard at cursor position.
 */
export function gtPaste(): void {
  if (!clipboard) return;
  const state = useGTUltraStore.getState();
  const { cursor, patternLength, sidCount } = state;
  const maxCh = sidCount * 3;

  // TODO: Write clipboard data to WASM heap via engine
  const pasteRows = Math.min(clipboard.rows, patternLength - cursor.row + 1);
  const pasteCh = Math.min(clipboard.channels, maxCh - cursor.channel);

  console.log(`[GTUltra] Pasting ${pasteRows} rows × ${pasteCh} channels at row ${cursor.row}, ch ${cursor.channel}`);
}

/**
 * Transpose selection up by semitones.
 */
export function gtTranspose(semitones: number): void {
  const state = useGTUltraStore.getState();
  const { selection, cursor } = state;
  const sel = normalizeSelection(selection, cursor);

  // TODO: Read from WASM, transpose notes, write back
  console.log(`[GTUltra] Transpose ${semitones > 0 ? '+' : ''}${semitones} semitones (rows ${sel.startRow}-${sel.endRow}, ch ${sel.startChannel}-${sel.endChannel})`);
}

/**
 * Delete (clear) the current selection.
 */
export function gtDelete(): void {
  const state = useGTUltraStore.getState();
  const { selection, cursor } = state;
  const sel = normalizeSelection(selection, cursor);

  // TODO: Write zeros to WASM heap
  console.log(`[GTUltra] Delete rows ${sel.startRow}-${sel.endRow}, ch ${sel.startChannel}-${sel.endChannel}`);
}

/**
 * Insert a blank row at cursor, shifting rows down.
 */
export function gtInsertRow(): void {
  const state = useGTUltraStore.getState();
  // TODO: Call WASM engine to insert row
  console.log(`[GTUltra] Insert row at ${state.cursor.row}`);
}

/**
 * Delete row at cursor, shifting rows up.
 */
export function gtDeleteRow(): void {
  const state = useGTUltraStore.getState();
  // TODO: Call WASM engine to delete row
  console.log(`[GTUltra] Delete row at ${state.cursor.row}`);
}

/**
 * Interpolate values between first and last row of selection.
 * Useful for smooth parameter sweeps in command/data columns.
 */
export function gtInterpolate(): void {
  const state = useGTUltraStore.getState();
  const { selection, cursor } = state;
  const sel = normalizeSelection(selection, cursor);

  if (sel.endRow - sel.startRow < 2) return;
  // TODO: Read endpoints from WASM, generate intermediate values, write back
  console.log(`[GTUltra] Interpolate rows ${sel.startRow}-${sel.endRow}`);
}

/**
 * Normalize selection (handle no-selection case + ensure start <= end).
 */
function normalizeSelection(sel: GTSelection, cursor: { channel: number; row: number }): {
  startRow: number; endRow: number; startChannel: number; endChannel: number;
} {
  if (!sel.active) {
    return { startRow: cursor.row, endRow: cursor.row, startChannel: cursor.channel, endChannel: cursor.channel };
  }
  return {
    startRow: Math.min(sel.startRow, sel.endRow),
    endRow: Math.max(sel.startRow, sel.endRow),
    startChannel: Math.min(sel.startChannel, sel.endChannel),
    endChannel: Math.max(sel.startChannel, sel.endChannel),
  };
}

export function getClipboard(): GTClipboard | null {
  return clipboard;
}

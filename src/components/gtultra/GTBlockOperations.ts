/**
 * GTBlockOperations — Copy, paste, transpose, and fill operations
 * for GoatTracker Ultra pattern data.
 *
 * All operations work on the clipboard stored in the GTUltra store.
 * Block operations respect the current selection (startRow/endRow, startChannel/endChannel).
 * Data is read from the store's patternData cache and written via engine.setPatternCell().
 */

import { useGTUltraStore, type GTSelection } from '../../stores/useGTUltraStore';

/** A copied block of pattern cells */
export interface GTClipboard {
  rows: number;
  channels: number;
  /** Cell data: [channel][row] = Uint8Array(4) [note, instrument, command, param] */
  data: Uint8Array[][];
}

let clipboard: GTClipboard | null = null;

const BYTES_PER_CELL = 4;

/** Get the active pattern number for a channel at the current order position */
function getPatternForChannel(channel: number): number {
  const state = useGTUltraStore.getState();
  const od = state.orderData[channel];
  if (!od || od.length === 0) return 0;
  const pos = Math.min(state.orderCursor, od.length - 1);
  return od[pos] ?? 0;
}

/** Read a single cell from the pattern data cache */
function readCell(patternNum: number, row: number): Uint8Array {
  const state = useGTUltraStore.getState();
  const pd = state.patternData.get(patternNum);
  if (!pd) return new Uint8Array(4);
  const offset = row * BYTES_PER_CELL;
  if (offset + BYTES_PER_CELL > pd.data.length) return new Uint8Array(4);
  return pd.data.slice(offset, offset + BYTES_PER_CELL);
}

/** Write a cell to WASM via the engine */
function writeCell(patternNum: number, row: number, cell: Uint8Array): void {
  const engine = useGTUltraStore.getState().engine;
  if (!engine) return;
  for (let col = 0; col < BYTES_PER_CELL; col++) {
    engine.setPatternCell(patternNum, row, col, cell[col]);
  }
}

/** Refresh pattern data from WASM after edits */
function refreshPatterns(channels: number[], startCh: number): void {
  const engine = useGTUltraStore.getState().engine;
  if (!engine) return;
  const seen = new Set<number>();
  for (let i = 0; i < channels.length; i++) {
    const patNum = getPatternForChannel(startCh + i);
    if (!seen.has(patNum)) {
      seen.add(patNum);
      engine.requestPatternData(patNum);
    }
  }
}

/**
 * Copy the current selection to clipboard.
 */
export function gtCopy(): void {
  const state = useGTUltraStore.getState();
  const { selection, cursor } = state;
  const sel = normalizeSelection(selection, cursor);
  const rows = sel.endRow - sel.startRow + 1;
  const channels = sel.endChannel - sel.startChannel + 1;

  const data: Uint8Array[][] = [];
  for (let ch = 0; ch < channels; ch++) {
    const patNum = getPatternForChannel(sel.startChannel + ch);
    const channelData: Uint8Array[] = [];
    for (let r = 0; r < rows; r++) {
      channelData.push(readCell(patNum, sel.startRow + r));
    }
    data.push(channelData);
  }

  clipboard = { rows, channels, data };
}

/**
 * Paste clipboard at cursor position.
 */
export function gtPaste(): void {
  if (!clipboard) return;
  const state = useGTUltraStore.getState();
  const { cursor, patternLength, sidCount } = state;
  const maxCh = sidCount * 3;

  const pasteRows = Math.min(clipboard.rows, patternLength - cursor.row + 1);
  const pasteCh = Math.min(clipboard.channels, maxCh - cursor.channel);

  for (let ch = 0; ch < pasteCh; ch++) {
    const patNum = getPatternForChannel(cursor.channel + ch);
    for (let r = 0; r < pasteRows; r++) {
      writeCell(patNum, cursor.row + r, clipboard.data[ch][r]);
    }
  }

  refreshPatterns(Array.from({ length: pasteCh }, (_, i) => i), cursor.channel);
}

/**
 * Transpose selection by semitones.
 */
export function gtTranspose(semitones: number): void {
  const state = useGTUltraStore.getState();
  const { selection, cursor } = state;
  const sel = normalizeSelection(selection, cursor);
  const engine = state.engine;
  if (!engine) return;

  for (let ch = sel.startChannel; ch <= sel.endChannel; ch++) {
    const patNum = getPatternForChannel(ch);
    for (let r = sel.startRow; r <= sel.endRow; r++) {
      const cell = readCell(patNum, r);
      const note = cell[0];
      // Only transpose actual notes (1-95), skip empty/keyoff/keyon
      if (note >= 1 && note <= 95) {
        const transposed = Math.max(1, Math.min(95, note + semitones));
        engine.setPatternCell(patNum, r, 0, transposed);
      }
    }
  }

  refreshPatterns(Array.from({ length: sel.endChannel - sel.startChannel + 1 }, (_, i) => i), sel.startChannel);
}

/**
 * Delete (clear) the current selection.
 */
export function gtDelete(): void {
  const state = useGTUltraStore.getState();
  const { selection, cursor } = state;
  const sel = normalizeSelection(selection, cursor);
  const engine = state.engine;
  if (!engine) return;

  const empty = new Uint8Array(4);
  for (let ch = sel.startChannel; ch <= sel.endChannel; ch++) {
    const patNum = getPatternForChannel(ch);
    for (let r = sel.startRow; r <= sel.endRow; r++) {
      writeCell(patNum, r, empty);
    }
  }

  refreshPatterns(Array.from({ length: sel.endChannel - sel.startChannel + 1 }, (_, i) => i), sel.startChannel);
}

/**
 * Insert a blank row at cursor, shifting rows down (last row is lost).
 */
export function gtInsertRow(): void {
  const state = useGTUltraStore.getState();
  const { cursor, patternLength } = state;
  const engine = state.engine;
  if (!engine) return;

  const patNum = getPatternForChannel(cursor.channel);

  // Shift rows down from bottom to cursor
  for (let r = patternLength; r > cursor.row; r--) {
    const cell = readCell(patNum, r - 1);
    writeCell(patNum, r, cell);
  }
  // Clear the inserted row
  writeCell(patNum, cursor.row, new Uint8Array(4));

  engine.requestPatternData(patNum);
}

/**
 * Delete row at cursor, shifting rows up (last row becomes empty).
 */
export function gtDeleteRow(): void {
  const state = useGTUltraStore.getState();
  const { cursor, patternLength } = state;
  const engine = state.engine;
  if (!engine) return;

  const patNum = getPatternForChannel(cursor.channel);

  // Shift rows up from cursor to bottom
  for (let r = cursor.row; r < patternLength; r++) {
    const cell = readCell(patNum, r + 1);
    writeCell(patNum, r, cell);
  }
  // Clear the last row
  writeCell(patNum, patternLength, new Uint8Array(4));

  engine.requestPatternData(patNum);
}

/**
 * Interpolate values between first and last row of selection.
 * Works on command/param columns (cols 2-3) for smooth parameter sweeps.
 */
export function gtInterpolate(): void {
  const state = useGTUltraStore.getState();
  const { selection, cursor } = state;
  const sel = normalizeSelection(selection, cursor);
  const engine = state.engine;
  if (!engine) return;

  const rows = sel.endRow - sel.startRow;
  if (rows < 2) return;

  for (let ch = sel.startChannel; ch <= sel.endChannel; ch++) {
    const patNum = getPatternForChannel(ch);
    const startCell = readCell(patNum, sel.startRow);
    const endCell = readCell(patNum, sel.endRow);

    // Interpolate command parameter (col 3) between endpoints
    const startVal = startCell[3];
    const endVal = endCell[3];

    for (let r = 1; r < rows; r++) {
      const t = r / rows;
      const val = Math.round(startVal + (endVal - startVal) * t);
      engine.setPatternCell(patNum, sel.startRow + r, 3, val & 0xFF);
    }
  }

  refreshPatterns(Array.from({ length: sel.endChannel - sel.startChannel + 1 }, (_, i) => i), sel.startChannel);
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

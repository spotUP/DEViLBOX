/**
 * Clipboard Actions — pure helper functions for copy / cut / paste operations.
 *
 * All functions that modify pattern data expect to run on immer drafts.
 */

import type {
  Pattern,
  TrackerCell,
  ClipboardData,
  BlockSelection,
  CursorPosition,
} from '@typedefs';
import { EMPTY_CELL } from '@typedefs';

// Re-export mask constants so the store doesn't need two imports for paste logic
export const MASK_NOTE = 1 << 0;
export const MASK_INSTRUMENT = 1 << 1;
export const MASK_VOLUME = 1 << 2;
export const MASK_EFFECT = 1 << 3;
export const MASK_EFFECT2 = 1 << 4;

const hasMaskBit = (mask: number, bit: number): boolean => (mask & bit) !== 0;

// ---------------------------------------------------------------------------
// Resolve selection (fallback to single cell at cursor)
// ---------------------------------------------------------------------------

function resolveSel(
  sel: BlockSelection | null,
  cursor: CursorPosition,
): BlockSelection {
  if (sel) return sel;
  return {
    startChannel: cursor.channelIndex,
    endChannel: cursor.channelIndex,
    startRow: cursor.rowIndex,
    endRow: cursor.rowIndex,
    startColumn: cursor.columnType,
    endColumn: cursor.columnType,
    columnTypes: [cursor.columnType],
  };
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

export function copySelectionHelper(
  pattern: Pattern,
  sel: BlockSelection | null,
  cursor: CursorPosition,
): ClipboardData {
  const resolved = resolveSel(sel, cursor);
  const { startChannel, endChannel, startRow, endRow, columnTypes } = resolved;
  const minChannel = Math.min(startChannel, endChannel);
  const maxChannel = Math.max(startChannel, endChannel);
  const minRow = Math.min(startRow, endRow);
  const maxRow = Math.max(startRow, endRow);

  const copiedData: TrackerCell[][] = [];
  const isFullCell = !columnTypes || columnTypes.length === 0 || columnTypes.length > 8;

  for (let ch = minChannel; ch <= maxChannel; ch++) {
    const channelData: TrackerCell[] = [];
    for (let row = minRow; row <= maxRow; row++) {
      const sourceCell = pattern.channels[ch].rows[row];
      if (isFullCell) {
        channelData.push({ ...sourceCell });
      } else {
        const sparseCell: TrackerCell = { ...EMPTY_CELL };
        if (columnTypes.includes('note')) {
          sparseCell.note = sourceCell.note;
          sparseCell.instrument = sourceCell.instrument;
        }
        if (columnTypes.includes('instrument')) sparseCell.instrument = sourceCell.instrument;
        if (columnTypes.includes('volume')) sparseCell.volume = sourceCell.volume;
        if (columnTypes.includes('effTyp') || columnTypes.includes('effParam')) {
          sparseCell.effTyp = sourceCell.effTyp;
          sparseCell.eff = sourceCell.eff;
        }
        if (columnTypes.includes('effTyp2') || columnTypes.includes('effParam2')) {
          sparseCell.effTyp2 = sourceCell.effTyp2;
          sparseCell.eff2 = sourceCell.eff2;
        }
        if (columnTypes.includes('flag1')) sparseCell.flag1 = sourceCell.flag1;
        if (columnTypes.includes('flag2')) sparseCell.flag2 = sourceCell.flag2;
        if (columnTypes.includes('probability')) sparseCell.probability = sourceCell.probability;
        channelData.push(sparseCell);
      }
    }
    copiedData.push(channelData);
  }

  return {
    channels: maxChannel - minChannel + 1,
    rows: maxRow - minRow + 1,
    data: copiedData,
    columnTypes,
  };
}

// ---------------------------------------------------------------------------
// Cut  (copy + clear source cells)
// ---------------------------------------------------------------------------

export function cutSelectionHelper(
  pattern: Pattern,
  sel: BlockSelection | null,
  cursor: CursorPosition,
): ClipboardData {
  const resolved = resolveSel(sel, cursor);
  const { startChannel, endChannel, startRow, endRow, columnTypes } = resolved;
  const minChannel = Math.min(startChannel, endChannel);
  const maxChannel = Math.max(startChannel, endChannel);
  const minRow = Math.min(startRow, endRow);
  const maxRow = Math.max(startRow, endRow);

  const copiedData: TrackerCell[][] = [];
  const isFullCell = !columnTypes || columnTypes.length === 0 || columnTypes.length > 8;

  for (let ch = minChannel; ch <= maxChannel; ch++) {
    const channelData: TrackerCell[] = [];
    for (let row = minRow; row <= maxRow; row++) {
      const cell = pattern.channels[ch].rows[row];

      if (isFullCell) {
        channelData.push({ ...cell });
        pattern.channels[ch].rows[row] = { ...EMPTY_CELL };
      } else {
        const sparseCell: TrackerCell = { ...EMPTY_CELL };
        if (columnTypes.includes('note')) {
          sparseCell.note = cell.note;
          sparseCell.instrument = cell.instrument;
          cell.note = 0;
          cell.instrument = 0;
        }
        if (columnTypes.includes('instrument')) {
          sparseCell.instrument = cell.instrument;
          cell.instrument = 0;
        }
        if (columnTypes.includes('volume')) {
          sparseCell.volume = cell.volume;
          cell.volume = 0;
        }
        if (columnTypes.includes('effTyp') || columnTypes.includes('effParam')) {
          sparseCell.effTyp = cell.effTyp;
          sparseCell.eff = cell.eff;
          cell.effTyp = 0;
          cell.eff = 0;
        }
        if (columnTypes.includes('effTyp2') || columnTypes.includes('effParam2')) {
          sparseCell.effTyp2 = cell.effTyp2;
          sparseCell.eff2 = cell.eff2;
          cell.effTyp2 = 0;
          cell.eff2 = 0;
        }
        if (columnTypes.includes('flag1')) {
          sparseCell.flag1 = cell.flag1;
          cell.flag1 = undefined;
        }
        if (columnTypes.includes('flag2')) {
          sparseCell.flag2 = cell.flag2;
          cell.flag2 = undefined;
        }
        if (columnTypes.includes('probability')) {
          sparseCell.probability = cell.probability;
          cell.probability = undefined;
        }
        channelData.push(sparseCell);
      }
    }
    copiedData.push(channelData);
  }

  return {
    channels: maxChannel - minChannel + 1,
    rows: maxRow - minRow + 1,
    data: copiedData,
    columnTypes,
  };
}

// ---------------------------------------------------------------------------
// Paste
// ---------------------------------------------------------------------------

export function pasteHelper(
  pattern: Pattern,
  cursor: CursorPosition,
  clipboard: ClipboardData,
  pasteMask: number,
): void {
  const { channelIndex, rowIndex } = cursor;
  const { data, columnTypes } = clipboard;
  const isSparse = !!(columnTypes && columnTypes.length > 0 && columnTypes.length <= 8);

  for (let ch = 0; ch < data.length; ch++) {
    const targetChannel = channelIndex + ch;
    if (targetChannel >= pattern.channels.length) break;

    for (let row = 0; row < data[ch].length; row++) {
      const targetRow = rowIndex + row;
      if (targetRow >= pattern.length) break;

      const sourceCell = data[ch][row];
      const targetCell = pattern.channels[targetChannel].rows[targetRow];

      if (hasMaskBit(pasteMask, MASK_NOTE) && (!isSparse || columnTypes!.includes('note'))) {
        targetCell.note = sourceCell.note;
        if (sourceCell.instrument !== 0) {
          targetCell.instrument = sourceCell.instrument;
        }
      }
      if (hasMaskBit(pasteMask, MASK_INSTRUMENT) && (!isSparse || columnTypes!.includes('instrument'))) {
        targetCell.instrument = sourceCell.instrument;
      }
      if (hasMaskBit(pasteMask, MASK_VOLUME) && (!isSparse || columnTypes!.includes('volume'))) {
        targetCell.volume = sourceCell.volume;
      }
      if (hasMaskBit(pasteMask, MASK_EFFECT) && (!isSparse || columnTypes!.includes('effTyp') || columnTypes!.includes('effParam'))) {
        targetCell.effTyp = sourceCell.effTyp;
        targetCell.eff = sourceCell.eff;
      }
      if (hasMaskBit(pasteMask, MASK_EFFECT2) && (!isSparse || columnTypes!.includes('effTyp2') || columnTypes!.includes('effParam2'))) {
        targetCell.effTyp2 = sourceCell.effTyp2;
        targetCell.eff2 = sourceCell.eff2;
      }

      // Flags and prob
      if (isSparse) {
        if (columnTypes!.includes('flag1')) targetCell.flag1 = sourceCell.flag1;
        if (columnTypes!.includes('flag2')) targetCell.flag2 = sourceCell.flag2;
        if (columnTypes!.includes('probability')) targetCell.probability = sourceCell.probability;
      } else {
        if (sourceCell.flag1 !== undefined) targetCell.flag1 = sourceCell.flag1;
        if (sourceCell.flag2 !== undefined) targetCell.flag2 = sourceCell.flag2;
        if (sourceCell.probability !== undefined) targetCell.probability = sourceCell.probability;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Paste Mix — only fill empty cells
// ---------------------------------------------------------------------------

export function pasteMixHelper(
  pattern: Pattern,
  cursor: CursorPosition,
  clipboard: ClipboardData,
  pasteMask: number,
): void {
  const { channelIndex, rowIndex } = cursor;
  const { data } = clipboard;

  for (let ch = 0; ch < data.length; ch++) {
    const targetChannel = channelIndex + ch;
    if (targetChannel >= pattern.channels.length) break;

    for (let row = 0; row < data[ch].length; row++) {
      const targetRow = rowIndex + row;
      if (targetRow >= pattern.length) break;

      const sourceCell = data[ch][row];
      const targetCell = pattern.channels[targetChannel].rows[targetRow];

      if (hasMaskBit(pasteMask, MASK_NOTE) && sourceCell.note !== 0 && targetCell.note === 0) {
        targetCell.note = sourceCell.note;
      }
      if (hasMaskBit(pasteMask, MASK_INSTRUMENT) && sourceCell.instrument !== 0 && targetCell.instrument === 0) {
        targetCell.instrument = sourceCell.instrument;
      }
      if (hasMaskBit(pasteMask, MASK_VOLUME) && sourceCell.volume !== 0 && targetCell.volume === 0) {
        targetCell.volume = sourceCell.volume;
      }
      if (hasMaskBit(pasteMask, MASK_EFFECT) && (sourceCell.effTyp !== 0 || sourceCell.eff !== 0) && targetCell.effTyp === 0 && targetCell.eff === 0) {
        targetCell.effTyp = sourceCell.effTyp;
        targetCell.eff = sourceCell.eff;
      }
      if (hasMaskBit(pasteMask, MASK_EFFECT2) && (sourceCell.effTyp2 !== 0 || sourceCell.eff2 !== 0) && targetCell.effTyp2 === 0 && targetCell.eff2 === 0) {
        targetCell.effTyp2 = sourceCell.effTyp2;
        targetCell.eff2 = sourceCell.eff2;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Paste Flood — paste repeatedly until pattern end
// ---------------------------------------------------------------------------

export function pasteFloodHelper(
  pattern: Pattern,
  cursor: CursorPosition,
  clipboard: ClipboardData,
  pasteMask: number,
): void {
  const { channelIndex, rowIndex } = cursor;
  const { data } = clipboard;
  const clipboardRows = data[0]?.length || 0;
  if (clipboardRows === 0) return;

  for (let ch = 0; ch < data.length; ch++) {
    const targetChannel = channelIndex + ch;
    if (targetChannel >= pattern.channels.length) break;

    let currentRow = rowIndex;
    while (currentRow < pattern.length) {
      for (let row = 0; row < data[ch].length; row++) {
        const targetRow = currentRow + row;
        if (targetRow >= pattern.length) break;

        const sourceCell = data[ch][row];
        const targetCell = pattern.channels[targetChannel].rows[targetRow];

        if (hasMaskBit(pasteMask, MASK_NOTE)) targetCell.note = sourceCell.note;
        if (hasMaskBit(pasteMask, MASK_INSTRUMENT)) targetCell.instrument = sourceCell.instrument;
        if (hasMaskBit(pasteMask, MASK_VOLUME)) targetCell.volume = sourceCell.volume;
        if (hasMaskBit(pasteMask, MASK_EFFECT)) {
          targetCell.effTyp = sourceCell.effTyp;
          targetCell.eff = sourceCell.eff;
        }
        if (hasMaskBit(pasteMask, MASK_EFFECT2)) {
          targetCell.effTyp2 = sourceCell.effTyp2;
          targetCell.eff2 = sourceCell.eff2;
        }
      }
      currentRow += clipboardRows;
    }
  }
}

// ---------------------------------------------------------------------------
// Paste Push-Forward — insert clipboard data and shift existing content down
// ---------------------------------------------------------------------------

export function pastePushForwardHelper(
  pattern: Pattern,
  cursor: CursorPosition,
  clipboard: ClipboardData,
  pasteMask: number,
): void {
  const { channelIndex, rowIndex } = cursor;
  const { data } = clipboard;
  const clipboardRows = data[0]?.length || 0;
  if (clipboardRows === 0) return;

  for (let ch = 0; ch < data.length; ch++) {
    const targetChannel = channelIndex + ch;
    if (targetChannel >= pattern.channels.length) break;

    const channel = pattern.channels[targetChannel];

    // Shift existing rows down
    for (let row = pattern.length - 1; row >= rowIndex + clipboardRows; row--) {
      const sourceRow = row - clipboardRows;
      if (sourceRow >= rowIndex) {
        channel.rows[row] = { ...channel.rows[sourceRow] };
      }
    }

    // Insert clipboard data
    for (let row = 0; row < data[ch].length; row++) {
      const targetRow = rowIndex + row;
      if (targetRow >= pattern.length) break;

      const sourceCell = data[ch][row];
      const targetCell = channel.rows[targetRow];

      // Clear first
      targetCell.note = 0;
      targetCell.instrument = 0;
      targetCell.volume = 0;
      targetCell.effTyp = 0;
      targetCell.eff = 0;
      targetCell.effTyp2 = 0;
      targetCell.eff2 = 0;
      targetCell.flag1 = 0;
      targetCell.flag2 = 0;
      targetCell.probability = 0;

      if (hasMaskBit(pasteMask, MASK_NOTE)) {
        targetCell.note = sourceCell.note;
        targetCell.flag1 = sourceCell.flag1 ?? 0;
        targetCell.flag2 = sourceCell.flag2 ?? 0;
        targetCell.probability = sourceCell.probability ?? 0;
      }
      if (hasMaskBit(pasteMask, MASK_INSTRUMENT)) targetCell.instrument = sourceCell.instrument;
      if (hasMaskBit(pasteMask, MASK_VOLUME)) targetCell.volume = sourceCell.volume;
      if (hasMaskBit(pasteMask, MASK_EFFECT)) {
        targetCell.effTyp = sourceCell.effTyp;
        targetCell.eff = sourceCell.eff;
      }
      if (hasMaskBit(pasteMask, MASK_EFFECT2)) {
        targetCell.effTyp2 = sourceCell.effTyp2;
        targetCell.eff2 = sourceCell.eff2;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Track operations (single-channel)
// ---------------------------------------------------------------------------

export function copyTrackHelper(pattern: Pattern, channelIndex: number): TrackerCell[] | null {
  if (channelIndex < 0 || channelIndex >= pattern.channels.length) return null;
  return pattern.channels[channelIndex].rows.map((row) => ({ ...row }));
}

export function cutTrackHelper(pattern: Pattern, channelIndex: number): TrackerCell[] | null {
  if (channelIndex < 0 || channelIndex >= pattern.channels.length) return null;
  const channel = pattern.channels[channelIndex];
  const copied = channel.rows.map((row) => ({ ...row }));
  channel.rows = channel.rows.map(() => ({ ...EMPTY_CELL }));
  return copied;
}

export function pasteTrackHelper(
  pattern: Pattern,
  channelIndex: number,
  trackClipboard: TrackerCell[],
  pasteMask: number,
): void {
  if (channelIndex < 0 || channelIndex >= pattern.channels.length) return;
  const channel = pattern.channels[channelIndex];
  const maxRows = Math.min(trackClipboard.length, pattern.length);

  for (let row = 0; row < maxRows; row++) {
    const sourceCell = trackClipboard[row];
    const targetCell = channel.rows[row];

    if (hasMaskBit(pasteMask, MASK_NOTE)) targetCell.note = sourceCell.note;
    if (hasMaskBit(pasteMask, MASK_INSTRUMENT)) targetCell.instrument = sourceCell.instrument;
    if (hasMaskBit(pasteMask, MASK_VOLUME)) targetCell.volume = sourceCell.volume;
    if (hasMaskBit(pasteMask, MASK_EFFECT)) {
      targetCell.effTyp = sourceCell.effTyp;
      targetCell.eff = sourceCell.eff;
    }
    if (hasMaskBit(pasteMask, MASK_EFFECT2)) {
      targetCell.effTyp2 = sourceCell.effTyp2;
      targetCell.eff2 = sourceCell.eff2;
    }
  }
}

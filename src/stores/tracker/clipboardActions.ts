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

// Mask constants come from the shared leaf module. Re-exported so the store
// doesn't need two imports for paste logic.
import {
  MASK_NOTE,
  MASK_INSTRUMENT,
  MASK_VOLUME,
  MASK_EFFECT,
  MASK_EFFECT2,
} from '../editorMasks';
export { MASK_NOTE, MASK_INSTRUMENT, MASK_VOLUME, MASK_EFFECT, MASK_EFFECT2 };

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
          sparseCell.note2 = sourceCell.note2; sparseCell.instrument2 = sourceCell.instrument2;
          sparseCell.note3 = sourceCell.note3; sparseCell.instrument3 = sourceCell.instrument3;
          sparseCell.note4 = sourceCell.note4; sparseCell.instrument4 = sourceCell.instrument4;
        }
        if (columnTypes.includes('instrument')) {
          sparseCell.instrument = sourceCell.instrument;
          sparseCell.instrument2 = sourceCell.instrument2;
          sparseCell.instrument3 = sourceCell.instrument3;
          sparseCell.instrument4 = sourceCell.instrument4;
        }
        if (columnTypes.includes('volume')) {
          sparseCell.volume = sourceCell.volume;
          sparseCell.volume2 = sourceCell.volume2;
          sparseCell.volume3 = sourceCell.volume3;
          sparseCell.volume4 = sourceCell.volume4;
        }
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
          sparseCell.note = cell.note; sparseCell.instrument = cell.instrument;
          sparseCell.note2 = cell.note2; sparseCell.instrument2 = cell.instrument2;
          sparseCell.note3 = cell.note3; sparseCell.instrument3 = cell.instrument3;
          sparseCell.note4 = cell.note4; sparseCell.instrument4 = cell.instrument4;
          cell.note = 0; cell.instrument = 0;
          cell.note2 = undefined; cell.instrument2 = undefined;
          cell.note3 = undefined; cell.instrument3 = undefined;
          cell.note4 = undefined; cell.instrument4 = undefined;
        }
        if (columnTypes.includes('instrument')) {
          sparseCell.instrument = cell.instrument;
          sparseCell.instrument2 = cell.instrument2;
          sparseCell.instrument3 = cell.instrument3;
          sparseCell.instrument4 = cell.instrument4;
          cell.instrument = 0;
          cell.instrument2 = undefined;
          cell.instrument3 = undefined;
          cell.instrument4 = undefined;
        }
        if (columnTypes.includes('volume')) {
          sparseCell.volume = cell.volume;
          sparseCell.volume2 = cell.volume2;
          sparseCell.volume3 = cell.volume3;
          sparseCell.volume4 = cell.volume4;
          cell.volume = 0;
          cell.volume2 = undefined;
          cell.volume3 = undefined;
          cell.volume4 = undefined;
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
        targetCell.note2 = sourceCell.note2; targetCell.instrument2 = sourceCell.instrument2;
        targetCell.note3 = sourceCell.note3; targetCell.instrument3 = sourceCell.instrument3;
        targetCell.note4 = sourceCell.note4; targetCell.instrument4 = sourceCell.instrument4;
      }
      if (hasMaskBit(pasteMask, MASK_INSTRUMENT) && (!isSparse || columnTypes!.includes('instrument'))) {
        targetCell.instrument = sourceCell.instrument;
        targetCell.instrument2 = sourceCell.instrument2;
        targetCell.instrument3 = sourceCell.instrument3;
        targetCell.instrument4 = sourceCell.instrument4;
      }
      if (hasMaskBit(pasteMask, MASK_VOLUME) && (!isSparse || columnTypes!.includes('volume'))) {
        targetCell.volume = sourceCell.volume;
        targetCell.volume2 = sourceCell.volume2;
        targetCell.volume3 = sourceCell.volume3;
        targetCell.volume4 = sourceCell.volume4;
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
// Swap — copy selection, paste clipboard into selection, return copy as new clipboard
// ---------------------------------------------------------------------------

export function swapSelectionHelper(
  pattern: Pattern,
  sel: BlockSelection | null,
  cursor: CursorPosition,
  existingClipboard: ClipboardData,
  pasteMask: number,
): ClipboardData {
  // 1. Copy current selection into a temp clipboard
  const temp = copySelectionHelper(pattern, sel, cursor);

  // 2. Paste existing clipboard into the selection area (at selection origin)
  const resolved = sel
    ? {
        channelIndex: Math.min(sel.startChannel, sel.endChannel),
        rowIndex: Math.min(sel.startRow, sel.endRow),
        columnType: cursor.columnType,
      } as CursorPosition
    : cursor;
  pasteHelper(pattern, resolved, existingClipboard, pasteMask);

  // 3. Return the temp copy — caller stores it as the new clipboard
  return temp;
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
        if (sourceCell.note2 && !targetCell.note2) targetCell.note2 = sourceCell.note2;
        if (sourceCell.note3 && !targetCell.note3) targetCell.note3 = sourceCell.note3;
        if (sourceCell.note4 && !targetCell.note4) targetCell.note4 = sourceCell.note4;
      }
      if (hasMaskBit(pasteMask, MASK_INSTRUMENT) && sourceCell.instrument !== 0 && targetCell.instrument === 0) {
        targetCell.instrument = sourceCell.instrument;
        if (sourceCell.instrument2 && !targetCell.instrument2) targetCell.instrument2 = sourceCell.instrument2;
        if (sourceCell.instrument3 && !targetCell.instrument3) targetCell.instrument3 = sourceCell.instrument3;
        if (sourceCell.instrument4 && !targetCell.instrument4) targetCell.instrument4 = sourceCell.instrument4;
      }
      if (hasMaskBit(pasteMask, MASK_VOLUME) && sourceCell.volume !== 0 && targetCell.volume === 0) {
        targetCell.volume = sourceCell.volume;
        if (sourceCell.volume2 && !targetCell.volume2) targetCell.volume2 = sourceCell.volume2;
        if (sourceCell.volume3 && !targetCell.volume3) targetCell.volume3 = sourceCell.volume3;
        if (sourceCell.volume4 && !targetCell.volume4) targetCell.volume4 = sourceCell.volume4;
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

        if (hasMaskBit(pasteMask, MASK_NOTE)) {
          targetCell.note = sourceCell.note;
          targetCell.note2 = sourceCell.note2; targetCell.note3 = sourceCell.note3; targetCell.note4 = sourceCell.note4;
        }
        if (hasMaskBit(pasteMask, MASK_INSTRUMENT)) {
          targetCell.instrument = sourceCell.instrument;
          targetCell.instrument2 = sourceCell.instrument2; targetCell.instrument3 = sourceCell.instrument3; targetCell.instrument4 = sourceCell.instrument4;
        }
        if (hasMaskBit(pasteMask, MASK_VOLUME)) {
          targetCell.volume = sourceCell.volume;
          targetCell.volume2 = sourceCell.volume2; targetCell.volume3 = sourceCell.volume3; targetCell.volume4 = sourceCell.volume4;
        }
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

      // Clear first (including extra columns)
      targetCell.note = 0;
      targetCell.instrument = 0;
      targetCell.volume = 0;
      targetCell.note2 = undefined; targetCell.instrument2 = undefined; targetCell.volume2 = undefined;
      targetCell.note3 = undefined; targetCell.instrument3 = undefined; targetCell.volume3 = undefined;
      targetCell.note4 = undefined; targetCell.instrument4 = undefined; targetCell.volume4 = undefined;
      targetCell.effTyp = 0;
      targetCell.eff = 0;
      targetCell.effTyp2 = 0;
      targetCell.eff2 = 0;
      targetCell.flag1 = 0;
      targetCell.flag2 = 0;
      targetCell.probability = 0;

      if (hasMaskBit(pasteMask, MASK_NOTE)) {
        targetCell.note = sourceCell.note;
        targetCell.note2 = sourceCell.note2; targetCell.note3 = sourceCell.note3; targetCell.note4 = sourceCell.note4;
        targetCell.flag1 = sourceCell.flag1 ?? 0;
        targetCell.flag2 = sourceCell.flag2 ?? 0;
        targetCell.probability = sourceCell.probability ?? 0;
      }
      if (hasMaskBit(pasteMask, MASK_INSTRUMENT)) {
        targetCell.instrument = sourceCell.instrument;
        targetCell.instrument2 = sourceCell.instrument2; targetCell.instrument3 = sourceCell.instrument3; targetCell.instrument4 = sourceCell.instrument4;
      }
      if (hasMaskBit(pasteMask, MASK_VOLUME)) {
        targetCell.volume = sourceCell.volume;
        targetCell.volume2 = sourceCell.volume2; targetCell.volume3 = sourceCell.volume3; targetCell.volume4 = sourceCell.volume4;
      }
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

// ---------------------------------------------------------------------------
// PT Commands-only buffer (copies/pastes only effect columns)
// ---------------------------------------------------------------------------

export function copyCommandsHelper(pattern: Pattern, channelIndex: number): TrackerCell[] | null {
  if (channelIndex < 0 || channelIndex >= pattern.channels.length) return null;
  return pattern.channels[channelIndex].rows.map((row) => ({
    ...EMPTY_CELL,
    effTyp: row.effTyp ?? 0,
    eff: row.eff ?? 0,
    effTyp2: row.effTyp2 ?? 0,
    eff2: row.eff2 ?? 0,
  }));
}

export function cutCommandsHelper(pattern: Pattern, channelIndex: number): TrackerCell[] | null {
  if (channelIndex < 0 || channelIndex >= pattern.channels.length) return null;
  const channel = pattern.channels[channelIndex];
  const copied = channel.rows.map((row) => ({
    ...EMPTY_CELL,
    effTyp: row.effTyp ?? 0,
    eff: row.eff ?? 0,
    effTyp2: row.effTyp2 ?? 0,
    eff2: row.eff2 ?? 0,
  }));
  for (const row of channel.rows) {
    row.effTyp = 0;
    row.eff = 0;
    row.effTyp2 = 0;
    row.eff2 = 0;
  }
  return copied;
}

export function pasteCommandsHelper(
  pattern: Pattern,
  channelIndex: number,
  cmdsClipboard: TrackerCell[],
): void {
  if (channelIndex < 0 || channelIndex >= pattern.channels.length) return;
  const channel = pattern.channels[channelIndex];
  const maxRows = Math.min(cmdsClipboard.length, pattern.length);
  for (let row = 0; row < maxRows; row++) {
    channel.rows[row].effTyp = cmdsClipboard[row].effTyp;
    channel.rows[row].eff = cmdsClipboard[row].eff;
    channel.rows[row].effTyp2 = cmdsClipboard[row].effTyp2;
    channel.rows[row].eff2 = cmdsClipboard[row].eff2;
  }
}

// ---------------------------------------------------------------------------
// Kill to end / Kill to start
// ---------------------------------------------------------------------------

export function killToEndHelper(pattern: Pattern, channelIndex: number, fromRow: number): void {
  if (channelIndex < 0 || channelIndex >= pattern.channels.length) return;
  const channel = pattern.channels[channelIndex];
  for (let r = fromRow; r < pattern.length; r++) {
    channel.rows[r] = { ...EMPTY_CELL };
  }
}

export function killToStartHelper(pattern: Pattern, channelIndex: number, toRow: number): void {
  if (channelIndex < 0 || channelIndex >= pattern.channels.length) return;
  const channel = pattern.channels[channelIndex];
  for (let r = 0; r <= toRow; r++) {
    channel.rows[r] = { ...EMPTY_CELL };
  }
}

// ---------------------------------------------------------------------------
// Reverse rows in a channel (within range)
// ---------------------------------------------------------------------------

export function reverseBlockHelper(
  pattern: Pattern,
  channelIndex: number,
  startRow: number,
  endRow: number,
): void {
  if (channelIndex < 0 || channelIndex >= pattern.channels.length) return;
  const channel = pattern.channels[channelIndex];
  let lo = Math.max(0, startRow);
  let hi = Math.min(pattern.length - 1, endRow);
  while (lo < hi) {
    const tmp = channel.rows[lo];
    channel.rows[lo] = channel.rows[hi];
    channel.rows[hi] = tmp;
    lo++;
    hi--;
  }
}

// ---------------------------------------------------------------------------
// Double / Halve block rows (IT Alt+F / Alt+G)
// ---------------------------------------------------------------------------

export function doubleBlockHelper(
  pattern: Pattern,
  channelIndex: number,
  startRow: number,
  endRow: number,
): void {
  if (channelIndex < 0 || channelIndex >= pattern.channels.length) return;
  const channel = pattern.channels[channelIndex];
  // Double: insert empty rows between each existing row
  const expanded: TrackerCell[] = [];
  for (let r = startRow; r <= endRow && r < pattern.length; r++) {
    expanded.push({ ...channel.rows[r] });
    expanded.push({ ...EMPTY_CELL });
  }
  // Write back, capped to pattern length
  for (let i = 0; i < expanded.length && startRow + i < pattern.length; i++) {
    channel.rows[startRow + i] = expanded[i];
  }
}

export function halveBlockHelper(
  pattern: Pattern,
  channelIndex: number,
  startRow: number,
  endRow: number,
): void {
  if (channelIndex < 0 || channelIndex >= pattern.channels.length) return;
  const channel = pattern.channels[channelIndex];
  // Halve: keep every other row, shift remaining up
  const kept: TrackerCell[] = [];
  for (let r = startRow; r <= endRow && r < pattern.length; r += 2) {
    kept.push({ ...channel.rows[r] });
  }
  // Write back kept rows, fill remainder with empty
  for (let i = 0; i < kept.length; i++) {
    channel.rows[startRow + i] = kept[i];
  }
  for (let r = startRow + kept.length; r <= endRow && r < pattern.length; r++) {
    channel.rows[r] = { ...EMPTY_CELL };
  }
}

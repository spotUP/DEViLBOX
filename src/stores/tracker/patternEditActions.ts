/**
 * Pattern Edit Actions — pure helper functions that operate on immer draft Patterns.
 *
 * All functions mutate the draft in place (designed to run inside immer's `set()`).
 */

import type { Pattern, TrackerCell, BlockSelection, CursorPosition } from '@typedefs';
import { EMPTY_CELL } from '@typedefs';
import { xmNoteToMidi, midiToXMNote } from '@/lib/xmConversions';

// ---------------------------------------------------------------------------
// Basic cell / row operations
// ---------------------------------------------------------------------------

export function setCellInPattern(
  pattern: Pattern,
  channelIndex: number,
  rowIndex: number,
  cellUpdate: Partial<TrackerCell>,
): void {
  if (
    channelIndex >= 0 &&
    channelIndex < pattern.channels.length &&
    rowIndex >= 0 &&
    rowIndex < pattern.length
  ) {
    pattern.channels[channelIndex].rows[rowIndex] = {
      ...pattern.channels[channelIndex].rows[rowIndex],
      ...cellUpdate,
    };
  }
}

export function clearCellInPattern(
  pattern: Pattern,
  channelIndex: number,
  rowIndex: number,
): void {
  if (
    channelIndex >= 0 &&
    channelIndex < pattern.channels.length &&
    rowIndex >= 0 &&
    rowIndex < pattern.length
  ) {
    pattern.channels[channelIndex].rows[rowIndex] = { ...EMPTY_CELL };
  }
}

export function clearChannelInPattern(pattern: Pattern, channelIndex: number): void {
  if (channelIndex >= 0 && channelIndex < pattern.channels.length) {
    pattern.channels[channelIndex].rows = pattern.channels[channelIndex].rows.map(() => ({
      ...EMPTY_CELL,
    }));
  }
}

export function clearPatternCells(pattern: Pattern): void {
  pattern.channels.forEach((channel) => {
    channel.rows = channel.rows.map(() => ({ ...EMPTY_CELL }));
  });
}

export function insertRowInChannel(
  pattern: Pattern,
  channelIndex: number,
  rowIndex: number,
): void {
  if (
    channelIndex >= 0 &&
    channelIndex < pattern.channels.length &&
    rowIndex >= 0 &&
    rowIndex < pattern.length
  ) {
    const rows = pattern.channels[channelIndex].rows;
    for (let i = pattern.length - 1; i > rowIndex; i--) {
      rows[i] = { ...rows[i - 1] };
    }
    rows[rowIndex] = { ...EMPTY_CELL };
  }
}

export function deleteRowInChannel(
  pattern: Pattern,
  channelIndex: number,
  rowIndex: number,
): void {
  if (
    channelIndex >= 0 &&
    channelIndex < pattern.channels.length &&
    rowIndex >= 0 &&
    rowIndex < pattern.length
  ) {
    const rows = pattern.channels[channelIndex].rows;
    for (let i = rowIndex; i < pattern.length - 1; i++) {
      rows[i] = { ...rows[i + 1] };
    }
    rows[pattern.length - 1] = { ...EMPTY_CELL };
  }
}

// ---------------------------------------------------------------------------
// Selection-based editing helpers
// ---------------------------------------------------------------------------

/** Normalise a BlockSelection (or fall back to cursor-only). */
function resolveRange(
  sel: BlockSelection | null,
  cursor: CursorPosition,
): { minChannel: number; maxChannel: number; minRow: number; maxRow: number } {
  if (sel) {
    return {
      minChannel: Math.min(sel.startChannel, sel.endChannel),
      maxChannel: Math.max(sel.startChannel, sel.endChannel),
      minRow: Math.min(sel.startRow, sel.endRow),
      maxRow: Math.max(sel.startRow, sel.endRow),
    };
  }
  return {
    minChannel: cursor.channelIndex,
    maxChannel: cursor.channelIndex,
    minRow: cursor.rowIndex,
    maxRow: cursor.rowIndex,
  };
}

export function applyInstrumentToSelectionHelper(
  pattern: Pattern,
  sel: BlockSelection | null,
  cursor: CursorPosition,
  instrumentId: number,
): void {
  const { minChannel, maxChannel, minRow, maxRow } = resolveRange(sel, cursor);
  for (let ch = minChannel; ch <= maxChannel; ch++) {
    if (ch >= pattern.channels.length) continue;
    for (let row = minRow; row <= maxRow; row++) {
      if (row >= pattern.length) continue;
      const cell = pattern.channels[ch].rows[row];
      if (cell.note && cell.note !== 0) {
        cell.instrument = instrumentId;
      }
    }
  }
}

export function transposeSelectionHelper(
  pattern: Pattern,
  sel: BlockSelection | null,
  cursor: CursorPosition,
  semitones: number,
  targetInstrumentId: number | null,
): void {
  const { minChannel, maxChannel, minRow, maxRow } = resolveRange(sel, cursor);

  for (let ch = minChannel; ch <= maxChannel; ch++) {
    if (ch >= pattern.channels.length) continue;
    for (let row = minRow; row <= maxRow; row++) {
      if (row >= pattern.length) continue;
      const cell = pattern.channels[ch].rows[row];
      if (!cell.note || cell.note === 0 || cell.note === 97) continue;
      if (targetInstrumentId !== null && cell.instrument !== targetInstrumentId) continue;

      const midiNote = xmNoteToMidi(cell.note);
      if (midiNote === null) continue;
      const newMidiNote = midiNote + semitones;
      if (newMidiNote >= 12 && newMidiNote <= 107) {
        cell.note = midiToXMNote(newMidiNote);
      }
    }
  }
}

export function remapInstrumentHelper(
  patterns: Pattern[],
  currentPatternIndex: number,
  sel: BlockSelection | null,
  cursor: CursorPosition,
  oldId: number,
  newId: number,
  scope: 'block' | 'track' | 'pattern' | 'song',
): void {
  const processPattern = (
    patt: Pattern,
    channelIdx?: number,
    rowStart?: number,
    rowEnd?: number,
  ) => {
    const chStart = channelIdx !== undefined ? channelIdx : 0;
    const chEnd = channelIdx !== undefined ? channelIdx : patt.channels.length - 1;
    const rStart = rowStart !== undefined ? rowStart : 0;
    const rEnd = rowEnd !== undefined ? rowEnd : patt.length - 1;

    for (let ch = chStart; ch <= chEnd; ch++) {
      for (let row = rStart; row <= rEnd; row++) {
        if (patt.channels[ch].rows[row]?.instrument === oldId) {
          patt.channels[ch].rows[row].instrument = newId;
        }
      }
    }
  };

  if (scope === 'block' && sel) {
    const minChannel = Math.min(sel.startChannel, sel.endChannel);
    const maxChannel = Math.max(sel.startChannel, sel.endChannel);
    const minRow = Math.min(sel.startRow, sel.endRow);
    const maxRow = Math.max(sel.startRow, sel.endRow);
    for (let ch = minChannel; ch <= maxChannel; ch++) {
      processPattern(patterns[currentPatternIndex], ch, minRow, maxRow);
    }
  } else if (scope === 'track') {
    processPattern(patterns[currentPatternIndex], cursor.channelIndex);
  } else if (scope === 'pattern') {
    processPattern(patterns[currentPatternIndex]);
  } else if (scope === 'song') {
    patterns.forEach((p) => processPattern(p));
  }
}

export function interpolateSelectionHelper(
  pattern: Pattern,
  sel: BlockSelection,
  column: 'volume' | 'cutoff' | 'resonance' | 'envMod' | 'pan' | 'effParam' | 'effParam2',
  startValue: number,
  endValue: number,
  curve: 'linear' | 'log' | 'exp' | 'scurve' = 'linear',
): void {
  const minChannel = Math.min(sel.startChannel, sel.endChannel);
  const maxChannel = Math.max(sel.startChannel, sel.endChannel);
  const minRow = Math.min(sel.startRow, sel.endRow);
  const maxRow = Math.max(sel.startRow, sel.endRow);
  const rowCount = maxRow - minRow + 1;
  if (rowCount < 2) return;

  const applyCurve = (t: number): number => {
    switch (curve) {
      case 'log': return Math.log(1 + t * 9) / Math.log(10);
      case 'exp': return (Math.pow(10, t) - 1) / 9;
      case 'scurve': return t * t * (3 - 2 * t);
      default: return t;
    }
  };

  for (let ch = minChannel; ch <= maxChannel; ch++) {
    if (ch >= pattern.channels.length) continue;
    for (let row = minRow; row <= maxRow; row++) {
      if (row >= pattern.length) continue;
      const cell = pattern.channels[ch].rows[row];
      const linearT = (row - minRow) / (rowCount - 1);
      const t = applyCurve(linearT);
      const value = Math.round(startValue + (endValue - startValue) * t);

      if (column === 'volume') {
        cell.volume = Math.max(0x10, Math.min(0x50, value));
      } else if (column === 'effParam') {
        if (cell.effTyp === 0) cell.effTyp = 0x0c;
        cell.eff = Math.max(0, Math.min(255, value));
      } else if (column === 'effParam2') {
        if (cell.effTyp2 === 0) cell.effTyp2 = 0x0c;
        cell.eff2 = Math.max(0, Math.min(255, value));
      } else {
        const clamped = Math.max(0, Math.min(255, value));
        if (column === 'cutoff') cell.cutoff = clamped;
        else if (column === 'resonance') cell.resonance = clamped;
        else if (column === 'envMod') cell.envMod = clamped;
        else if (column === 'pan') cell.pan = clamped;
      }
    }
  }
}

export function humanizeSelectionHelper(
  pattern: Pattern,
  sel: BlockSelection,
  volumeVariation: number,
): void {
  const minChannel = Math.min(sel.startChannel, sel.endChannel);
  const maxChannel = Math.max(sel.startChannel, sel.endChannel);
  const minRow = Math.min(sel.startRow, sel.endRow);
  const maxRow = Math.max(sel.startRow, sel.endRow);

  for (let ch = minChannel; ch <= maxChannel; ch++) {
    if (ch >= pattern.channels.length) continue;
    for (let row = minRow; row <= maxRow; row++) {
      if (row >= pattern.length) continue;
      const cell = pattern.channels[ch].rows[row];
      if (!cell.note || cell.note === 0 || cell.note === 97) continue;

      const hasSetVolume = cell.volume >= 0x10 && cell.volume <= 0x50;
      const currentVolume = hasSetVolume ? cell.volume - 0x10 : 48;
      const maxVariation = Math.floor(currentVolume * (volumeVariation / 100));
      const randomOffset = Math.floor(Math.random() * (maxVariation * 2 + 1)) - maxVariation;
      const newVolume = Math.max(0, Math.min(64, currentVolume + randomOffset));
      cell.volume = 0x10 + newVolume;
    }
  }
}

export function strumSelectionHelper(
  pattern: Pattern,
  sel: BlockSelection,
  tickDelay: number,
  direction: 'up' | 'down',
): void {
  const minChannel = Math.min(sel.startChannel, sel.endChannel);
  const maxChannel = Math.max(sel.startChannel, sel.endChannel);
  const minRow = Math.min(sel.startRow, sel.endRow);
  const maxRow = Math.max(sel.startRow, sel.endRow);

  for (let row = minRow; row <= maxRow; row++) {
    if (row >= pattern.length) continue;
    for (let ch = minChannel; ch <= maxChannel; ch++) {
      if (ch >= pattern.channels.length) continue;
      const cell = pattern.channels[ch].rows[row];
      if (!cell.note || cell.note === 0 || cell.note === 97) continue;
      const chIdx = direction === 'down' ? ch - minChannel : maxChannel - ch;
      const delay = Math.min(0xf, chIdx * tickDelay);
      if (delay > 0) {
        cell.effTyp = 14; // E
        cell.eff = 0xd0 + delay;
      }
    }
  }
}

export function legatoSelectionHelper(pattern: Pattern, sel: BlockSelection): void {
  const minChannel = Math.min(sel.startChannel, sel.endChannel);
  const maxChannel = Math.max(sel.startChannel, sel.endChannel);
  const minRow = Math.min(sel.startRow, sel.endRow);
  const maxRow = Math.max(sel.startRow, sel.endRow);

  for (let ch = minChannel; ch <= maxChannel; ch++) {
    if (ch >= pattern.channels.length) continue;
    let lastNoteRow = -1;
    for (let row = minRow; row <= maxRow; row++) {
      if (row >= pattern.length) continue;
      const cell = pattern.channels[ch].rows[row];
      if (cell.note > 0 && cell.note < 97) {
        if (lastNoteRow >= 0 && row > lastNoteRow + 1) {
          if (cell.effTyp === 0) {
            cell.effTyp = 3;
            cell.eff = 0xff;
          }
        }
        lastNoteRow = row;
      }
    }
  }
}

/** Collect cells for a scope (block / track / pattern). Returned refs point into the draft. */
function collectCells(
  pattern: Pattern,
  scope: 'block' | 'track' | 'pattern',
  sel: BlockSelection | null,
  cursor: CursorPosition,
): TrackerCell[] {
  const cells: TrackerCell[] = [];
  if (scope === 'block' && sel) {
    const minChannel = Math.min(sel.startChannel, sel.endChannel);
    const maxChannel = Math.max(sel.startChannel, sel.endChannel);
    const minRow = Math.min(sel.startRow, sel.endRow);
    const maxRow = Math.max(sel.startRow, sel.endRow);
    for (let ch = minChannel; ch <= maxChannel; ch++) {
      for (let row = minRow; row <= maxRow; row++) {
        if (ch < pattern.channels.length && row < pattern.length) {
          cells.push(pattern.channels[ch].rows[row]);
        }
      }
    }
  } else if (scope === 'track') {
    const ch = cursor.channelIndex;
    if (ch < pattern.channels.length) {
      cells.push(...pattern.channels[ch].rows);
    }
  } else if (scope === 'pattern') {
    pattern.channels.forEach((channel) => {
      cells.push(...channel.rows);
    });
  }
  return cells;
}

export function scaleVolumeHelper(
  pattern: Pattern,
  scope: 'block' | 'track' | 'pattern',
  factor: number,
  sel: BlockSelection | null,
  cursor: CursorPosition,
): void {
  const cells = collectCells(pattern, scope, sel, cursor);
  cells.forEach((cell) => {
    if (cell.volume !== null && cell.volume !== undefined) {
      cell.volume = Math.min(0x40, Math.max(0, Math.round(cell.volume * factor)));
    }
  });
}

export function fadeVolumeHelper(
  pattern: Pattern,
  scope: 'block' | 'track' | 'pattern',
  startVol: number,
  endVol: number,
  sel: BlockSelection | null,
  cursor: CursorPosition,
): void {
  const cells = collectCells(pattern, scope, sel, cursor);
  const count = cells.length;
  if (count < 2) return;
  cells.forEach((cell, index) => {
    const t = index / (count - 1);
    const volume = Math.round(startVol + t * (endVol - startVol));
    cell.volume = Math.min(0x40, Math.max(0, volume));
  });
}

export function amplifySelectionHelper(
  pattern: Pattern,
  sel: BlockSelection,
  factor: number,
): void {
  const minCh = Math.min(sel.startChannel, sel.endChannel);
  const maxCh = Math.max(sel.startChannel, sel.endChannel);
  const minRow = Math.min(sel.startRow, sel.endRow);
  const maxRow = Math.max(sel.startRow, sel.endRow);
  for (let ch = minCh; ch <= maxCh; ch++) {
    for (let r = minRow; r <= maxRow; r++) {
      const cell = pattern.channels[ch]?.rows[r];
      if (cell && cell.volume != null && cell.volume > 0) {
        cell.volume = Math.max(0, Math.min(0x40, Math.round(cell.volume * factor)));
      }
    }
  }
}

export function swapChannelsHelper(pattern: Pattern, aIdx: number, bIdx: number): void {
  const tempRows = pattern.channels[aIdx].rows.map((r) => ({ ...r }));
  pattern.channels[aIdx].rows = pattern.channels[bIdx].rows.map((r) => ({ ...r }));
  pattern.channels[bIdx].rows = tempRows;
}

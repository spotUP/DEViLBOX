/**
 * Multi-Record & Macro Slot Actions — pure helper functions for FT2-style
 * multi-channel recording and macro slot operations.
 *
 * All pattern-mutating functions expect to run on immer drafts.
 */

import type { Pattern, TrackerCell, CursorPosition } from '@typedefs';
import { EMPTY_CELL } from '@typedefs';

// Re-use mask helpers locally
const MASK_NOTE = 1 << 0;
const MASK_INSTRUMENT = 1 << 1;
const MASK_VOLUME = 1 << 2;
const MASK_EFFECT = 1 << 3;
const MASK_EFFECT2 = 1 << 4;
const hasMaskBit = (mask: number, bit: number): boolean => (mask & bit) !== 0;

// ---------------------------------------------------------------------------
// Macro Slot types
// ---------------------------------------------------------------------------

export interface MacroSlot {
  note: number;
  instrument: number;
  volume: number;
  effTyp: number;
  eff: number;
  effTyp2: number;
  eff2: number;
}

export function createEmptyMacroSlot(): MacroSlot {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

// ---------------------------------------------------------------------------
// Write macro slot (capture current cell)
// ---------------------------------------------------------------------------

export function writeMacroSlotHelper(pattern: Pattern, cursor: CursorPosition): MacroSlot {
  const cell = pattern.channels[cursor.channelIndex].rows[cursor.rowIndex];
  return {
    note: cell.note,
    instrument: cell.instrument,
    volume: cell.volume,
    effTyp: cell.effTyp,
    eff: cell.eff,
    effTyp2: cell.effTyp2,
    eff2: cell.eff2,
  };
}

// ---------------------------------------------------------------------------
// Read macro slot (apply to pattern)
// ---------------------------------------------------------------------------

export function readMacroSlotHelper(
  pattern: Pattern,
  cursor: CursorPosition,
  macro: MacroSlot,
  pasteMask: number,
  insertMode: boolean,
): void {
  const { channelIndex, rowIndex } = cursor;

  if (!insertMode) {
    // Overwrite mode
    const targetCell = pattern.channels[channelIndex].rows[rowIndex];
    if (hasMaskBit(pasteMask, MASK_NOTE) && macro.note !== 0) targetCell.note = macro.note;
    if (hasMaskBit(pasteMask, MASK_INSTRUMENT) && macro.instrument !== 0) targetCell.instrument = macro.instrument;
    if (hasMaskBit(pasteMask, MASK_VOLUME) && macro.volume !== 0) targetCell.volume = macro.volume;
    if (hasMaskBit(pasteMask, MASK_EFFECT)) {
      targetCell.effTyp = macro.effTyp;
      targetCell.eff = macro.eff;
    }
    if (hasMaskBit(pasteMask, MASK_EFFECT2) && (macro.effTyp2 !== 0 || macro.eff2 !== 0)) {
      targetCell.effTyp2 = macro.effTyp2;
      targetCell.eff2 = macro.eff2;
    }
  } else {
    // Insert mode: shift rows down and insert macro
    const channel = pattern.channels[channelIndex];
    const newRow: TrackerCell = { ...EMPTY_CELL };

    if (hasMaskBit(pasteMask, MASK_NOTE) && macro.note !== 0) newRow.note = macro.note;
    if (hasMaskBit(pasteMask, MASK_INSTRUMENT) && macro.instrument !== 0) newRow.instrument = macro.instrument;
    if (hasMaskBit(pasteMask, MASK_VOLUME) && macro.volume !== 0) newRow.volume = macro.volume;
    if (hasMaskBit(pasteMask, MASK_EFFECT)) {
      newRow.effTyp = macro.effTyp;
      newRow.eff = macro.eff;
    }
    if (hasMaskBit(pasteMask, MASK_EFFECT2) && (macro.effTyp2 !== 0 || macro.eff2 !== 0)) {
      newRow.effTyp2 = macro.effTyp2;
      newRow.eff2 = macro.eff2;
    }

    channel.rows.splice(rowIndex, 0, newRow);
    if (channel.rows.length > pattern.length) {
      channel.rows.pop();
    }
  }
}

// ---------------------------------------------------------------------------
// Multi-channel recording — find best channel
// ---------------------------------------------------------------------------

export interface MultiRecState {
  multiRecEnabled: boolean;
  multiEditEnabled: boolean;
  multiRecChannels: boolean[];
  keyOnTab: number[];
  keyOffTime: number[];
}

export function findBestChannelHelper(
  state: MultiRecState,
  numChannels: number,
  cursorChannel: number,
): number {
  if (!state.multiRecEnabled && !state.multiEditEnabled) {
    return cursorChannel;
  }

  let bestChannel = cursorChannel;
  let bestTime = Infinity;

  for (let i = 0; i < numChannels; i++) {
    if (
      state.multiRecChannels[i] &&
      state.keyOnTab[i] === 0 &&
      state.keyOffTime[i] < bestTime
    ) {
      bestChannel = i;
      bestTime = state.keyOffTime[i];
    }
  }

  return bestChannel;
}

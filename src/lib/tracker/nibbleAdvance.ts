/**
 * FT2 nibble-cursor advance decider.
 *
 * In Fast Tracker 2 a multi-digit field (instrument, effect param, volume value)
 * is edited one nibble at a time: typing a hex digit writes that nibble AND moves
 * the caret one nibble right within the SAME cell; only after the last nibble does
 * the cursor drop to the next row (per edit step). Typing an effect TYPE character
 * moves the caret straight to the effect PARAM high nibble, so `A`,`0`,`F` is one
 * continuous typing flow.
 *
 * This module is the single source of truth for that post-keystroke cursor move.
 * It is pure so it can be unit-tested without a canvas/DOM.
 */

export type NibbleAdvance =
  | { kind: 'nibble'; digitIndex: number }
  | { kind: 'column'; columnType: 'effParam' | 'effParam2' }
  | { kind: 'row'; rowIndex: number }
  | { kind: 'none' };

export interface NibbleAdvanceInput {
  columnType: string;
  digitIndex: number;
  editStep: number;
  isPlaying: boolean;
  currentRow: number;
  patternLength: number;
  advanceOnInstrument: boolean;
  advanceOnVolume: boolean;
  advanceOnEffect: boolean;
}

/** Number of editable nibbles/characters in each data column. */
const NIBBLE_COUNTS: Record<string, number> = {
  instrument: 2,
  volume: 2,
  effParam: 2,
  effParam2: 2,
  probability: 2,
  cutoff: 2,
  resonance: 2,
  envMod: 2,
  pan: 2,
  effTyp: 1,
  effTyp2: 1,
  flag1: 1,
  flag2: 1,
};

export function computeNibbleAdvance(input: NibbleAdvanceInput): NibbleAdvance {
  // During playback the cursor follows the play row; do not fight it with
  // entry-driven moves (matches the pre-existing "no advance while playing").
  if (input.isPlaying) return { kind: 'none' };

  const { columnType, digitIndex } = input;

  // Effect TYPE char → jump to the param high nibble on the same cell.
  if (columnType === 'effTyp') return { kind: 'column', columnType: 'effParam' };
  if (columnType === 'effTyp2') return { kind: 'column', columnType: 'effParam2' };

  const nibbles = NIBBLE_COUNTS[columnType] ?? 1;

  // Multi-nibble value column, not yet on the last nibble → move one nibble
  // right within the same cell. Unconditional (independent of edit step) so both
  // hex digits can always be typed in place.
  if (nibbles > 1 && digitIndex < nibbles - 1) {
    return { kind: 'nibble', digitIndex: digitIndex + 1 };
  }

  // Last nibble (or a single-char terminal column) → advance a row per edit step,
  // gated by the scheme's per-column advance flags. digitIndex resets to 0.
  const gate =
    columnType === 'instrument' ? input.advanceOnInstrument
    : columnType === 'volume' ? input.advanceOnVolume
    : columnType.startsWith('eff') ? input.advanceOnEffect
    : true; // flag / probability always advance

  if (input.editStep > 0 && gate && input.patternLength > 0) {
    return { kind: 'row', rowIndex: (input.currentRow + input.editStep) % input.patternLength };
  }
  return { kind: 'none' };
}

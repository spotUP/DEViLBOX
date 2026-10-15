/**
 * Post-keystroke cursor move after a data entry. The move itself comes from an
 * EntryAdvanceProfile (entryAdvanceProfiles.ts): data per original tracker.
 * This module is the single decision point; it is pure so it can be unit-tested
 * without a canvas/DOM.
 */

import { ENTRY_PROFILES, type EntryAdvanceProfile, type EntryMove } from './entryAdvanceProfiles';

export type NibbleAdvance =
  | { kind: 'nibble'; digitIndex: number }
  | { kind: 'column'; columnType: 'effParam' | 'effParam2' }
  | { kind: 'row'; rowIndex: number; columnType?: 'effTyp' | 'effTyp2'; digitIndex: number }
  | { kind: 'none' };

export interface NibbleAdvanceInput {
  columnType: string;
  digitIndex: number;
  editStep: number;
  isPlaying: boolean;
  currentRow: number;
  patternLength: number;
  /** Defaults to the DEViLBOX default profile. */
  profile?: EntryAdvanceProfile;
  /** Digits of the effect TYPE field: 1 (tracker glyph, default) or 2 (Furnace code, effectNotation.ts). */
  effectTypeDigits?: number;
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
  flag1: 1,
  flag2: 1,
};

/** The profile's move for one keystroke; columns the profiles do not cover use the default profile's generic rule. */
function moveFor(profile: EntryAdvanceProfile, columnType: string, digitIndex: number): EntryMove {
  const d = digitIndex > 0 ? 1 : 0;
  switch (columnType) {
    case 'instrument': return profile.instrument[d];
    case 'volume': return profile.volume[d];
    case 'effTyp':
    case 'effTyp2': return profile.effectCommand;
    case 'effParam':
    case 'effParam2': return profile.effectParam[d];
    default: return (NIBBLE_COUNTS[columnType] ?? 1) > 1 && d === 0 ? 'nextDigit' : 'down';
  }
}

export function computeNibbleAdvance(input: NibbleAdvanceInput): NibbleAdvance {
  // During playback the cursor follows the play row; do not fight it with
  // entry-driven moves (PT2 and FT2 only step in edit mode: pt2_edit.c:176, ft2_edit.c:262).
  if (input.isPlaying) return { kind: 'none' };

  const { columnType, digitIndex } = input;
  const profile = input.profile ?? ENTRY_PROFILES.devilbox;
  const isCommand = columnType === 'effTyp' || columnType === 'effTyp2';

  // A 2-digit Furnace effect code always walks to its second digit first (unless the profile keeps the cursor still).
  if (isCommand && digitIndex < (input.effectTypeDigits ?? 1) - 1) {
    return profile.effectCommand === 'stay' ? { kind: 'none' } : { kind: 'nibble', digitIndex: digitIndex + 1 };
  }

  const down = (digit: number, to?: 'effTyp' | 'effTyp2'): NibbleAdvance =>
    input.editStep > 0 && input.patternLength > 0
      ? { kind: 'row', rowIndex: (input.currentRow + input.editStep) % input.patternLength, columnType: to, digitIndex: digit }
      : { kind: 'none' };

  switch (moveFor(profile, columnType, digitIndex)) {
    case 'stay': return { kind: 'none' };
    case 'nextDigit': return { kind: 'nibble', digitIndex: digitIndex + 1 };
    case 'toParam': return { kind: 'column', columnType: columnType === 'effTyp2' ? 'effParam2' : 'effParam' };
    case 'downToCommand': return down(0, columnType === 'effParam2' ? 'effTyp2' : 'effTyp');
    case 'down': return down(digitIndex);
    case 'downFirstDigit': return down(0);
  }
}

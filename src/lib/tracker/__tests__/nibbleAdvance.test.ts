import { describe, it, expect } from 'vitest';
import { computeNibbleAdvance, type NibbleAdvanceInput } from '../nibbleAdvance';
import { ENTRY_PROFILES, type EntryProfileId } from '../entryAdvanceProfiles';

const base: NibbleAdvanceInput = {
  columnType: 'instrument',
  digitIndex: 0,
  editStep: 1,
  isPlaying: false,
  currentRow: 5,
  patternLength: 64,
};

const withProfile = (id: EntryProfileId, over: Partial<NibbleAdvanceInput>): NibbleAdvanceInput =>
  ({ ...base, profile: ENTRY_PROFILES[id], ...over });

describe('computeNibbleAdvance - DEViLBOX default profile (the FT2 nibble cursor of a5f0748d5)', () => {
  it('instrument first nibble moves to the second nibble in place (not the next row)', () => {
    expect(computeNibbleAdvance({ ...base, columnType: 'instrument', digitIndex: 0 }))
      .toEqual({ kind: 'nibble', digitIndex: 1 });
  });

  it('instrument last nibble advances one row per edit step and starts a fresh entry on digit 0', () => {
    expect(computeNibbleAdvance({ ...base, columnType: 'instrument', digitIndex: 1, currentRow: 5 }))
      .toEqual({ kind: 'row', rowIndex: 6, columnType: undefined, digitIndex: 0 });
  });

  it('effect type character jumps to the effect param high nibble on the same cell', () => {
    expect(computeNibbleAdvance({ ...base, columnType: 'effTyp', digitIndex: 0 }))
      .toEqual({ kind: 'column', columnType: 'effParam' });
    expect(computeNibbleAdvance({ ...base, columnType: 'effTyp2', digitIndex: 0 }))
      .toEqual({ kind: 'column', columnType: 'effParam2' });
  });

  it('effect param first nibble moves to the second nibble, second nibble advances the row', () => {
    expect(computeNibbleAdvance({ ...base, columnType: 'effParam', digitIndex: 0 }))
      .toEqual({ kind: 'nibble', digitIndex: 1 });
    expect(computeNibbleAdvance({ ...base, columnType: 'effParam', digitIndex: 1, currentRow: 0 }))
      .toEqual({ kind: 'row', rowIndex: 1, columnType: undefined, digitIndex: 0 });
  });

  it('volume prefix nibble moves to the value nibble in place', () => {
    expect(computeNibbleAdvance({ ...base, columnType: 'volume', digitIndex: 0 }))
      .toEqual({ kind: 'nibble', digitIndex: 1 });
  });

  it('single-char flag column advances the row', () => {
    expect(computeNibbleAdvance({ ...base, columnType: 'flag1', digitIndex: 0, currentRow: 2 }))
      .toEqual({ kind: 'row', rowIndex: 3, columnType: undefined, digitIndex: 0 });
  });

  it('row advance wraps at the pattern end', () => {
    expect(computeNibbleAdvance({ ...base, columnType: 'instrument', digitIndex: 1, currentRow: 63, patternLength: 64 }))
      .toMatchObject({ kind: 'row', rowIndex: 0 });
  });

  it('edit step 0 does not advance the row on the last nibble', () => {
    expect(computeNibbleAdvance({ ...base, columnType: 'instrument', digitIndex: 1, editStep: 0 }))
      .toEqual({ kind: 'none' });
  });

  it('still moves to the second nibble with edit step 0 (nibble move is unconditional)', () => {
    expect(computeNibbleAdvance({ ...base, columnType: 'instrument', digitIndex: 0, editStep: 0 }))
      .toEqual({ kind: 'nibble', digitIndex: 1 });
  });

  it('no advance at all while playing (cursor follows the play row)', () => {
    expect(computeNibbleAdvance({ ...base, columnType: 'instrument', digitIndex: 0, isPlaying: true }))
      .toEqual({ kind: 'none' });
    expect(computeNibbleAdvance({ ...base, columnType: 'effTyp', digitIndex: 0, isPlaying: true }))
      .toEqual({ kind: 'none' });
  });
});

describe('computeNibbleAdvance - per-tracker profiles (numbers from the 2026-10-15 research table)', () => {
  it('ProTracker: the effect command moves DOWN in the command column (pt2_edit.c:313), not to the parameter', () => {
    expect(computeNibbleAdvance(withProfile('protracker', { columnType: 'effTyp', digitIndex: 0 })))
      .toEqual({ kind: 'row', rowIndex: 6, columnType: undefined, digitIndex: 0 });
  });

  it('ProTracker: parameter digits move down and keep their digit slot (pt2_edit.c:327, :341)', () => {
    expect(computeNibbleAdvance(withProfile('protracker', { columnType: 'effParam', digitIndex: 0 })))
      .toEqual({ kind: 'row', rowIndex: 6, columnType: undefined, digitIndex: 0 });
    expect(computeNibbleAdvance(withProfile('protracker', { columnType: 'effParam', digitIndex: 1 })))
      .toEqual({ kind: 'row', rowIndex: 6, columnType: undefined, digitIndex: 1 });
  });

  it('ProTracker: both sample digits move down (pt2_edit.c:285, :299)', () => {
    expect(computeNibbleAdvance(withProfile('protracker', { columnType: 'instrument', digitIndex: 0 })))
      .toMatchObject({ kind: 'row', rowIndex: 6, digitIndex: 0 });
    expect(computeNibbleAdvance(withProfile('protracker', { columnType: 'instrument', digitIndex: 1 })))
      .toMatchObject({ kind: 'row', rowIndex: 6, digitIndex: 1 });
  });

  it('ProTracker: wraps at the pattern end and honours the edit step', () => {
    expect(computeNibbleAdvance(withProfile('protracker', { columnType: 'effTyp', currentRow: 63, editStep: 2 })))
      .toMatchObject({ kind: 'row', rowIndex: 1 });
    expect(computeNibbleAdvance(withProfile('protracker', { columnType: 'effTyp', editStep: 0 })))
      .toEqual({ kind: 'none' });
  });

  it('ProTracker: does not step while the song plays (pt2_edit.c MODE_RECORD)', () => {
    expect(computeNibbleAdvance(withProfile('protracker', { columnType: 'effTyp', isPlaying: true })))
      .toEqual({ kind: 'none' });
  });

  it('FastTracker 2: every data entry moves down in the same column (ft2_edit.c:263)', () => {
    for (const columnType of ['instrument', 'volume', 'effTyp', 'effParam']) {
      expect(computeNibbleAdvance(withProfile('fasttracker2', { columnType, digitIndex: 0 })))
        .toMatchObject({ kind: 'row', rowIndex: 6, digitIndex: 0 });
    }
    expect(computeNibbleAdvance(withProfile('fasttracker2', { columnType: 'effParam', digitIndex: 1 })))
      .toMatchObject({ kind: 'row', digitIndex: 1 });
  });

  it('Impulse Tracker: digit then down; command moves down; last parameter digit returns to the command column (page_patedit.c:3493-3609)', () => {
    const it = (columnType: string, digitIndex: number) =>
      computeNibbleAdvance(withProfile('impulse-tracker', { columnType, digitIndex }));
    expect(it('instrument', 0)).toEqual({ kind: 'nibble', digitIndex: 1 });
    expect(it('instrument', 1)).toMatchObject({ kind: 'row', rowIndex: 6, digitIndex: 0 });
    expect(it('volume', 0)).toEqual({ kind: 'nibble', digitIndex: 1 });
    expect(it('volume', 1)).toMatchObject({ kind: 'row', rowIndex: 6 });
    expect(it('effTyp', 0)).toMatchObject({ kind: 'row', rowIndex: 6 });
    expect(it('effParam', 0)).toEqual({ kind: 'nibble', digitIndex: 1 });
    expect(it('effParam', 1)).toEqual({ kind: 'row', rowIndex: 6, columnType: 'effTyp', digitIndex: 0 });
    expect(it('effParam2', 1)).toEqual({ kind: 'row', rowIndex: 6, columnType: 'effTyp2', digitIndex: 0 });
  });

  it('OpenMPT: the cursor stays after instrument, volume and effect entry (View_pat.cpp:5512, :5053, :5231)', () => {
    for (const [columnType, digitIndex] of [['instrument', 0], ['instrument', 1], ['volume', 1], ['effTyp', 0], ['effParam', 0], ['effParam', 1]] as const) {
      expect(computeNibbleAdvance(withProfile('openmpt', { columnType, digitIndex }))).toEqual({ kind: 'none' });
    }
  });
});

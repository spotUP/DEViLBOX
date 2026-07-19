import { describe, it, expect } from 'vitest';
import { computeNibbleAdvance, type NibbleAdvanceInput } from '../nibbleAdvance';

const base: NibbleAdvanceInput = {
  columnType: 'instrument',
  digitIndex: 0,
  editStep: 1,
  isPlaying: false,
  currentRow: 5,
  patternLength: 64,
  advanceOnInstrument: true,
  advanceOnVolume: true,
  advanceOnEffect: true,
};

describe('computeNibbleAdvance — FT2 nibble cursor', () => {
  it('instrument first nibble moves to the second nibble in place (not the next row)', () => {
    expect(computeNibbleAdvance({ ...base, columnType: 'instrument', digitIndex: 0 }))
      .toEqual({ kind: 'nibble', digitIndex: 1 });
  });

  it('instrument last nibble advances one row per edit step', () => {
    expect(computeNibbleAdvance({ ...base, columnType: 'instrument', digitIndex: 1, currentRow: 5 }))
      .toEqual({ kind: 'row', rowIndex: 6 });
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
      .toEqual({ kind: 'row', rowIndex: 1 });
  });

  it('volume prefix nibble moves to the value nibble in place', () => {
    expect(computeNibbleAdvance({ ...base, columnType: 'volume', digitIndex: 0 }))
      .toEqual({ kind: 'nibble', digitIndex: 1 });
  });

  it('single-char flag column advances the row', () => {
    expect(computeNibbleAdvance({ ...base, columnType: 'flag1', digitIndex: 0, currentRow: 2 }))
      .toEqual({ kind: 'row', rowIndex: 3 });
  });

  it('row advance wraps at the pattern end', () => {
    expect(computeNibbleAdvance({ ...base, columnType: 'instrument', digitIndex: 1, currentRow: 63, patternLength: 64 }))
      .toEqual({ kind: 'row', rowIndex: 0 });
  });

  it('edit step 0 does not advance the row on the last nibble', () => {
    expect(computeNibbleAdvance({ ...base, columnType: 'instrument', digitIndex: 1, editStep: 0 }))
      .toEqual({ kind: 'none' });
  });

  it('still moves to the second nibble with edit step 0 (nibble move is unconditional)', () => {
    expect(computeNibbleAdvance({ ...base, columnType: 'instrument', digitIndex: 0, editStep: 0 }))
      .toEqual({ kind: 'nibble', digitIndex: 1 });
  });

  it('per-column advance gate off keeps the cursor on the last nibble', () => {
    expect(computeNibbleAdvance({ ...base, columnType: 'effParam', digitIndex: 1, advanceOnEffect: false }))
      .toEqual({ kind: 'none' });
  });

  it('no advance at all while playing (cursor follows the play row)', () => {
    expect(computeNibbleAdvance({ ...base, columnType: 'instrument', digitIndex: 0, isPlaying: true }))
      .toEqual({ kind: 'none' });
    expect(computeNibbleAdvance({ ...base, columnType: 'effTyp', digitIndex: 0, isPlaying: true }))
      .toEqual({ kind: 'none' });
  });
});

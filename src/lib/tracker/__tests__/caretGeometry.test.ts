import { describe, it, expect } from 'vitest';
import { computeCaretRect, type CaretGeometryInput } from '../caretGeometry';

// charWidth = 10: note = 34, group = 34+4 + 20+4 + 20+4 = 86.
// inst field starts at paramBase = 38, vol at 38+24 = 62, effects at noteCols*86.
const base: CaretGeometryInput = {
  columnType: 'note',
  digitIndex: 0,
  noteColumnIndex: 0,
  charWidth: 10,
  noteCols: 1,
  effectCols: 2,
  hasAcid: false,
};

describe('computeCaretRect — per-nibble caret geometry', () => {
  it('note caret spans the whole note field', () => {
    expect(computeCaretRect({ ...base, columnType: 'note' }))
      .toEqual({ offX: 0, width: 34 });
  });

  it('instrument caret is one char wide and steps per nibble', () => {
    expect(computeCaretRect({ ...base, columnType: 'instrument', digitIndex: 0 }))
      .toEqual({ offX: 38, width: 10 });
    expect(computeCaretRect({ ...base, columnType: 'instrument', digitIndex: 1 }))
      .toEqual({ offX: 48, width: 10 });
  });

  it('volume caret steps per nibble', () => {
    expect(computeCaretRect({ ...base, columnType: 'volume', digitIndex: 0 }))
      .toEqual({ offX: 62, width: 10 });
    expect(computeCaretRect({ ...base, columnType: 'volume', digitIndex: 1 }))
      .toEqual({ offX: 72, width: 10 });
  });

  it('effTyp sits at the effects base; effParam skips the type glyph and steps per nibble', () => {
    // effBase = noteCols(1) * 86 = 86
    expect(computeCaretRect({ ...base, columnType: 'effTyp' }))
      .toEqual({ offX: 86, width: 10 });
    expect(computeCaretRect({ ...base, columnType: 'effParam', digitIndex: 0 }))
      .toEqual({ offX: 96, width: 10 });
    expect(computeCaretRect({ ...base, columnType: 'effParam', digitIndex: 1 }))
      .toEqual({ offX: 106, width: 10 });
  });

  it('second effect column offsets by one effect cell (cw*3+4 = 34)', () => {
    expect(computeCaretRect({ ...base, columnType: 'effTyp2' }))
      .toEqual({ offX: 120, width: 10 });
    expect(computeCaretRect({ ...base, columnType: 'effParam2', digitIndex: 1 }))
      .toEqual({ offX: 140, width: 10 });
  });

  it('acid flags sit after the effect cells; probability shifts when acid present', () => {
    // effBase 86, effectCols*34 = 68 → acidOff = 154
    const acid = { ...base, hasAcid: true };
    expect(computeCaretRect({ ...acid, columnType: 'flag1' }))
      .toEqual({ offX: 154, width: 10 });
    expect(computeCaretRect({ ...acid, columnType: 'flag2' }))
      .toEqual({ offX: 168, width: 10 });
    // probOff = acidOff(154) + cw*2+8 (28) = 182
    expect(computeCaretRect({ ...acid, columnType: 'probability', digitIndex: 1 }))
      .toEqual({ offX: 192, width: 10 });
  });

  it('a second note column shifts the caret by one group width', () => {
    expect(computeCaretRect({ ...base, columnType: 'note', noteColumnIndex: 1 }))
      .toEqual({ offX: 86, width: 34 });
  });
});

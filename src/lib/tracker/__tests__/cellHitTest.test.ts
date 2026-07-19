import { describe, it, expect } from 'vitest';
import { resolveCellColumn, type CellHitInput } from '../cellHitTest';

// CHAR_WIDTH = 10 for readable pixel math:
//   note = 34, group = 34+4 + 20+4 + 20+4 = 86 (inst 38..58, vol 62..82)
//   effect cell = 34 (type 0..10, param-hi 10..20, param-lo 20..30)
const base: CellHitInput = {
  localX: 0,
  charWidth: 10,
  totalNoteCols: 1,
  effectCols: 2,
  hasAcid: false,
  hasProb: false,
};

describe('resolveCellColumn — click resolves column AND nibble', () => {
  it('lands on the note column at the start of a group', () => {
    expect(resolveCellColumn({ ...base, localX: 0 }))
      .toEqual({ columnType: 'note', noteColumnIndex: 0, digitIndex: 0 });
  });

  it('resolves both instrument nibbles', () => {
    expect(resolveCellColumn({ ...base, localX: 38 }))
      .toEqual({ columnType: 'instrument', noteColumnIndex: 0, digitIndex: 0 });
    expect(resolveCellColumn({ ...base, localX: 48 }))
      .toEqual({ columnType: 'instrument', noteColumnIndex: 0, digitIndex: 1 });
  });

  it('resolves both volume nibbles', () => {
    expect(resolveCellColumn({ ...base, localX: 62 }))
      .toEqual({ columnType: 'volume', noteColumnIndex: 0, digitIndex: 0 });
    expect(resolveCellColumn({ ...base, localX: 72 }))
      .toEqual({ columnType: 'volume', noteColumnIndex: 0, digitIndex: 1 });
  });

  it('effect cell: type glyph → effTyp, both param glyphs → effParam nibbles', () => {
    expect(resolveCellColumn({ ...base, localX: 86 }))
      .toEqual({ columnType: 'effTyp', noteColumnIndex: 0, digitIndex: 0 });
    expect(resolveCellColumn({ ...base, localX: 96 }))
      .toEqual({ columnType: 'effParam', noteColumnIndex: 0, digitIndex: 0 });
    expect(resolveCellColumn({ ...base, localX: 106 }))
      .toEqual({ columnType: 'effParam', noteColumnIndex: 0, digitIndex: 1 });
  });

  it('second effect cell resolves to effTyp2 / effParam2', () => {
    expect(resolveCellColumn({ ...base, localX: 120 }))
      .toEqual({ columnType: 'effTyp2', noteColumnIndex: 0, digitIndex: 0 });
    expect(resolveCellColumn({ ...base, localX: 130 }))
      .toEqual({ columnType: 'effParam2', noteColumnIndex: 0, digitIndex: 0 });
    expect(resolveCellColumn({ ...base, localX: 140 }))
      .toEqual({ columnType: 'effParam2', noteColumnIndex: 0, digitIndex: 1 });
  });

  it('acid flag columns resolve when present', () => {
    const acid = { ...base, effectCols: 1, hasAcid: true };
    // allNoteColsEnd = 86, one effect cell = 34 → flags start at 120
    expect(resolveCellColumn({ ...acid, localX: 120 }))
      .toEqual({ columnType: 'flag1', noteColumnIndex: 0, digitIndex: 0 });
    expect(resolveCellColumn({ ...acid, localX: 134 }))
      .toEqual({ columnType: 'flag2', noteColumnIndex: 0, digitIndex: 0 });
  });

  it('probability column resolves both digits', () => {
    const prob = { ...base, effectCols: 0, hasProb: true };
    expect(resolveCellColumn({ ...prob, localX: 86 }))
      .toEqual({ columnType: 'probability', noteColumnIndex: 0, digitIndex: 0 });
    expect(resolveCellColumn({ ...prob, localX: 96 }))
      .toEqual({ columnType: 'probability', noteColumnIndex: 0, digitIndex: 1 });
  });

  it('indexes the correct note column in a multi-note channel', () => {
    const multi = { ...base, totalNoteCols: 2 };
    expect(resolveCellColumn({ ...multi, localX: 86 }))
      .toEqual({ columnType: 'note', noteColumnIndex: 1, digitIndex: 0 });
    expect(resolveCellColumn({ ...multi, localX: 124 }))
      .toEqual({ columnType: 'instrument', noteColumnIndex: 1, digitIndex: 0 });
  });
});

/**
 * Furnace effect notation in the grid's geometry and typing: an effect cell is
 * four characters (two type digits, two value digits), the caret and a click
 * reach both type digits, and typing two hex digits into the type writes the
 * Furnace code before the caret moves to the value. Tracker channels keep the
 * one-glyph, three-character cell.
 */
import { describe, it, expect } from 'vitest';
import {
  effectCellChars, effectCellWidth, effectNotationOf, effectTypeDigits, emptyEffectText,
  furnaceEffectText, furnaceEffectTypeAfterDigit,
} from '../effectNotation';
import { computeCaretRect } from '../caretGeometry';
import { resolveCellColumn } from '../cellHitTest';
import { computeNibbleAdvance } from '../nibbleAdvance';

const CW = 10;
const GROUP = CW * 3 + 4 + 4 + CW * 2 + 4 + CW * 2 + 4; // note + inst + vol + gaps

describe('Furnace effect notation', () => {
  it('writes code + value as two hex digits each, like Furnace', () => {
    expect(furnaceEffectText(0x80, 0x40)).toBe('8040');
    expect(furnaceEffectText(0x90, 0x12)).toBe('9012');
    expect(furnaceEffectText(0xe5, 0x80)).toBe('E580');
    expect(furnaceEffectText(0x04, 0x0a)).toBe('040A');
    expect(emptyEffectText('furnace')).toBe('....');
    expect(emptyEffectText('tracker')).toBe('...');
  });

  it('a channel is tracker notation unless its meta says furnace', () => {
    expect(effectNotationOf(undefined)).toBe('tracker');
    expect(effectNotationOf({})).toBe('tracker');
    expect(effectNotationOf({ effectNotation: 'furnace' })).toBe('furnace');
    expect([effectTypeDigits('tracker'), effectCellChars('tracker'), effectCellWidth(CW, 'tracker')]).toEqual([1, 3, CW * 3 + 4]);
    expect([effectTypeDigits('furnace'), effectCellChars('furnace'), effectCellWidth(CW, 'furnace')]).toEqual([2, 4, CW * 4 + 4]);
  });

  it('the caret sits on each of the four characters of a Furnace effect cell', () => {
    const at = (columnType: string, digitIndex: number) => computeCaretRect({
      columnType, digitIndex, noteColumnIndex: 0, charWidth: CW, noteCols: 1, effectCols: 2, effectNotation: 'furnace', hasAcid: false,
    }).offX - GROUP;
    expect([at('effTyp', 0), at('effTyp', 1), at('effParam', 0), at('effParam', 1)]).toEqual([0, CW, CW * 2, CW * 3]);
    expect(at('effTyp2', 0)).toBe(CW * 4 + 4);
    expect(at('effParam2', 1)).toBe(CW * 4 + 4 + CW * 3);
    // tracker cells unchanged
    expect(computeCaretRect({ columnType: 'effParam2', digitIndex: 1, noteColumnIndex: 0, charWidth: CW, noteCols: 1, effectCols: 2, hasAcid: false }).offX - GROUP)
      .toBe(CW * 3 + 4 + CW * 2);
  });

  it('a click lands on the type digit or value nibble under the pointer', () => {
    const hit = (x: number) => resolveCellColumn({ localX: GROUP + x, charWidth: CW, totalNoteCols: 1, effectCols: 2, effectNotation: 'furnace', hasAcid: false, hasProb: false });
    expect(hit(1)).toMatchObject({ columnType: 'effTyp', digitIndex: 0 });
    expect(hit(CW + 1)).toMatchObject({ columnType: 'effTyp', digitIndex: 1 });
    expect(hit(CW * 2 + 1)).toMatchObject({ columnType: 'effParam', digitIndex: 0 });
    expect(hit(CW * 3 + 1)).toMatchObject({ columnType: 'effParam', digitIndex: 1 });
    expect(hit(CW * 4 + 4 + CW + 1)).toMatchObject({ columnType: 'effTyp2', digitIndex: 1 });
    expect(hit(CW * 4 + 4 + CW * 3 + 1)).toMatchObject({ columnType: 'effParam2', digitIndex: 1 });
  });

  it('typing 8 then 0 into the type writes 0x80, then moves to the value', () => {
    let t = furnaceEffectTypeAfterDigit(0x00, 0, 0x8);
    expect(t).toBe(0x80);
    t = furnaceEffectTypeAfterDigit(t, 1, 0x1);
    expect(t).toBe(0x81);
    const base = { editStep: 1, isPlaying: false, currentRow: 0, patternLength: 64, advanceOnInstrument: true, advanceOnVolume: true, advanceOnEffect: true };
    expect(computeNibbleAdvance({ ...base, columnType: 'effTyp', digitIndex: 0, effectTypeDigits: 2 })).toEqual({ kind: 'nibble', digitIndex: 1 });
    expect(computeNibbleAdvance({ ...base, columnType: 'effTyp', digitIndex: 1, effectTypeDigits: 2 })).toEqual({ kind: 'column', columnType: 'effParam' });
    expect(computeNibbleAdvance({ ...base, columnType: 'effTyp2', digitIndex: 0 })).toEqual({ kind: 'column', columnType: 'effParam2' });
  });
});

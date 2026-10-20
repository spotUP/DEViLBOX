/**
 * Per-nibble caret geometry for the fixed-column (Note/Inst/Vol/Eff) grid.
 *
 * Returns the caret box offset + width RELATIVE to a channel's content origin,
 * for a given cursor column and nibble. The GL renderer already highlighted the
 * exact nibble; the Canvas2D fallback drew one box across the whole channel,
 * ignoring columnType/digitIndex. Extracting the math here makes both renderers
 * draw the identical caret from one source (and lets it be unit-tested without
 * a canvas — jsdom has no layout, Playwright is forbidden here).
 *
 * Layout (matches both renderers):
 *   note(cw*3+4) | 4 | inst(cw*2) | 4 | vol(cw*2) | 4   ×noteCols
 *   then effectCols × effect(cw*3+4), then optional acid flags, then probability.
 * In Furnace effect notation an effect cell is 4 chars (cw*4+4): a 2-digit type, a 2-digit value.
 */
import { effectCellWidth, effectTypeDigits, type EffectNotation } from './effectNotation';

export interface CaretGeometryInput {
  columnType: string;
  digitIndex: number;
  noteColumnIndex: number;
  charWidth: number;
  noteCols: number;
  effectCols: number;
  /** The channel's effect notation (default 'tracker'); 'furnace' widens the type field to 2 digits. */
  effectNotation?: EffectNotation;
  /** Whether acid-flag columns are present (shifts the probability column). */
  hasAcid: boolean;
}

export interface CaretRect {
  offX: number;
  width: number;
}

export function computeCaretRect(input: CaretGeometryInput): CaretRect {
  const cw = input.charWidth;
  const noteWidth = cw * 3 + 4;
  const NOTE_COL_GROUP_W = noteWidth + 4 + cw * 2 + 4 + cw * 2 + 4;
  const paramBase = noteWidth + 4;

  const noteCols = Math.max(1, input.noteCols);
  const noteColOffset = Math.max(0, input.noteColumnIndex) * NOTE_COL_GROUP_W;
  const effBase = noteCols * NOTE_COL_GROUP_W;
  const effW = effectCellWidth(cw, input.effectNotation);
  const typW = effectTypeDigits(input.effectNotation) * cw;
  const acidOff = effBase + input.effectCols * effW;
  const probOff = acidOff + (input.hasAcid ? cw * 2 + 8 : 0);
  const d = input.digitIndex;

  switch (input.columnType) {
    case 'note':       return { offX: noteColOffset, width: noteWidth };
    case 'instrument': return { offX: noteColOffset + paramBase + d * cw, width: cw };
    case 'volume':     return { offX: noteColOffset + paramBase + (cw * 2 + 4) + d * cw, width: cw };
    case 'effTyp':     return { offX: effBase + (typW > cw ? d * cw : 0), width: cw };
    case 'effParam':   return { offX: effBase + typW + d * cw, width: cw };
    case 'effTyp2':    return { offX: effBase + effW + (typW > cw ? d * cw : 0), width: cw };
    case 'effParam2':  return { offX: effBase + effW + typW + d * cw, width: cw };
    case 'flag1':      return { offX: acidOff, width: cw };
    case 'flag2':      return { offX: acidOff + cw + 4, width: cw };
    case 'probability':return { offX: probOff + d * cw, width: cw };
    default:           return { offX: effBase, width: cw };
  }
}

/**
 * The whole field (note, instrument, volume, one effect slot, flag, probability)
 * the caret sits in. Both renderers outline it so the field being edited stays
 * visible even when blank-empty-cells mode draws nothing for empty fields; the
 * per-nibble caret alone gave no hint of which field a digit belonged to.
 */
export function computeFieldRect(input: CaretGeometryInput): CaretRect {
  const cw = input.charWidth;
  const effW = effectCellWidth(cw, input.effectNotation) - 4;
  const caret = computeCaretRect({ ...input, digitIndex: 0 });
  switch (input.columnType) {
    case 'instrument':
    case 'volume':
    case 'probability': return { offX: caret.offX, width: cw * 2 };
    case 'effTyp':
    case 'effParam':    return { offX: computeCaretRect({ ...input, columnType: 'effTyp', digitIndex: 0 }).offX, width: effW };
    case 'effTyp2':
    case 'effParam2':   return { offX: computeCaretRect({ ...input, columnType: 'effTyp2', digitIndex: 0 }).offX, width: effW };
    default:            return caret;
  }
}

/** Shared look of the field outline: border and fill alpha over the theme accent, outline padding in px. */
export const FIELD_OUTLINE_STYLE = { borderAlpha: 0.85, fillAlpha: 0.12, pad: 1 } as const;

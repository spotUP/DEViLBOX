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
 */

export interface CaretGeometryInput {
  columnType: string;
  digitIndex: number;
  noteColumnIndex: number;
  charWidth: number;
  noteCols: number;
  effectCols: number;
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
  const acidOff = effBase + input.effectCols * (cw * 3 + 4);
  const probOff = acidOff + (input.hasAcid ? cw * 2 + 8 : 0);
  const d = input.digitIndex;

  switch (input.columnType) {
    case 'note':       return { offX: noteColOffset, width: noteWidth };
    case 'instrument': return { offX: noteColOffset + paramBase + d * cw, width: cw };
    case 'volume':     return { offX: noteColOffset + paramBase + (cw * 2 + 4) + d * cw, width: cw };
    case 'effTyp':     return { offX: effBase, width: cw };
    case 'effParam':   return { offX: effBase + cw + d * cw, width: cw };
    case 'effTyp2':    return { offX: effBase + (cw * 3 + 4), width: cw };
    case 'effParam2':  return { offX: effBase + (cw * 3 + 4) + cw + d * cw, width: cw };
    case 'flag1':      return { offX: acidOff, width: cw };
    case 'flag2':      return { offX: acidOff + cw + 4, width: cw };
    case 'probability':return { offX: probOff + d * cw, width: cw };
    default:           return { offX: effBase, width: cw };
  }
}

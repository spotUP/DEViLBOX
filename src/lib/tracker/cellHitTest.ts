/**
 * Pattern-grid cell hit-test: map a horizontal pixel offset inside a channel's
 * content box to the precise column AND nibble the user clicked.
 *
 * The old click path stopped at the column (note/instrument/volume/effTyp) and
 * always parked digitIndex at 0 — so you could never click the SECOND hex
 * nibble of an instrument/param, and clicking anywhere on an effect cell landed
 * on the type char even when you meant a param nibble. This decider fixes both:
 * it returns the exact `digitIndex` for multi-nibble fields and resolves the
 * effect cell's three glyphs (type, param-hi, param-lo) to effTyp/effParam.
 *
 * Kept pure (pixel math only, no canvas/DOM) so it can be unit-tested — jsdom
 * has no layout and Playwright is forbidden in this project.
 *
 * Layout mirrors the GL renderer (TrackerGLRenderer) exactly:
 *   note(charWidth*3+4) | 4px | inst(charWidth*2) | 4px | vol(charWidth*2) | 4px
 * repeated `totalNoteCols` times, then `effectCols` effect cells of
 * (charWidth*3+4) each, then optional acid flags and probability.
 */

export type CellColumnType =
  | 'note'
  | 'instrument'
  | 'volume'
  | 'effTyp'
  | 'effParam'
  | 'effTyp2'
  | 'effParam2'
  | 'flag1'
  | 'flag2'
  | 'probability';

export interface CellHitInput {
  /** X offset (px) relative to the start of the channel's centered content box. */
  localX: number;
  charWidth: number;
  totalNoteCols: number;
  effectCols: number;
  hasAcid: boolean;
  hasProb: boolean;
}

export interface CellHit {
  columnType: CellColumnType;
  noteColumnIndex: number;
  digitIndex: number;
}

export function resolveCellColumn(input: CellHitInput): CellHit {
  const CW = input.charWidth;
  const noteWidth = CW * 3 + 4;
  const instWidth = CW * 2;
  const volWidth = CW * 2;
  const NOTE_COL_GROUP_W = noteWidth + 4 + instWidth + 4 + volWidth + 4;
  const effWidth = CW * 3 + 4;
  const paramBase = noteWidth + 4; // where the instrument field starts in a group

  const localX = Math.max(0, input.localX);
  const totalNoteCols = Math.max(1, input.totalNoteCols);
  const allNoteColsEnd = NOTE_COL_GROUP_W * totalNoteCols;

  // Clamp a pixel offset within a field to a nibble index [0 .. count-1].
  const nibbleOf = (offset: number, count: number) =>
    Math.min(count - 1, Math.max(0, Math.floor(offset / CW)));

  if (localX < allNoteColsEnd) {
    const noteColumnIndex = Math.min(totalNoteCols - 1, Math.max(0, Math.floor(localX / NOTE_COL_GROUP_W)));
    const xInGroup = localX - noteColumnIndex * NOTE_COL_GROUP_W;
    if (xInGroup < paramBase) {
      return { columnType: 'note', noteColumnIndex, digitIndex: 0 };
    }
    const instStart = paramBase;
    const volStart = instStart + instWidth + 4;
    if (xInGroup < volStart) {
      return { columnType: 'instrument', noteColumnIndex, digitIndex: nibbleOf(xInGroup - instStart, 2) };
    }
    return { columnType: 'volume', noteColumnIndex, digitIndex: nibbleOf(xInGroup - volStart, 2) };
  }

  // Past all note columns → effects, flags, probability.
  const xInParams = localX - allNoteColsEnd;
  const effectsWidth = input.effectCols * effWidth;
  if (input.effectCols > 0 && xInParams < effectsWidth) {
    const effCol = Math.floor(xInParams / effWidth);
    const xInEff = xInParams - effCol * effWidth;
    // Glyph 0 = type char, glyphs 1..2 = the two param nibbles.
    const onType = xInEff < CW;
    const paramDigit = xInEff < CW * 2 ? 0 : 1;
    if (effCol === 0) {
      return onType
        ? { columnType: 'effTyp', noteColumnIndex: 0, digitIndex: 0 }
        : { columnType: 'effParam', noteColumnIndex: 0, digitIndex: paramDigit };
    }
    return onType
      ? { columnType: 'effTyp2', noteColumnIndex: 0, digitIndex: 0 }
      : { columnType: 'effParam2', noteColumnIndex: 0, digitIndex: paramDigit };
  }

  if (input.hasAcid && xInParams < effectsWidth + CW * 2 + 8) {
    const onFirst = xInParams < effectsWidth + CW + 4;
    return { columnType: onFirst ? 'flag1' : 'flag2', noteColumnIndex: 0, digitIndex: 0 };
  }
  if (input.hasProb) {
    return { columnType: 'probability', noteColumnIndex: 0, digitIndex: nibbleOf(xInParams - effectsWidth, 2) };
  }
  return { columnType: 'effTyp', noteColumnIndex: 0, digitIndex: 0 };
}

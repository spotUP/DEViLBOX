/**
 * Top edge of the edit row (the row the cursor or playhead sits on) inside the
 * pattern grid, in px. The one owner of that position: renderers, the worker's
 * hit test and the editor's overlays all call it.
 *
 * With no dub deck open the row sits at the vertical centre of the grid. The
 * deck takes its height from the editor column, so `height` shrinks while
 * `referenceHeight` (grid height + deck height, the height the grid has with the
 * deck closed) stays put: the row keeps its deck-closed screen position and the
 * rows below it are cropped first. Once the deck reaches the row, the row pins
 * to the bottom edge of the grid instead of being cropped away.
 */
/** Unscaled row height, in logical px, of a grid drawn at tracker zoom 1 (the read-only views always). */
export const BASE_ROW_HEIGHT = 24;

export function editRowTop(height: number, rowH: number, referenceHeight: number = height): number {
  return Math.min(Math.floor(referenceHeight / 2) - rowH / 2, height - rowH);
}

/**
 * Rows to lay out around the edit row: `topLines` above it and `visibleLines`
 * in all, enough to fill the grid from its top edge to its bottom edge
 * (plus one row of slack each side for the sub-row scroll offset).
 */
export function editRowWindow(
  height: number,
  rowH: number,
  referenceHeight: number = height,
): { centerLineTop: number; topLines: number; visibleLines: number } {
  const centerLineTop = editRowTop(height, rowH, referenceHeight);
  const topLines = Math.max(0, Math.ceil(centerLineTop / rowH)) + 1;
  const visibleLines = topLines + Math.ceil((height - centerLineTop) / rowH) + 1;
  return { centerLineTop, topLines, visibleLines };
}

/**
 * The edit bar in CSS px of the grid element, as the renderer draws it. The
 * renderer lays the grid out in logical px (every length divided by `scale`)
 * and draws it `scale` times larger, so the bar's screen edges are the logical
 * edges times `scale`. `rowHeightPx` is the on-screen row height. Overlays that
 * must line up with the bar (the channel meters) take their edges from here.
 */
export function editRowBand(
  height: number,
  rowHeightPx: number,
  referenceHeight: number = height,
  scale: number = 1,
): { top: number; bottom: number } {
  const top = editRowTop(height / scale, rowHeightPx / scale, referenceHeight / scale) * scale;
  return { top, bottom: top + rowHeightPx };
}

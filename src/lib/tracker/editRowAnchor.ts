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

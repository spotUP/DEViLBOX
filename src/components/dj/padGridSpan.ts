/**
 * padColumnSpan - how many grid columns pad `index` of `count` should span in a
 * grid of `columns`, so a short last row fills the full width: the remaining
 * cells are shared as evenly as possible, extra columns going to the first pads.
 */
export function padColumnSpan(index: number, count: number, columns: number): number {
  const lastRowStart = count - (count % columns || columns);
  if (index < lastRowStart) return 1;
  const inRow = count - lastRowStart;
  const base = Math.floor(columns / inRow);
  const extra = columns % inRow;
  return base + (index - lastRowStart < extra ? 1 : 0);
}

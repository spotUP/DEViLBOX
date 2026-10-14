/**
 * Which row of a song a row preview renders, in the player's own terms (see GridFollow.targetOf): the player's order
 * and row, or a range of its ticks (reconstructed grids, where a grid row is `speed` ticks).
 */
export type RowTarget =
  | { kind: 'orderRow'; order: number; row: number }
  | { kind: 'ticks'; from: number; to: number };

/** The key a target is remembered under (a timeline entry); equal targets give equal keys. */
export function rowTargetKey(t: RowTarget): string {
  return t.kind === 'orderRow' ? `o${t.order}:${t.row}` : `t${t.from}:${t.to}`;
}

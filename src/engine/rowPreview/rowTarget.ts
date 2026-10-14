/**
 * Which row of a song a row preview renders, in the player's own terms (see GridFollow.targetOf): the player's order
 * and row, a range of its ticks (reconstructed grids, where a grid row is `speed` ticks), or a range of output frames from the
 * song's start (an engine that reports no position at all: its grid is a timing the playhead follow keeps, so the row IS
 * that stretch of the song).
 */
export type RowTarget =
  | { kind: 'orderRow'; order: number; row: number }
  | { kind: 'ticks'; from: number; to: number }
  | { kind: 'frames'; from: number; to: number };

/** The key a target is remembered under (a timeline entry); equal targets give equal keys. */
export function rowTargetKey(t: RowTarget): string {
  if (t.kind === 'orderRow') return `o${t.order}:${t.row}`;
  return `${t.kind === 'ticks' ? 't' : 'f'}${t.from}:${t.to}`;
}

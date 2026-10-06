/**
 * Where in the grid a song is, from the player's own tick count.
 *
 * An engine that runs a format's real player (UADE, the eagleplayer runner)
 * knows how many player ticks it has run, not which grid row that is: the
 * grid is a view a parser or UADE's scan drew, `speed` ticks per row
 * (song.initialSpeed), patterns in song order. One mapping for every such
 * engine, so the grid follows what comes out of the speakers.
 */

export interface TickGrid {
  /** Player ticks per grid row (song.initialSpeed). */
  speed: number;
  /** Pattern index per order position (song.songPositions). */
  songPositions: readonly number[];
  /** Rows per pattern, by pattern index. */
  patternLengths: readonly number[];
  /**
   * Past the last order position: undefined holds the last row (UADE's
   * scan grid ends where its scan ended); a position number goes on from
   * there, as the player loops its song (song.restartPosition).
   */
  loopFrom?: number;
}

export interface GridPosition { songPos: number; row: number }

export function tickGridPosition(ticks: number, grid: TickGrid): GridPosition {
  const order = grid.songPositions;
  if (order.length === 0 || !Number.isFinite(ticks)) return { songPos: 0, row: 0 };
  const lenAt = (pos: number) => Math.max(1, grid.patternLengths[order[pos]] ?? 64);
  let remaining = Math.max(0, Math.floor(ticks / Math.max(1, grid.speed || 1)));
  for (let pos = 0; pos < order.length; pos++) {
    const len = lenAt(pos);
    if (remaining < len) return { songPos: pos, row: remaining };
    remaining -= len;
  }
  const last = order.length - 1;
  const loopFrom = grid.loopFrom;
  if (loopFrom === undefined || loopFrom < 0 || loopFrom > last) {
    return { songPos: last, row: lenAt(last) - 1 };
  }
  let loopRows = 0;
  for (let pos = loopFrom; pos <= last; pos++) loopRows += lenAt(pos);
  remaining %= loopRows;
  for (let pos = loopFrom; pos <= last; pos++) {
    const len = lenAt(pos);
    if (remaining < len) return { songPos: pos, row: remaining };
    remaining -= len;
  }
  return { songPos: last, row: lenAt(last) - 1 };
}

/**
 * walkLayout.ts - how a replayer's walk becomes the tracker grid's patterns, and where the playhead is on it.
 *
 * One layout for every format whose grid is the player's walk of a song in rows of `speed` interrupts
 * (Future Player, Music Assembler): patterns of 64 rows, the loop's first row starting one so the song
 * restarts on a pattern, and the position (song order index, row) of the player's n-th interrupt.
 *
 * ZERO imports: the engines (main thread) and the importers share it.
 */

export const WALK_ROWS_PER_PATTERN = 64;

/** What a walk must say for the layout: its rows, where it loops, its speed and how it ended. */
export interface WalkShape {
  rows: number;
  /** First row of the loop body; -1 when the walk did not close a loop. */
  loopRow: number;
  /** Interrupts per row. */
  speed: number;
  /** A loop, every voice ended, or the row cap (the song plays on past the grid). */
  stop: 'loop' | 'ended' | 'cap';
}

/** Where the grid's patterns begin and how long each is: 64 rows, the loop's first row starting one. */
export interface WalkLayout {
  rows: number;
  /** First row of the loop body; -1 when the song does not loop. */
  loopRow: number;
  /** Interrupts per row. */
  speed: number;
  /** Rows of each pattern, in order. */
  patternLengths: number[];
  /** Pattern the song restarts at (the loop's first); 0 without a loop. */
  restartPosition: number;
  stop: WalkShape['stop'];
}

export function walkLayout(walk: WalkShape): WalkLayout {
  const lengths: number[] = [];
  const cut = (from: number, to: number): void => {
    for (let r = from; r < to; r += WALK_ROWS_PER_PATTERN) lengths.push(Math.min(WALK_ROWS_PER_PATTERN, to - r));
  };
  const loopRow = walk.stop === 'loop' ? walk.loopRow : -1;
  let restartPosition = 0;
  if (loopRow > 0) { cut(0, loopRow); restartPosition = lengths.length; cut(loopRow, walk.rows); } else cut(0, Math.max(1, walk.rows));
  return { rows: Math.max(1, walk.rows), loopRow, speed: walk.speed, patternLengths: lengths, restartPosition, stop: walk.stop };
}

/**
 * The grid position (song order index, row of that pattern) the player is on at its `ticks`-th interrupt
 * (1-based), or null when the grid does not reach it (the song plays on past a capped grid).
 */
export function walkTickPosition(layout: WalkLayout, ticks: number): { songPos: number; row: number } | null {
  if (ticks < 1) return null;
  let r = Math.floor((ticks - 1) / layout.speed);
  if (r >= layout.rows) {
    if (layout.loopRow >= 0) r = layout.loopRow + ((r - layout.loopRow) % (layout.rows - layout.loopRow));
    else if (layout.stop === 'ended') r = layout.rows - 1;
    else return null;
  }
  let start = 0;
  for (let p = 0; p < layout.patternLengths.length; p++) {
    if (r < start + layout.patternLengths[p]) return { songPos: p, row: r - start };
    start += layout.patternLengths[p];
  }
  return null;
}

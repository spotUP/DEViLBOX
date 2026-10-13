/**
 * Grid follow for engines that run a format's own player (EaglePlayer, nuade): the player reports where it is - a tick
 * count, or an order and row - and the song's grid is a view a parser drew. One place turns the report into the
 * `{ songPos, row }` the tracker follows, so no engine carries its own copy of the mapping.
 */
import { tickGridPosition, type TickGrid, type GridPosition } from '@/lib/tracker/tickGridPosition';
import type { TrackerSong } from '@engine/TrackerReplayer';

/** What a position listener gets: the grid row, plus the player tick it came from (0 when the player reported rows). */
export interface GridFollowPosition extends GridPosition { ticks: number }

export type TickGridSong = Pick<TrackerSong, 'initialSpeed' | 'songPositions' | 'patterns' | 'restartPosition'>;

/** The grid geometry a player tick count maps onto: the song as loaded (speed ticks per row, patterns in order). */
export function songTickGrid(song: TickGridSong, measured?: { firstTick?: number; passTicks?: number }): TickGrid {
  return {
    // Where the parser measured it: the tick of row 0 and the pass length.
    ...measured,
    speed: song.initialSpeed || 6,
    songPositions: song.songPositions,
    patternLengths: song.patterns.map((p) => p.length),
    // The player loops its song; the grid goes round with it.
    loopFrom: song.restartPosition ?? 0,
  };
}

export class GridFollow {
  private grid: TickGrid | null = null;
  private readonly callbacks = new Set<(p: GridFollowPosition) => void>();

  setGrid(grid: TickGrid | null): void { this.grid = grid; }
  get hasGrid(): boolean { return this.grid !== null; }
  get listenerCount(): number { return this.callbacks.size; }

  onPosition(cb: (p: GridFollowPosition) => void): () => void {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  /** The player ran `ticks` ticks: the grid row they map to. No grid or no listener: nothing happens. */
  followTicks(ticks: number): void {
    if (!this.grid || this.callbacks.size === 0) return;
    const at = { ...tickGridPosition(ticks, this.grid), ticks };
    for (const cb of this.callbacks) cb(at);
  }

  /**
   * The player reported its order position and row: they are the grid's, clamped to it (a position past the grid
   * holds its last row, like tickGridPosition does).
   */
  followOrderRow(order: number, row: number): void {
    if (!this.grid || this.callbacks.size === 0) return;
    const { songPositions, patternLengths } = this.grid;
    if (songPositions.length === 0) return;
    const songPos = Math.min(Math.max(0, order), songPositions.length - 1);
    const len = Math.max(1, patternLengths[songPositions[songPos]!] ?? 64);
    const at = { songPos, row: Math.min(Math.max(0, row), len - 1), ticks: 0 };
    for (const cb of this.callbacks) cb(at);
  }
}

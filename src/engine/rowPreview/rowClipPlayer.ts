/**
 * What an engine class offers the row preview: where a grid row is in the player's terms, the mute mask a clip is
 * rendered with, and a way to sound a rendered clip through the engine's own output.
 */
import type { RowClip } from './rowClip';
import type { RowTarget } from './rowTarget';

export interface RowClipPlayer {
  /** The target of grid row (songPos, row) of `song` (its grid as it is now). */
  targetOf(song: never, songPos: number, row: number): RowTarget;
  /** Voices audible in the mix (bit N set = voice N), isolation slots already left out. */
  readonly rowClipMask: number;
  /** The arguments the row-preview player opens with, when they are more than the play arguments (UADE adds the clock its grid is named in). */
  rowLoadArgs?(song: never, args: unknown[]): unknown[];
  playRowClip(clip: RowClip): void;
}

export function isRowClipPlayer(x: unknown): x is RowClipPlayer {
  const e = x as Partial<RowClipPlayer> | null;
  return !!e && typeof e.playRowClip === 'function' && typeof e.targetOf === 'function' && typeof e.rowClipMask === 'number';
}

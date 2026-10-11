/**
 * The tracker playhead as a continuous row, the one source for every view that
 * draws a moving playhead (piano roll, step grid).
 *
 * `currentRow` in the transport store is an integer that changes once per row,
 * so a playhead drawn from it steps. The replayer's display ring knows when each
 * row starts and how long it lasts; the row plus the elapsed share of that
 * duration is a position that moves every frame, exactly as the pattern editor's
 * smooth scrolling already computes it.
 */
import * as Tone from 'tone';
import { getTrackerReplayer } from './TrackerReplayer';
import type { DisplayState } from './PlaybackCoordinator';

/** Seconds ahead of the audio clock the visuals read, as the pattern editor does. */
const LOOKAHEAD_SEC = 0.01;

/** The row of a display state plus the share of it elapsed at audioTime (0 to 1); the integer fallback row when no state is known. */
export function continuousRow(state: Pick<DisplayState, 'row' | 'time' | 'duration'> | null, audioTime: number, fallbackRow: number): number {
  if (!state) return fallbackRow;
  if (!(state.duration > 0)) return state.row;
  const progress = Math.min(Math.max((audioTime - state.time) / state.duration, 0), 1);
  return state.row + progress;
}

/**
 * The playhead row now. Peeks the ring (does not drain it) so it can run beside
 * the pattern editor, which drains it.
 */
export function playheadRowNow(fallbackRow: number): number {
  const audioTime = Tone.now() + LOOKAHEAD_SEC;
  const state = getTrackerReplayer().getStateAtTime(audioTime, true);
  return continuousRow(state, audioTime, fallbackRow);
}

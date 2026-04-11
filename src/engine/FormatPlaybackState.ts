/**
 * FormatPlaybackState — Lightweight singleton for format-engine playback position.
 *
 * Format engines (GT Ultra, etc.) that bypass the standard TrackerReplayer
 * write their playback row here. The PatternEditorCanvas RAF loop reads it
 * every frame for smooth scrolling — no React props in the hot path.
 *
 * Constant-rate scrolling: instead of recording the wall-clock time when a
 * poll detects a row change (which has jitter), we PREDICT the transition time
 * as `lastChangeTime + rowDuration`. This gives perfectly even timestamps and
 * constant-rate visual scrolling. Hard-resets only happen on seek, pattern
 * boundary, or speed change.
 */

export interface FormatPlaybackSnapshot {
  row: number;
  isPlaying: boolean;
  /** Predicted timestamp of the most recent row transition */
  rowChangeTime: number;
  /** Milliseconds per row (from explicit duration or rolling average) */
  rowDuration: number;
}

const state: FormatPlaybackSnapshot = {
  row: 0,
  isPlaying: false,
  rowChangeTime: 0,
  rowDuration: 120, // sensible default (~speed 6 at 50 Hz PAL)
};

let lastRow = -1;
// When > 0, an engine has set the duration explicitly (e.g. from driver speed)
// and the rolling average is suppressed.
let explicitDuration = 0;
// Duration of the row that just completed — saved before rowDuration is updated
// for the new row, so predictions use the correct elapsed time.
let completedRowDuration = 0;

/**
 * Called by format engines whenever the playback row changes.
 *
 * Instead of recording performance.now() (which has poll jitter), we predict
 * the transition time as `lastChangeTime + completedRowDuration`. This yields
 * perfectly even timestamps → constant-rate scrolling. We hard-reset only when
 * the prediction is unreasonable (seek, pattern boundary, speed change).
 */
export function setFormatPlaybackRow(row: number): void {
  if (row !== lastRow) {
    const now = performance.now();

    // Predict when this transition actually happened
    const dur = completedRowDuration > 0 ? completedRowDuration : state.rowDuration;
    if (state.rowChangeTime > 0 && dur > 0) {
      const predicted = state.rowChangeTime + dur;
      // Accept prediction if it's in the past and within one row-duration of now.
      // Otherwise hard-reset (seek, pattern boundary, or major desync).
      if (predicted <= now + 2 && (now - predicted) < dur) {
        state.rowChangeTime = predicted;
      } else {
        state.rowChangeTime = now;
      }

      // Rolling-average duration for engines that don't set explicit duration
      // (e.g. GT Ultra). Uses the predicted-corrected timestamp for accuracy.
      if (explicitDuration <= 0) {
        const dt = now - (state.rowChangeTime - dur); // time since previous predicted transition
        if (dt > 5 && dt < 2000) {
          state.rowDuration = state.rowDuration * 0.85 + dt * 0.15;
        }
      }
    } else {
      // First row change — no history to predict from
      state.rowChangeTime = now;
    }

    // Save current rowDuration as "completed" for the next prediction.
    // This is the duration of the row that is NOW starting — when it ends,
    // we'll use this value to predict when the next transition happened.
    completedRowDuration = state.rowDuration;

    lastRow = row;
    state.row = row;
  }
}

/**
 * Set an explicit row duration in ms (overrides the rolling average).
 * Use when the engine knows the exact speed (e.g. SF2 driver speed * 20ms).
 * Pass 0 to revert to measurement-based estimation.
 */
export function setFormatPlaybackRowDuration(ms: number): void {
  explicitDuration = ms;
  if (ms > 0) {
    state.rowDuration = ms;
  }
}

export function setFormatPlaybackPlaying(playing: boolean): void {
  state.isPlaying = playing;
  if (!playing) {
    lastRow = -1;
    explicitDuration = 0;
    completedRowDuration = 0;
  }
}

/** Read by the PatternEditorCanvas RAF loop every frame. Zero allocation. */
export function getFormatPlaybackState(): Readonly<FormatPlaybackSnapshot> {
  return state;
}

export function resetFormatPlaybackState(): void {
  state.row = 0;
  state.isPlaying = false;
  state.rowChangeTime = 0;
  state.rowDuration = 120;
  lastRow = -1;
  explicitDuration = 0;
  completedRowDuration = 0;
}

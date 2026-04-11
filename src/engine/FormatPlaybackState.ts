/**
 * FormatPlaybackState — Lightweight singleton for format-engine playback position.
 *
 * Format engines (GT Ultra, etc.) that bypass the standard TrackerReplayer
 * write their playback row here. The PatternEditorCanvas RAF loop reads it
 * every frame for smooth scrolling — no React props in the hot path.
 *
 * Smooth interpolation: tracks when the row last changed and estimates
 * row duration from recent history, allowing sub-pixel scroll offset
 * computation identical to the normal mode's replayer-based approach.
 */

export interface FormatPlaybackSnapshot {
  row: number;
  isPlaying: boolean;
  /** performance.now() timestamp when the row last changed */
  rowChangeTime: number;
  /** Estimated milliseconds per row (rolling average) */
  rowDuration: number;
}

const state: FormatPlaybackSnapshot = {
  row: 0,
  isPlaying: false,
  rowChangeTime: 0,
  rowDuration: 120, // sensible default (~speed 6 at 50 Hz PAL)
};

let lastRow = -1;
let lastRowTime = 0;
// When > 0, an engine has set the duration explicitly (e.g. from driver speed)
// and the rolling average is suppressed.
let explicitDuration = 0;

/**
 * Called by format engines (e.g. GT Ultra onPosition callback) whenever
 * the playback row changes. High-frequency calls are fine — only actual
 * row changes trigger timestamp updates.
 */
export function setFormatPlaybackRow(row: number): void {
  if (row !== lastRow) {
    const now = performance.now();
    // Only estimate rowDuration from timing if no explicit duration is set
    if (explicitDuration <= 0 && lastRow >= 0 && lastRowTime > 0) {
      const dt = now - lastRowTime;
      // Rolling average: blend new measurement with existing estimate.
      // High smoothing factor (0.85) dampens jitter from rAF polling —
      // engines that poll memory (SF2) have ±16ms noise per sample.
      if (dt > 5 && dt < 2000) {
        state.rowDuration = state.rowDuration * 0.85 + dt * 0.15;
      }
    }
    lastRow = row;
    lastRowTime = now;
    state.row = row;
    state.rowChangeTime = now;
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
    lastRowTime = 0;
    explicitDuration = 0;
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
  lastRowTime = 0;
  explicitDuration = 0;
}

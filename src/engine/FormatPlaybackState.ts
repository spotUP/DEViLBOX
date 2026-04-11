/**
 * FormatPlaybackState — Lightweight singleton for format-engine playback position.
 *
 * Format engines (GT Ultra, SF2, etc.) that bypass the standard TrackerReplayer
 * write their playback row here. The PatternEditorCanvas RAF loop reads it
 * every frame for smooth scrolling — no React props in the hot path.
 *
 * Constant-rate scrolling via free-running clock:
 * A clock anchored at the first row change advances at exactly rowDuration ms
 * per row. The canvas calls getClockPosition(now) every frame for perfectly
 * constant-rate visual scrolling. Engine polls cross-check and re-anchor on
 * pattern boundaries, seeks, or speed changes.
 */

export interface FormatPlaybackSnapshot {
  /** Latest polled row (from engine) */
  row: number;
  isPlaying: boolean;
  /** Timestamp of last polled row change (for backward compat) */
  rowChangeTime: number;
  /** Milliseconds per row (from explicit duration or rolling average) */
  rowDuration: number;
}

const state: FormatPlaybackSnapshot = {
  row: 0,
  isPlaying: false,
  rowChangeTime: 0,
  rowDuration: 120,
};

let lastRow = -1;
let explicitDuration = 0;

// Free-running clock for constant-rate display
let clockAnchorTime = 0;
let clockAnchorRow = 0;
let clockDuration = 120;  // ms per row for the clock

/**
 * Get clock-predicted position at the given time. Returns { row, progress }
 * where row is the integer row number and progress is 0.0-1.0 sub-row.
 * Advances at a perfectly constant rate of one row per clockDuration ms.
 */
export function getClockPosition(now: number): { row: number; progress: number } {
  if (!state.isPlaying || clockAnchorTime <= 0 || clockDuration <= 0) {
    return { row: state.row, progress: 0 };
  }
  const elapsed = now - clockAnchorTime;
  if (elapsed < 0) return { row: clockAnchorRow, progress: 0 };
  const totalRows = elapsed / clockDuration;
  return {
    row: clockAnchorRow + Math.floor(totalRows),
    progress: totalRows - Math.floor(totalRows),
  };
}

/**
 * Called by format engines whenever the playback row changes.
 * Anchors the clock on first call; re-anchors on pattern boundaries or seeks.
 */
export function setFormatPlaybackRow(row: number): void {
  if (row === lastRow) return;
  const now = performance.now();

  if (clockAnchorTime <= 0) {
    // First row — start the clock
    clockAnchorTime = now;
    clockAnchorRow = row;
    console.log(`[FPS] Clock started: anchor row=${row}`);
  } else {
    const { row: clockRow } = getClockPosition(now);
    // Re-anchor on pattern boundary (row wrapped backwards) or major drift (>1 row)
    if (row < lastRow || Math.abs(row - clockRow) > 1) {
      console.log(`[FPS] Re-anchor: actual=${row} clock=${clockRow} lastRow=${lastRow} drift=${row - clockRow}`);
      clockAnchorTime = now;
      clockAnchorRow = row;
    }
    // Small drift (±1 row): clock self-corrects, don't re-anchor
  }

  // Rolling-average duration for engines without explicit duration (GT Ultra)
  if (explicitDuration <= 0 && state.rowChangeTime > 0) {
    const dt = now - state.rowChangeTime;
    if (dt > 5 && dt < 2000) {
      state.rowDuration = state.rowDuration * 0.85 + dt * 0.15;
      // Also update clock duration to track actual speed
      if (clockDuration !== state.rowDuration) {
        clockDuration = state.rowDuration;
      }
    }
  }

  lastRow = row;
  state.row = row;
  state.rowChangeTime = now;
}

/**
 * Set an explicit row duration in ms (overrides the rolling average).
 * Re-anchors the clock at the current position so the new speed takes effect
 * immediately without a visual jump.
 */
export function setFormatPlaybackRowDuration(ms: number): void {
  explicitDuration = ms;
  if (ms > 0 && ms !== clockDuration) {
    // Speed changed — re-anchor clock at current position
    const now = performance.now();
    if (clockAnchorTime > 0) {
      const { row: clockRow, progress } = getClockPosition(now);
      clockAnchorRow = clockRow;
      // Anchor slightly in the past to preserve current sub-row progress
      clockAnchorTime = now - progress * ms;
    }
    clockDuration = ms;
    state.rowDuration = ms;
  } else if (ms > 0) {
    state.rowDuration = ms;
  }
}

export function setFormatPlaybackPlaying(playing: boolean): void {
  state.isPlaying = playing;
  if (!playing) {
    lastRow = -1;
    explicitDuration = 0;
    clockAnchorTime = 0;
    clockAnchorRow = 0;
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
  clockAnchorTime = 0;
  clockAnchorRow = 0;
  clockDuration = 120;
}

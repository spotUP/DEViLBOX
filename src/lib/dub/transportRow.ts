/**
 * Where the song actually is, in rows, for the performer's clock.
 *
 * Two transport fields carry the position and neither is sufficient alone:
 *
 *   `currentGlobalRow` — absolute, but only WRITTEN when the pattern or song
 *     position changes (`usePatternPlayback`, deliberately: per-row store
 *     writes were avoided because the editor's RAF loop reads position
 *     directly). It therefore advances a whole pattern at a time.
 *   `currentRow` — updated per row, but relative to the current pattern, so it
 *     wraps back to 0 every pattern and cannot say which pattern it is in.
 *
 * Reading the global row alone made AutoDub's bar clock jump 64 rows per
 * update. At speed 12 a bar is 8 rows, so the bar number leapt by 8 and the
 * performer got ONE decision per pattern — every per-bar rule it has
 * (`minBarsBetweenFires`, the per-bar fire caps, the phrase arc) ran eight
 * times too slowly, and it looked idle, moving only when its own
 * "nothing has happened for ages" trigger fired. Measured 2026-09-19 on
 * "world class dub": every decision at `barPos: 0`, on bars 8, 16, 40, 48, 56,
 * 72, 80, 88.
 *
 * Coarse from one, fine from the other.
 */

/**
 * Rows per pattern, as `usePatternPlayback` counts them when it writes
 * `currentGlobalRow` (`position * 64 + row`). The same constant on both sides,
 * so the two cannot disagree about where a pattern starts.
 */
export const ROWS_PER_PATTERN = 64;

/**
 * Combine the pattern-granular absolute row with the row-granular local one.
 *
 * Returns null when neither field carries usable information — before playback
 * has produced a position, the caller falls back to a wall clock.
 */
export function resolveTransportRow(
  currentGlobalRow: number | undefined,
  currentRow: number | undefined,
): number | null {
  const hasGlobal = typeof currentGlobalRow === 'number'
    && Number.isFinite(currentGlobalRow) && currentGlobalRow > 0;
  const hasRow = typeof currentRow === 'number'
    && Number.isFinite(currentRow) && currentRow >= 0;

  // Anchor to the pattern the absolute row is in, then add the live row within
  // it. `currentRow` is what actually moves between pattern changes.
  if (hasRow) {
    const base = hasGlobal
      ? Math.floor(currentGlobalRow / ROWS_PER_PATTERN) * ROWS_PER_PATTERN
      : 0;
    return base + currentRow;
  }
  return hasGlobal ? currentGlobalRow : null;
}

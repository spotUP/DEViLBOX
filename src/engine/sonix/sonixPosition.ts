/**
 * sonixPosition.ts — map the Sonix driver's global playback counter to the
 * editor's (songPos, patternRow) coordinates.
 *
 * The WASM engine (`sonix_get_display_row`) reports a single monotonic counter,
 * wrapped to 0 on song loop. Its UNIT differs by sub-format: SMUS/TINY advance it
 * once per grid row (note-step / beat), but SNX advances it once per CIA tick — and
 * an SNX display row spans `SNX_TICKS_PER_ROW` ticks (see below). The caller passes
 * the per-format `ticksPerRow` so this maps the native counter to a display row, then
 * splits that flat row stream into fixed 64-row patterns (one song position per
 * pattern: SonixMusicDriverParser.ts `numPatterns = ceil(totalRows/64)`).
 */

/** Rows per Sonix editor pattern — mirrors SonixMusicDriverParser's 64-row split. */
export const SONIX_PATTERN_ROWS = 64;

/**
 * CIA ticks per SNX display row. The SNX driver clock ticks ~49 Hz; showing one grid
 * row per tick scrolls ~49 rows/s — unreadably fast. Amiga trackers never do this: a
 * display row spans `speed` ticks (default 6), so the cursor advances at a musical
 * ~8 rows/s. The SNX parser builds its grid at this granularity and the encoder is its
 * inverse; the native tick counter maps to a row via `floor(tick / SNX_TICKS_PER_ROW)`.
 * Single source of truth — keep the parser, encoder and this map in lock-step.
 */
export const SNX_TICKS_PER_ROW = 6;

export interface SonixDisplayPosition {
  /** Row within the active pattern (0..SONIX_PATTERN_ROWS-1). */
  row: number;
  /** Song position = pattern index in the songPositions array. */
  songPos: number;
}

/**
 * Convert the driver's native playback counter into the editor's per-pattern
 * (row, songPos). `ticksPerRow` is the native-counter → display-row divisor for the
 * sub-format (SNX = SNX_TICKS_PER_ROW; SMUS/TINY = 1, counter already in rows).
 */
export function sonixGlobalRowToPosition(
  nativeCounter: number,
  ticksPerRow = 1,
): SonixDisplayPosition {
  const raw = Number.isFinite(nativeCounter) && nativeCounter > 0 ? Math.floor(nativeCounter) : 0;
  const g = ticksPerRow > 1 ? Math.floor(raw / ticksPerRow) : raw;
  return {
    row: g % SONIX_PATTERN_ROWS,
    songPos: Math.floor(g / SONIX_PATTERN_ROWS),
  };
}

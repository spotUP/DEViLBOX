/**
 * Which pattern the grid shows while a WASM engine drives the play head.
 *
 * The row and the pattern must come from the SAME clock. They did not: the
 * canvas took the row from `wasmPos.row` unconditionally, but only took the
 * pattern from `wasmPos.songPos` when that passed a bounds check. On the
 * frames where it failed, the pattern fell back to the tracker store's index
 * while the row kept advancing on the engine's clock — so the grid alternated
 * between two different patterns, frame to frame.
 *
 * Measured on Sonix (`sonix-smus/ACE II/ACE II.smus`, 2026-09-24):
 * `currentRow` advancing 17 -> 54, `currentGlobalRow` frozen at 1408, and
 * `currentPattern` pinned at 0. Reported as "sonix pattern scroll flickers
 * between data".
 *
 * Holding the last pattern the engine resolved to is the honest answer: a
 * frame with no usable position tells us nothing new, so nothing should
 * change. Switching clocks mid-frame invents a pattern the engine never
 * played.
 */
export interface WasmPatternInput {
  /** `songPos` as reported by the engine; may be undefined or out of range. */
  songPos: number | undefined;
  /** The song's pattern order, which `songPos` indexes into. */
  patternOrder: readonly number[];
  /** The pattern this engine last resolved to, or null if it has not yet. */
  held: number | null;
  /** What the grid would show if no engine were driving it. */
  fallback: number;
}

export interface WasmPatternResult {
  /** The pattern index to draw. */
  pattern: number;
  /** The new held value, to carry into the next frame. */
  held: number | null;
  /** The song position, when this frame produced a usable one. */
  songPosition: number | undefined;
}

/**
 * Resolve the pattern for one frame of WASM-driven playback.
 *
 * A usable `songPos` both selects the pattern and becomes the new held value.
 * An unusable one keeps whatever the engine last resolved to, and only when
 * the engine has never resolved anything does the caller's fallback apply.
 */
export function resolveWasmPattern(input: WasmPatternInput): WasmPatternResult {
  const { songPos, patternOrder, held, fallback } = input;

  if (songPos !== undefined && songPos >= 0 && songPos < patternOrder.length) {
    const pattern = patternOrder[songPos] ?? songPos;
    return { pattern, held: pattern, songPosition: songPos };
  }

  if (held !== null) {
    return { pattern: held, held, songPosition: undefined };
  }

  return { pattern: fallback, held: null, songPosition: undefined };
}

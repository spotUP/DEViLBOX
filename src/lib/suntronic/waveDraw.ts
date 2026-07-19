/**
 * Click-and-drag draw helper for SunTronic signed-byte tables (wave1/wave2,
 * volEnv, vibDepth). Mirrors the JamCracker AM waveform editor
 * (`@/lib/jamcracker/waveformDraw`) but writes a plain signed `number[]`
 * (-128..127) rather than a two's-complement `Uint8Array`, because that is the
 * serializable shape SunTronicConfig persists.
 *
 * Pure + caller-owned: the input table is never mutated; a fresh array is
 * returned so React detects the change. Fast drags interpolate the gap between
 * the previous and current index so a quick sweep fills every cell it crosses.
 */

export interface WriteSignedByteResult {
  next: number[];
  idx: number;
}

/**
 * Write one signed sample (plus any interpolated infill) into a copy of a
 * signed-byte table from a local pointer position.
 *
 * @param table   Current table (caller-owned, not mutated).
 * @param localX  Pointer X relative to the display, 0..width.
 * @param localY  Pointer Y relative to the display, 0..height.
 * @param width   Display width in pixels.
 * @param height  Display height in pixels.
 * @param prevIdx Index of the last write in this drag, or -1.
 */
export function writeSignedByte(
  table: number[],
  localX: number,
  localY: number,
  width: number,
  height: number,
  prevIdx: number,
): WriteSignedByteResult {
  const size = Math.max(1, table.length);
  const x = Math.max(0, Math.min(width, localX));
  const y = Math.max(0, Math.min(height, localY));
  const idx = Math.min(size - 1, Math.floor((x / width) * size));
  const mid = height / 2;
  // Top of the canvas is +127, bottom is -128 (signed 8-bit range).
  const signed = Math.round(((mid - y) / (mid - 4)) * 127);
  const value = Math.max(-128, Math.min(127, signed));

  const next = table.slice();
  if (prevIdx >= 0 && Math.abs(idx - prevIdx) > 1) {
    const prevVal = next[prevIdx] ?? value;
    const lo = Math.min(prevIdx, idx);
    const hi = Math.max(prevIdx, idx);
    for (let i = lo; i <= hi; i++) {
      const t = (i - lo) / (hi - lo);
      next[i] = idx > prevIdx
        ? Math.round(prevVal + (value - prevVal) * t)
        : Math.round(value + (prevVal - value) * t);
    }
  } else {
    next[idx] = value;
  }
  return { next, idx };
}

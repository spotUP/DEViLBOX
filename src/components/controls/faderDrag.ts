/**
 * Where a fader lands after a drag: its value when the hand went down, moved
 * by how far the hand travelled. `upPx` is positive for an upward drag; a full
 * track's travel (`trackPx`) covers the whole range. Clamped to the range.
 */
export function faderDragValue(startValue: number, upPx: number, trackPx: number, min: number, max: number): number {
  const v = startValue + (upPx / Math.max(1, trackPx)) * (max - min);
  return Math.max(min, Math.min(max, v));
}

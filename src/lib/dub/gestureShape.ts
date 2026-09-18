/**
 * The shape a held gesture traces while it is held.
 *
 * `hold` and `rebound` need nothing here: they describe a move that is on,
 * then off. `ramp` and `sweep` describe a parameter MOVING under the player's
 * hand — the filter knob being turned down across a bar, or turned down and
 * back. That is a value over time, and this is the value.
 *
 * Kept pure and separate from the engine for the reason Gate F4 was left open
 * rather than faked: the shape is a property of the GESTURE (how the player
 * moved), while what the value does to the sound belongs to the MOVE. Putting
 * the curve inside each move would mean every move reimplements it, and a hold
 * extended mid-gesture would not extend the sweep with it.
 *
 * Frequencies get `exponential` by default at the call site, not here: a
 * linear ramp from 20 kHz to 200 Hz spends most of its travel in the top
 * octave, where the ear hears almost nothing happening, and then falls off a
 * cliff. Level-like parameters are linear.
 */

export type AutomatedShape = 'ramp' | 'sweep';
export type ShapeCurve = 'linear' | 'exponential';

/** How often the engine pushes a new value. 40 Hz — a knob, not an LFO. */
export const SHAPE_TICK_MS = 25;

/**
 * Position along the shape at `progress` (0 = gesture start, 1 = hold end),
 * as a normalized 0..1 with no units.
 *
 *   ramp   0 -> 1          travels once, stays at the far end
 *   sweep  0 -> 1 -> 0     travels and comes back, ending where it started
 */
export function shapePosition(shape: AutomatedShape, progress: number): number {
  const t = clamp01(progress);
  if (shape === 'ramp') return t;
  // Sweep turns at the halfway point. Triangular rather than sinusoidal: a
  // hand on a knob moves at a roughly even rate and stops at the turn, which
  // is what a triangle is; a sine eases into the extreme and lingers there.
  return t <= 0.5 ? t * 2 : (1 - t) * 2;
}

/**
 * The value to hand the move: `from` at position 0, `to` at position 1.
 *
 * `exponential` interpolates in log space, so equal steps of progress are
 * equal musical intervals. It needs both ends positive; a zero or negative
 * end falls back to linear rather than producing NaN, because a silent bug in
 * a live gesture is worse than a slightly wrong curve.
 */
export function shapeValue(
  shape: AutomatedShape,
  progress: number,
  from: number,
  to: number,
  curve: ShapeCurve = 'linear',
): number {
  const p = shapePosition(shape, progress);
  if (curve === 'exponential' && from > 0 && to > 0) {
    return from * Math.pow(to / from, p);
  }
  return from + (to - from) * p;
}

/**
 * Where a gesture is along its hold.
 *
 * A hold whose length is not known yet — a finger still down — has no
 * progress, and is reported as such rather than as 0 or 1. The engine refuses
 * to automate those instead of inventing a duration.
 */
export function shapeProgress(elapsedMs: number, durationMs: number): number | null {
  if (!(durationMs > 0)) return null;
  return clamp01(elapsedMs / durationMs);
}

/**
 * Progress when a gesture is extended or shortened mid-travel.
 *
 * A hold made longer must not send the value backwards. The shape keeps the
 * position it has reached and spreads the REMAINING travel over the remaining
 * time: the sweep slows down, it does not restart. Reported as the thing to
 * avoid when this was designed — a filter that jumps back open the moment the
 * player decides to hold a bar longer is a glitch, not a gesture.
 *
 * `from` is where the shape had got to; the result still reaches 1 exactly at
 * the new end.
 */
export function shapeProgressFrom(
  from: number,
  elapsedSinceAnchorMs: number,
  remainingMs: number,
): number | null {
  const anchor = clamp01(from);
  if (!(remainingMs > 0)) return null;
  const travelled = clamp01(elapsedSinceAnchorMs / remainingMs);
  return clamp01(anchor + (1 - anchor) * travelled);
}

function clamp01(v: number): number {
  // NaN reads as the start; an infinity is an overdue tick and reads as the
  // end. Lumping them together would snap a finished gesture back to where it
  // began, which is the one wrong answer of the three.
  if (Number.isNaN(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

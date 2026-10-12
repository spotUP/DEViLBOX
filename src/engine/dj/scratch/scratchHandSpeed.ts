/**
 * Plan velocity as HAND SPEED (owner decision 2026-10-12, audit SA-m5).
 *
 * A planned scratch's `velocity` (0..1, the planner's stroke energy; plans run about 0.55 to 1.0) scales how fast the
 * hand moves: every rate of the stroke is multiplied by `handSpeedFactor(velocity)`, so a hard
 * stroke is faster and sharper and a soft one lazier. The stroke's TIMING and the fader windows
 * are untouched (they come from the gesture's cycle), so loudness stays on the fader: velocity
 * never changes the fader depth.
 *
 * One mapping, consumed by the record voice (`ScratchRecordVoice.playGesture`) and the deck
 * pattern player (`DJScratchEngine` via `PatternStart.speed`).
 */

export const HAND_SPEED = {
  /** Velocity at which the hand plays the gesture exactly as tuned (the planner's usual stroke). */
  referenceVelocity: 0.78,
  /** Factor change per unit of velocity above or below the reference. */
  slope: 1.0,
  /** Slowest and fastest hand, as multiples of the tuned stroke. */
  min: 0.7,
  max: 1.3,
} as const;

/** Rate multiplier for a plan velocity; undefined or non-finite (an unplanned, pressed gesture) is 1. */
export function handSpeedFactor(velocity: number | undefined): number {
  if (velocity === undefined || !Number.isFinite(velocity)) return 1;
  const v = Math.max(0, Math.min(1, velocity));
  const f = 1 + (v - HAND_SPEED.referenceVelocity) * HAND_SPEED.slope;
  return Math.max(HAND_SPEED.min, Math.min(HAND_SPEED.max, f));
}

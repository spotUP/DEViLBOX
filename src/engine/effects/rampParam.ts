/**
 * Smooth an AudioParam to a new value instead of stepping it.
 *
 * A bare `param.value = x` while audio is flowing is a discontinuity in the
 * signal: one sample at the old value, the next at the new one. Dragged from a
 * slider it becomes zipper noise — reported 2026-09-21 as crackle while moving
 * the dub controls, which is disqualifying on a surface played live.
 *
 * Cancel first, then pin the current value, then ramp. Without the cancel a new
 * ramp collides with whatever a move already scheduled on that param and jumps;
 * without the pin the ramp starts from the last SCHEDULED value rather than the
 * one actually sounding.
 *
 * `DubBus` already has `rampBiquadParam` for filter params and uses it
 * throughout. This is the same idea for plain gains, living next to the effects
 * so the echo adapters can share one implementation instead of four.
 */

/** Long enough to remove the step, short enough to feel immediate. */
export const PARAM_RAMP_SEC = 0.012;

/**
 * Native `AudioParam` and Tone's `Param` both, since the echo adapters mix the
 * two and a helper that only took one would have to be written twice.
 */
export interface RampableParam {
  value: number;
  cancelScheduledValues(time: number): unknown;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
}

export function rampParam(
  param: RampableParam,
  target: number,
  now: number,
  rampSec: number = PARAM_RAMP_SEC,
): void {
  try {
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(target, now + rampSec);
  } catch {
    // A detached or already-disposed param must never break a control gesture.
    try { param.value = target; } catch { /* nothing left to do */ }
  }
}

/**
 * Crossfade a dry/wet pair in one call.
 *
 * Both gains move together over the same window; moving one and stepping the
 * other is a level jump even when each looks correct on its own.
 */
export function rampDryWet(
  dryGain: RampableParam,
  wetGain: RampableParam,
  wet: number,
  now: number,
  rampSec: number = PARAM_RAMP_SEC,
  /** The effect's wet-path level calibration (effectGainCompensation WET_PATH_GAIN_DB). */
  wetScale = 1,
): void {
  rampParam(dryGain, 1 - wet, now, rampSec);
  rampParam(wetGain, wet * wetScale, now, rampSec);
}

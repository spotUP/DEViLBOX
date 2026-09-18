/**
 * How much external feedback is safe, given what the loop does to the signal.
 *
 * X3: `extFeedbackEqGain` is a peaking boost INSIDE the external feedback loop
 * — Messian Dread's technique of returning the wet output through a mixer
 * channel so every repeat gets EQ and fader. The fader was clamped to 0.85 and
 * the EQ was not counted, so at the EQ's centre frequency the real loop gain
 * was 0.85 x the boost: +1 dB gives 0.954, +3 dB gives 1.20 — over unity, and
 * a howl in a narrow band while the fader still reads "safe".
 *
 * Mirroring the EQ the way `extFeedbackShelfComp` mirrors the bass shelf would
 * be wrong here. That mirror exists because the shelf is applied on the
 * FORWARD path and the loop would apply it a second time; this EQ is the
 * loop's own deliberate colour, and cancelling it would delete the feature.
 * What is missing is not a mirror but a BUDGET: the boost has to come out of
 * the headroom the fader is allowed, not be added on top of it.
 *
 * Only boosts count. A cut makes the loop quieter, and letting a cut BUY extra
 * fader would hand back the headroom at every other frequency.
 */

/** Hard ceiling on the loop's worst-case gain. Below 1, with margin. */
export const EXT_FEEDBACK_MAX_LOOP_GAIN = 0.85;

/** Convert decibels to a linear amplitude ratio. */
export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * The most external feedback the fader may apply, given an EQ boost of
 * `eqGainDb` somewhere in the loop.
 *
 * At the EQ's centre frequency the round trip multiplies by
 * `fader x boost`, so the fader's own ceiling has to shrink by the boost for
 * that product to stay at the limit.
 */
export function extFeedbackCeiling(eqGainDb: number): number {
  const boostDb = Math.max(0, Number.isFinite(eqGainDb) ? eqGainDb : 0);
  return EXT_FEEDBACK_MAX_LOOP_GAIN / dbToGain(boostDb);
}

/** Clamp a requested external feedback amount to what the loop can carry. */
export function clampExtFeedback(requested: number, eqGainDb: number): number {
  const safe = extFeedbackCeiling(eqGainDb);
  if (!Number.isFinite(requested) || requested < 0) return 0;
  return Math.min(safe, requested);
}

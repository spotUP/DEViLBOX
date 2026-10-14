/**
 * The tempo a scratch routine plays at over the set (SCRATCH-FADER-TRAVEL fail #2, owner 2026-10-14: "the whole
 * routine runs too fast"). The demo writes every gesture in 16th steps (scratch.py:192 `_GESTURE_STEPS`, "scales to
 * tempo") and renders its routines at hip-hop tempo: three_deck's `bpm` defaults to 92 (three_deck.py:629),
 * scratch.py's macros to 92 (scratch.py:915), and the hip-hop manual's boom-bap default is 92 BPM inside a 65-115 BPM
 * family (plans/softsynth/complete-hip-hop-expansion-manual-for-the-amiga.md:1406-1548, :2383). The demo has no
 * tempo fold: it never meets a 176 BPM set. Over one, its 16ths would run 1.9x faster than written - a transformer's
 * four cuts in two steps 23.5 cuts/s, past a hand's ~10-15 Hz - so the routine plays half-time against the set the
 * way a turntablist does: one routine 16th = two of the set's, still on the set's beat grid.
 */

/** The demo's routine tempo (three_deck.py:629, scratch.py:915). */
export const SCRATCH_HOME_BPM = 92;

/**
 * The top of the hip-hop tempo family the routines are written for (hip-hop manual :1406, 90-115 BPM; its other
 * profiles 65-105). It is also where the routine's fastest fader gestures reach a hand's limit: a transformer cuts
 * bpm / 7.5 times a second (four cuts in two 16ths), 15 at 112.5 BPM; the demo's own crab is 15.3 at 92.
 */
export const SCRATCH_MAX_ROUTINE_BPM = 115;

/**
 * The set's beats per routine beat at `bpm`: the power of two that brings the routine's tempo into
 * (57.5, 115] BPM - half-time over a 116-230 BPM set, double-time under 57.5 - so it plays in the hip-hop range
 * at a hand's speed while every stroke stays on the set's beat grid.
 */
export function scratchTempoFold(bpm: number): number {
  if (!(bpm > 0) || !Number.isFinite(bpm)) return 1;
  const k = Math.ceil(Math.log2(bpm / SCRATCH_MAX_ROUTINE_BPM) - 1e-9);
  return 2 ** Math.max(-2, Math.min(2, k));
}

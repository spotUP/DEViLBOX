/**
 * Feedback-loop unity guard.
 *
 * The dub bus feeds echo output back into its own input:
 *
 *   echo.output → feedback → scrubber → feedbackShelfComp
 *               → feedbackResonanceComp → input
 *               → hpf ×3 → hpfResonance → bassShelf → … → echo
 *
 * Every stage inside that ring multiplies on EVERY pass. A stage that adds
 * gain without a matching cut somewhere in the ring pushes the round trip
 * over unity and the loop grows without bound at that stage's frequency.
 *
 * Two boosting stages sit in the ring, and each needs a mirror:
 *
 *   bassShelf      (lowshelf, bassShelfGainDb)   ↔ feedbackShelfComp
 *   hpfResonance   (peaking Q2, hpfResonanceDb)  ↔ feedbackResonanceComp
 *
 * The second mirror did not exist until 2026-09-17. At the Tubby preset's
 * hpfResonanceDb of 2.5 the ring gained ×1.33 per pass; a throw pushes echo
 * feedback toward 0.95, and 0.95 × 1.33 = 1.26 — over unity, in the bass,
 * because the Altec hump tracks a low HPF cutoff. That is a slow bass crawl
 * that survives the send being closed.
 *
 * `dubPanic` additionally used to ZERO feedbackShelfComp — removing a
 * protective cut rather than a boost. setSettings restores it but
 * short-circuits on an equality check, and moving a channel fader changes no
 * DubBusSetting, so the compensation stayed at 0 and the panic button armed
 * the next runaway.
 *
 * These tests model the ring arithmetically. They cannot construct a DubBus
 * (it needs a live AudioContext), so they assert the invariant every future
 * in-loop stage must satisfy: with all mirrors matched, peak round-trip gain
 * stays below 1 even at maximum feedback.
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_DUB_BUS, DUB_CHARACTER_PRESETS } from '@/types/dub';

const dbToLinear = (db: number): number => Math.pow(10, db / 20);

/** Maximum echo feedback the bus will ever run at — `modulateFeedback` clamps here. */
const MAX_FEEDBACK = 0.95;

/**
 * Peak round-trip gain of the feedback ring at the worst-case frequency,
 * given each boosting stage and its mirror. `null` mirrors model the
 * pre-fix state where a stage had no compensation at all.
 */
function roundTripGain(opts: {
  feedback: number;
  bassShelfDb: number;
  bassShelfMirrorDb: number | null;
  resonanceDb: number;
  resonanceMirrorDb: number | null;
}): number {
  const shelf = dbToLinear(opts.bassShelfDb + (opts.bassShelfMirrorDb ?? 0));
  const resonance = dbToLinear(opts.resonanceDb + (opts.resonanceMirrorDb ?? 0));
  return opts.feedback * shelf * resonance;
}

describe('feedback ring stays below unity', () => {
  it('is stable at defaults with both mirrors matched', () => {
    const g = roundTripGain({
      feedback: MAX_FEEDBACK,
      bassShelfDb: DEFAULT_DUB_BUS.bassShelfGainDb,
      bassShelfMirrorDb: -DEFAULT_DUB_BUS.bassShelfGainDb,
      resonanceDb: DEFAULT_DUB_BUS.hpfResonanceDb,
      resonanceMirrorDb: -DEFAULT_DUB_BUS.hpfResonanceDb,
    });
    expect(g).toBeLessThan(1);
  });

  it('is stable for every character preset with both mirrors matched', () => {
    for (const [name, preset] of Object.entries(DUB_CHARACTER_PRESETS)) {
      const bass = preset.overrides.bassShelfGainDb ?? DEFAULT_DUB_BUS.bassShelfGainDb;
      const res = preset.overrides.hpfResonanceDb ?? DEFAULT_DUB_BUS.hpfResonanceDb;
      const g = roundTripGain({
        feedback: MAX_FEEDBACK,
        bassShelfDb: bass,
        bassShelfMirrorDb: -bass,
        resonanceDb: res,
        resonanceMirrorDb: -res,
      });
      expect(g, `${name} round-trip gain`).toBeLessThan(1);
    }
  });

  it('goes over unity when the resonance mirror is missing (the 2026-09-17 bug)', () => {
    // Tubby: hpfResonanceDb 2.5, uncompensated, at a throw's feedback boost.
    const tubbyRes = DUB_CHARACTER_PRESETS.tubby.overrides.hpfResonanceDb ?? 0;
    expect(tubbyRes).toBeGreaterThan(0);
    const g = roundTripGain({
      feedback: MAX_FEEDBACK,
      bassShelfDb: DUB_CHARACTER_PRESETS.tubby.overrides.bassShelfGainDb ?? 0,
      bassShelfMirrorDb: -(DUB_CHARACTER_PRESETS.tubby.overrides.bassShelfGainDb ?? 0),
      resonanceDb: tubbyRes,
      resonanceMirrorDb: null,
    });
    expect(g).toBeGreaterThan(1);
  });

  it('goes over unity when panic zeroes the bass mirror (the panic trap)', () => {
    // Zeroing a protective CUT leaves bassShelf boosting uncancelled.
    const g = roundTripGain({
      feedback: MAX_FEEDBACK,
      bassShelfDb: DUB_CHARACTER_PRESETS.tubby.overrides.bassShelfGainDb ?? 0,
      bassShelfMirrorDb: 0,
      resonanceDb: 0,
      resonanceMirrorDb: 0,
    });
    expect(g).toBeGreaterThan(1);
  });

  it('every preset that dials in a resonance hump keeps it within mirror range', () => {
    // feedbackResonanceComp clamps its cut to 12 dB; a preset asking for more
    // could not be fully cancelled and would creep.
    for (const [name, preset] of Object.entries(DUB_CHARACTER_PRESETS)) {
      const res = preset.overrides.hpfResonanceDb ?? DEFAULT_DUB_BUS.hpfResonanceDb;
      expect(res, `${name} hpfResonanceDb`).toBeLessThanOrEqual(12);
      expect(res, `${name} hpfResonanceDb`).toBeGreaterThanOrEqual(0);
    }
  });
});

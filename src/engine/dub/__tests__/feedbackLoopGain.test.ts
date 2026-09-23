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
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_DUB_BUS, DUB_CHARACTER_PRESETS } from '@/types/dub';

const DUBBUS_SRC = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../DubBus.ts'),
  'utf8',
);

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

// ── External feedback loop contents ─────────────────────────────────────────
// Confirmed live on 2026-09-17: setting extFeedbackGain to 0 mid-rumble
// stopped it. The loop was tapped at `return_`, which placed the dattorro
// plate (documented "infinite" tail), the ring mod, the lo-fi stage and the
// user's return fader inside it. An unbounded tail inside a feedback path is
// unbounded by construction; the fader being in there is why the rumble could
// also be triggered from the master.
//
// Perry is the only preset with extFeedbackGain above zero, which is why it
// only ever appeared on Perry.
//
// Moving the tap to `stereoMerge` was not enough. Reported 2026-09-23 as
// "audio with a tail that never silences" after a song load, with sends
// closed: busInput 0.012, busReturn 0.65 flat for 12 s at extFeedbackGain
// 0.035; zeroing the gain let it decay in 4 s, restoring it brought it back.
// The glue compressor was still in the loop, and a compressor's make-up gain
// grows as the signal shrinks — so the loop gain rose to meet unity exactly
// where the tail should have died. The loop now closes at the echo's own
// output, where every stage is a constant or bounded by its own feedback.
describe('external feedback loop contents', () => {
  it("taps the echo's own output — before the compressor, spring and EQ", () => {
    expect(DUBBUS_SRC).toContain('this.postEchoSatBypass.connect(this.extFeedbackEq)');
    expect(DUBBUS_SRC).toContain('this.postEchoSatWet.connect(this.extFeedbackEq)');
    expect(DUBBUS_SRC, 'the glue compressor is back inside the loop').not.toContain('this.stereoMerge.connect(this.extFeedbackEq)');
    expect(DUBBUS_SRC).not.toContain('this.return_.connect(this.extFeedbackEq)');
  });

  it('routes through the hard limiter before re-entering the input', () => {
    expect(DUBBUS_SRC).toContain('this.extFeedbackGain.connect(this.extFeedbackLimit)');
    expect(DUBBUS_SRC).toContain('this.extFeedbackLimit.connect(this.extFeedbackDelay)');
    // The old direct edge must be gone, or the limiter can be bypassed.
    expect(DUBBUS_SRC).not.toContain('this.extFeedbackGain.connect(this.extFeedbackDelay)');
  });

  it('keeps the limiter a plain waveshaper no setting can disable', () => {
    expect(DUBBUS_SRC).toContain('this.extFeedbackLimit = this.context.createWaveShaper()');
    // tanh asymptotes at unity — the loop may sustain, never grow unbounded.
    const ctor = DUBBUS_SRC.match(/this\.extFeedbackLimit = this\.context\.createWaveShaper\(\);[\s\S]*?\n {4}\}/)?.[0] ?? '';
    expect(ctor).toContain('Math.tanh');
  });

  it('only Perry ships a non-zero external feedback gain', () => {
    const withLoop = Object.entries(DUB_CHARACTER_PRESETS)
      .filter(([, p]) => (p.overrides.extFeedbackGain ?? 0) > 0)
      .map(([name]) => name);
    expect(withLoop).toEqual(['perry']);
    // And it stays small — the chain behind it already has large gain.
    expect(DUB_CHARACTER_PRESETS.perry.overrides.extFeedbackGain).toBeLessThanOrEqual(0.05);
  });

  it('default has the loop off entirely', () => {
    expect(DEFAULT_DUB_BUS.extFeedbackGain).toBe(0);
  });
});

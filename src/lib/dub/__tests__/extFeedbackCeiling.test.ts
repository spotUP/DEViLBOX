/**
 * X3 — a boost inside the feedback loop that nothing paid for.
 *
 * `extFeedbackEqGain` is a peaking boost INSIDE the external feedback loop:
 * Messian Dread's technique of returning the wet output through a mixer
 * channel so every repeat gets EQ and fader. The fader was clamped to 0.85 and
 * the EQ was never counted, so at the EQ's centre frequency the real loop gain
 * was 0.85 x the boost — over unity from +1.5 dB upward, while the fader still
 * read "safe".
 *
 * A mirror would be the wrong fix and the ledger's "same class as the
 * hpfResonance mirror" is only half right: `extFeedbackShelfComp` mirrors the
 * bass shelf because that shelf is applied on the FORWARD path and the loop
 * would apply it twice. This EQ is the loop's OWN colour — cancelling it
 * deletes the feature. The boost needs a budget, not a mirror.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  clampExtFeedback,
  extFeedbackCeiling,
  dbToGain,
  EXT_FEEDBACK_MAX_LOOP_GAIN,
} from '../extFeedbackCeiling';

describe('the loop stays under unity at the EQ centre frequency', () => {
  it('is the plain ceiling when the EQ is flat', () => {
    expect(extFeedbackCeiling(0)).toBeCloseTo(EXT_FEEDBACK_MAX_LOOP_GAIN, 10);
  });

  it('keeps the round trip at the limit however much the EQ boosts', () => {
    for (const db of [0, 0.5, 1, 3, 6, 12]) {
      const loopGain = extFeedbackCeiling(db) * dbToGain(db);
      expect(loopGain, `${db} dB`).toBeCloseTo(EXT_FEEDBACK_MAX_LOOP_GAIN, 10);
    }
  });

  it('never lets the round trip reach unity', () => {
    for (const db of [0, 1, 3, 6, 12, 24]) {
      expect(extFeedbackCeiling(db) * dbToGain(db)).toBeLessThan(1);
    }
  });

  it('is the case that actually shipped: +1 dB used to give 0.954', () => {
    // 0.85 x 10^(1/20) = 0.9535 — stable, but far closer to howling than the
    // fader's own number suggests. At +3 dB the old maths gives 1.20.
    expect(EXT_FEEDBACK_MAX_LOOP_GAIN * dbToGain(1)).toBeGreaterThan(0.95);
    expect(EXT_FEEDBACK_MAX_LOOP_GAIN * dbToGain(3)).toBeGreaterThan(1);
    // With the budget applied, both are back at the limit.
    expect(clampExtFeedback(0.85, 1) * dbToGain(1)).toBeCloseTo(0.85, 10);
    expect(clampExtFeedback(0.85, 3) * dbToGain(3)).toBeCloseTo(0.85, 10);
  });
});

describe('a cut does not buy extra fader', () => {
  it('leaves the ceiling where it was', () => {
    // A cut makes the loop quieter AT ONE FREQUENCY. Spending that as extra
    // feedback would hand back the headroom at every other frequency.
    expect(extFeedbackCeiling(-6)).toBeCloseTo(EXT_FEEDBACK_MAX_LOOP_GAIN, 10);
    expect(extFeedbackCeiling(-24)).toBeCloseTo(EXT_FEEDBACK_MAX_LOOP_GAIN, 10);
  });
});

describe('clamping the fader', () => {
  it('leaves a modest request alone', () => {
    expect(clampExtFeedback(0.035, 1)).toBeCloseTo(0.035, 10);
  });

  it('pulls back a request that the EQ has made unsafe', () => {
    expect(clampExtFeedback(0.85, 6)).toBeLessThan(0.85);
    expect(clampExtFeedback(0.85, 6)).toBeCloseTo(0.85 / dbToGain(6), 10);
  });

  it('treats a negative or nonsense request as off', () => {
    expect(clampExtFeedback(-1, 0)).toBe(0);
    expect(clampExtFeedback(NaN, 0)).toBe(0);
  });

  it('survives a nonsense EQ value rather than producing NaN', () => {
    expect(clampExtFeedback(0.5, NaN)).toBeCloseTo(0.5, 10);
    expect(Number.isFinite(extFeedbackCeiling(NaN))).toBe(true);
  });
});

describe('wiring contract — the budget is actually applied', () => {
  const bus = readFileSync(join(__dirname, '..', '..', '..', 'engine', 'dub', 'DubBus.ts'), 'utf8');

  it('no raw 0.85 clamp is left on the external feedback gain', () => {
    expect(bus).not.toMatch(/extFeedbackGain\.gain\.value = Math\.min\(0\.85/);
    expect(bus).not.toMatch(/Math\.min\(0\.85, Math\.max\(0, merged\.extFeedbackGain\)\)/);
  });

  it('clamps at construction and on every settings write', () => {
    const uses = bus.match(/clampExtFeedback\(/g) ?? [];
    expect(uses.length).toBe(2);
  });

  it('recomputes when the EQ moves, not only when the fader does', () => {
    // Raising the boost lowers the ceiling, so a fader sitting at the old
    // limit has to come down with it.
    expect(bus).toContain(
      "if (settings.extFeedbackGain !== undefined || settings.extFeedbackEqGain !== undefined)",
    );
  });
});

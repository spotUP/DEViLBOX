/**
 * pitchContour.test.ts — segment-relative pitch re-anchoring.
 *
 * Mined phoneme runs keep the ABSOLUTE pitch of the recording they came from:
 * one segment at index 20, the next at 8. Spliced speech therefore leapt
 * around by 10+ indices at segment joins, which no whole-word offset can fix.
 * applyPitchContour moves every voiced run onto one baseline and keeps only
 * each frame's clamped delta from its own run's median.
 */
import { describe, it, expect } from 'vitest';
import { applyPitchContour, CONTOUR_DELTA_CLAMP } from '../sentenceProsody';
import type { TMS5220Frame } from '../tms5220PhonemeMap';

const voiced = (pitch: number): TMS5220Frame => ({
  k: [10, 10, 8, 8, 8, 8, 8, 4, 4, 4], energy: 10, pitch, unvoiced: false, durationMs: 25,
});
const noise: TMS5220Frame = {
  k: [10, 10, 8, 8, 8, 8, 8, 4, 4, 4], energy: 8, pitch: 0, unvoiced: true, durationMs: 25,
};

describe('applyPitchContour', () => {
  it('bounds the jump between runs mined from different recordings', () => {
    // Run A at ~20, run B at ~8 — a 12-index leap across the noise frame.
    const frames = [voiced(20), voiced(21), voiced(20), noise, voiced(8), voiced(7), voiced(8)];
    const out = applyPitchContour(frames, { baseOffset: 0, declination: 0, finalAdjust: 0 });
    const a = out[2].pitch;
    const b = out[4].pitch;
    expect(Math.abs(a - b)).toBeLessThanOrEqual(2 * CONTOUR_DELTA_CLAMP);
    // The raw material fails this by construction.
    expect(Math.abs(frames[2].pitch - frames[4].pitch)).toBeGreaterThan(2 * CONTOUR_DELTA_CLAMP);
  });

  it('keeps each run\'s micro-contour shape', () => {
    const frames = [voiced(18), voiced(19), voiced(20), voiced(21)];
    const out = applyPitchContour(frames, { baseOffset: 0, declination: 0, finalAdjust: 0 });
    for (let i = 1; i < out.length; i++) {
      expect(out[i].pitch).toBeGreaterThanOrEqual(out[i - 1].pitch);
    }
  });

  it('leaves unvoiced and silent frames alone', () => {
    const silence: TMS5220Frame = { ...noise, energy: 0 };
    const frames = [voiced(15), noise, silence, voiced(15)];
    const out = applyPitchContour(frames, { baseOffset: 5, declination: 2, finalAdjust: 3 });
    expect(out[1].pitch).toBe(0);
    expect(out[2].energy).toBe(0);
    expect(out[2].pitch).toBe(0);
  });

  it('ramps the question rise across the last voiced run only', () => {
    const frames = [voiced(15), voiced(15), noise, voiced(15), voiced(15), voiced(15)];
    const rise = applyPitchContour(frames, { baseOffset: 0, declination: 0, finalAdjust: 4 });
    const flat = applyPitchContour(frames, { baseOffset: 0, declination: 0, finalAdjust: 0 });
    // Earlier runs untouched; the last run GLIDES to +4 — its first frame
    // starts at the baseline (no step at the run boundary), its last lands +4.
    expect(rise[0].pitch).toBe(flat[0].pitch);
    expect(rise[3].pitch).toBe(flat[3].pitch);
    expect(rise[5].pitch).toBe(flat[5].pitch + 4);
    // Monotonic glide in between.
    expect(rise[4].pitch).toBeGreaterThanOrEqual(rise[3].pitch);
    expect(rise[4].pitch).toBeLessThanOrEqual(rise[5].pitch);
  });

  it('drifts down across the stream by the declination', () => {
    const frames = Array.from({ length: 20 }, () => voiced(16));
    const out = applyPitchContour(frames, { baseOffset: 0, declination: 3, finalAdjust: 0 });
    expect(out[0].pitch - out[19].pitch).toBe(3);
  });

  it('shifts the whole stream by baseOffset', () => {
    const frames = [voiced(16), voiced(16)];
    const out = applyPitchContour(frames, { baseOffset: -4, declination: 0, finalAdjust: 0 });
    expect(out[0].pitch).toBe(12);
  });
});

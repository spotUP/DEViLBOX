import { describe, it, expect } from 'vitest';
import { rideTrimDb, bufferPeak, CLIP_TARGET_PEAK, RIDE_MAX_DB, RIDE_RELEASE_DB } from '../trimRide';

/**
 * The trim ride: attack by exactly the overshoot, release slowly.
 * "clips/dists" (2026-09-22): master peak 0.95 at 0.56 RMS with AutoDub at
 * BASS +12 — the predictive trim was short and the clipper paid.
 */
describe('rideTrimDb', () => {
  it('drops by exactly the overshoot when the clipper input is over target', () => {
    const peak = CLIP_TARGET_PEAK * 2;   // +6.02 dB over
    expect(rideTrimDb(0, peak)).toBeCloseTo(-20 * Math.log10(2), 6);
  });

  it('holds the clipper input at the target after one attack', () => {
    // The measured 0.95 peak: one tick later the input sits at the target.
    const ride = rideTrimDb(0, 0.95);
    expect(0.95 * Math.pow(10, ride / 20)).toBeCloseTo(CLIP_TARGET_PEAK, 6);
  });

  it('releases a little per tick when under target, never above zero', () => {
    expect(rideTrimDb(-3, 0.3)).toBeCloseTo(-3 + RIDE_RELEASE_DB, 6);
    expect(rideTrimDb(-0.2, 0.3)).toBe(0);
    expect(rideTrimDb(0, 0.3)).toBe(0);
  });

  it('never goes deeper than the maximum', () => {
    expect(rideTrimDb(-RIDE_MAX_DB, 10)).toBe(-RIDE_MAX_DB);
    expect(rideTrimDb(-11.9, 5)).toBe(-RIDE_MAX_DB);
  });

  it('treats silence as under target — the ride releases through a rest', () => {
    expect(rideTrimDb(-4, 0)).toBeCloseTo(-4 + RIDE_RELEASE_DB, 6);
  });

  it('is stable — a held overshoot is corrected once, not again on the corrected signal', () => {
    let ride = 0;
    const source = 1.2;
    for (let i = 0; i < 5; i++) {
      const seen = source * Math.pow(10, ride / 20);
      ride = rideTrimDb(ride, seen);
    }
    // Settles where the input equals the target; release nudges it up by one
    // step and the next tick takes it straight back.
    expect(source * Math.pow(10, ride / 20)).toBeLessThanOrEqual(CLIP_TARGET_PEAK * Math.pow(10, RIDE_RELEASE_DB / 20) + 1e-6);
  });
});

describe('bufferPeak', () => {
  it('is the largest absolute sample', () => {
    expect(bufferPeak(new Float32Array([0.1, -0.7, 0.3]))).toBeCloseTo(0.7, 6);
    expect(bufferPeak(new Float32Array(0))).toBe(0);
  });
});

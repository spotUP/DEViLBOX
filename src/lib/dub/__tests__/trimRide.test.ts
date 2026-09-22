import { describe, it, expect } from 'vitest';
import { rideTrim, bufferPeak, CLIP_TARGET_PEAK, TRIM_RIDE } from '../trimRide';
import { RIDER_REST } from '../gainRider';

/**
 * "clips/dists" (2026-09-22): master peak 0.95 at 0.56 RMS with AutoDub at
 * BASS +12 — the predictive trim was short and the clipper paid. Then
 * "very artificially sidechained" — so the correction settles rather than
 * snaps.
 */
describe('rideTrim', () => {
  it('moves toward the overshoot, a fraction per tick', () => {
    const peak = CLIP_TARGET_PEAK * 2;   // +6.02 dB over
    const s = rideTrim(RIDER_REST, peak);
    expect(s.db).toBeCloseTo(-20 * Math.log10(2) * TRIM_RIDE.attackFraction, 6);
    expect(s.hold).toBe(TRIM_RIDE.holdTicks);
  });

  it('brings the measured 0.95 peak to the target within a few ticks', () => {
    let s = RIDER_REST;
    const raw = 0.95;
    for (let i = 0; i < 8; i++) s = rideTrim(s, raw * Math.pow(10, s.db / 20));
    expect(raw * Math.pow(10, s.db / 20)).toBeLessThan(CLIP_TARGET_PEAK * 1.02);
  });

  it('holds through a rest, then creeps back slowly', () => {
    let s = rideTrim(RIDER_REST, 1.2);
    const depth = s.db;
    for (let i = 0; i < TRIM_RIDE.holdTicks; i++) {
      s = rideTrim(s, 0);
      expect(s.db).toBeCloseTo(depth, 6);
    }
    s = rideTrim(s, 0);
    expect(s.db).toBeCloseTo(depth + TRIM_RIDE.releaseDb, 6);
  });

  it('is slow enough not to be heard as movement', () => {
    // Under 1 dB a second, at four ticks a second.
    expect(TRIM_RIDE.releaseDb * 4).toBeLessThan(1);
  });

  it('never goes deeper than the maximum', () => {
    let s = RIDER_REST;
    for (let i = 0; i < 40; i++) s = rideTrim(s, 100);
    expect(s.db).toBe(-TRIM_RIDE.maxDb);
  });
});

describe('bufferPeak', () => {
  it('is the largest absolute sample', () => {
    expect(bufferPeak(new Float32Array([0.1, -0.7, 0.3]))).toBeCloseTo(0.7, 6);
    expect(bufferPeak(new Float32Array(0))).toBe(0);
  });
});

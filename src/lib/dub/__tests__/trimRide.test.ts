import { describe, it, expect } from 'vitest';
import { rideTrim, spendRide, bufferPeak, CLIP_TARGET_PEAK, TRIM_RIDE } from '../trimRide';
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

  it('answers only for what the boost adds — a hot programme is not its business', () => {
    // Dry plus return already peak 0.9 with the shelf flat; boosted 1.0.
    // The ride corrects the 0.9 dB the boost added, not the 1.9 dB over target.
    const s = rideTrim(RIDER_REST, 1.0, 0.9);
    expect(s.db).toBeCloseTo(-20 * Math.log10(1.0 / 0.9) * TRIM_RIDE.attackFraction, 6);
    // And with nothing added, it rests, however hot the programme is.
    expect(rideTrim(RIDER_REST, 0.9, 0.9).db).toBe(0);
  });

  it('keeps the clip target when the unboosted reference is under it', () => {
    expect(rideTrim(RIDER_REST, 1.0, 0.3)).toEqual(rideTrim(RIDER_REST, 1.0));
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

describe('spendRide — the boost pays first, punch before bass', () => {
  // "the bass kills all other audio" (2026-09-22): the ride took its depth
  // from the whole mix while the shelf kept adding.
  it('takes the depth off the punch first, and leaves the mix alone', () => {
    expect(spendRide(12, 6, -4)).toEqual({ bassDb: 12, punchDb: 2, trimDb: 0 });
  });

  it('then off the shelf', () => {
    expect(spendRide(12, 6, -10)).toEqual({ bassDb: 8, punchDb: 0, trimDb: 0 });
    expect(spendRide(12, 0, -4)).toEqual({ bassDb: 8, punchDb: 0, trimDb: 0 });
  });

  it('reaches the trim only once both are flat', () => {
    expect(spendRide(12, 6, -20)).toEqual({ bassDb: 0, punchDb: 0, trimDb: -2 });
    expect(spendRide(3, 0, -3)).toEqual({ bassDb: 0, punchDb: 0, trimDb: 0 });
  });

  it('does not let a ridden-flat shelf hand headroom back to the punch', () => {
    // The stuck case: ride -12 against bass 12 + punch 6 leaves NO punch.
    expect(spendRide(12, 6, -12).punchDb).toBe(0);
  });

  it('trims a cut as before — there is no boost to give', () => {
    expect(spendRide(-3, -2, -4)).toEqual({ bassDb: -3, punchDb: -2, trimDb: -4 });
    expect(spendRide(0, 0, -4)).toEqual({ bassDb: 0, punchDb: 0, trimDb: -4 });
  });

  it('changes nothing when the ride is at rest', () => {
    expect(spendRide(12, 6, 0)).toEqual({ bassDb: 12, punchDb: 6, trimDb: 0 });
    expect(spendRide(12, 6, 2)).toEqual({ bassDb: 12, punchDb: 6, trimDb: 0 });
  });
});

describe('bufferPeak', () => {
  it('is the largest absolute sample', () => {
    expect(bufferPeak(new Float32Array([0.1, -0.7, 0.3]))).toBeCloseTo(0.7, 6);
    expect(bufferPeak(new Float32Array(0))).toBe(0);
  });
});

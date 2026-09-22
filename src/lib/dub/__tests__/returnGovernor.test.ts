import { describe, it, expect } from 'vitest';
import { governReturn, bufferRms, RETURN_GOVERNOR, MAX_WET_TO_PROGRAMME } from '../returnGovernor';
import { RIDER_REST } from '../gainRider';

/**
 * The return may be as loud as the music and no louder.
 * "clips/dists" (2026-09-22): send 0.028 RMS, return 0.261 — the echo came
 * back louder than the song.
 */
describe('governReturn', () => {
  it('brings a return that is louder than the music down to unity within a few ticks', () => {
    // The measured case: 0.261 return against a 0.10 programme.
    let s = RIDER_REST;
    for (let i = 0; i < 10; i++) s = governReturn(s, 0.261, 0.10, true);
    expect(0.261 * Math.pow(10, s.db / 20)).toBeLessThan(0.10 * MAX_WET_TO_PROGRAMME * 1.05);
  });

  it('leaves a return under the music alone', () => {
    expect(governReturn(RIDER_REST, 0.05, 0.10, true).db).toBe(0);
  });

  it('measures against the depth already applied — settles, no runaway', () => {
    let s = RIDER_REST;
    for (let i = 0; i < 30; i++) s = governReturn(s, 0.4, 0.1, true);
    // 4x over = 12 dB: settles at -12, held, not driven to the maximum.
    expect(s.db).toBeCloseTo(-12, 1);
    expect(s.db).toBeGreaterThan(-RETURN_GOVERNOR.maxDb);
  });

  it('does not touch the tail in a rest — no programme, no governing', () => {
    const held = { db: -3, hold: 2 };
    expect(governReturn(held, 0.3, 0, true).db).toBeCloseTo(-3, 6);
    expect(governReturn({ db: -3, hold: 0 }, 0.3, 0.1, false).db).toBeCloseTo(-3 + RETURN_GOVERNOR.releaseDb, 6);
  });

  it('never goes deeper than the maximum', () => {
    let s = RIDER_REST;
    for (let i = 0; i < 60; i++) s = governReturn(s, 100, 0.01, true);
    expect(s.db).toBe(-RETURN_GOVERNOR.maxDb);
  });
});

describe('bufferRms', () => {
  it('is the root mean square', () => {
    expect(bufferRms(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5, 6);
    expect(bufferRms(new Float32Array(0))).toBe(0);
  });
});

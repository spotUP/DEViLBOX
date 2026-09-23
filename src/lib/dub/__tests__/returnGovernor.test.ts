import { describe, it, expect } from 'vitest';
import { governReturn, bufferRms, RETURN_GOVERNOR, MAX_WET_TO_PROGRAMME } from '../returnGovernor';
import { RIDER_REST } from '../gainRider';

/**
 * The return may run HOT — dub wet is supposed to — and no hotter than the
 * headroom the clipper actually has.
 *
 * The first version held it to unity: "clips/dists" (2026-09-22), send 0.028
 * RMS, return 0.261, the echo louder than the song. That report was fixed the
 * same day by the trim ride and the low-band ceiling, which fence the clipper
 * directly. Left at unity the governor then treated the wet chain's DESIGNED
 * gain — echo at 0.79 feedback, spring at 0.5, about +11 dB at sends of 0.4
 * and above, measured 2026-09-23 — as an overshoot to correct, lived at its
 * floor at every real send level, and every return toggle was inaudible.
 * `afterClip` at max sends: 0.18, against a 0.9 knee. Nothing was clipping.
 */
describe('governReturn', () => {
  it('leaves the wet chain its own gain — +11 dB at real sends is not a runaway', () => {
    // Measured 2026-09-23, four sends at 0.96: programme 0.088, return 0.314.
    let s = RIDER_REST;
    for (let i = 0; i < 30; i++) s = governReturn(s, 0.314, 0.088, true);
    expect(s.db).toBe(0);
  });

  it('brings a true runaway down to the headroom within a few ticks', () => {
    // +19 dB, the original report, exceeds the headroom by 7 dB.
    let s = RIDER_REST;
    for (let i = 0; i < 10; i++) s = governReturn(s, 0.261, 0.028, true);
    expect(0.261 * Math.pow(10, s.db / 20)).toBeLessThan(0.028 * MAX_WET_TO_PROGRAMME * 1.05);
  });

  it('leaves a return under the music alone', () => {
    expect(governReturn(RIDER_REST, 0.05, 0.10, true).db).toBe(0);
  });

  it('measures against the depth already applied — settles, no runaway', () => {
    let s = RIDER_REST;
    // 16x over = 24 dB, 12 dB past the headroom: settles at -12, held,
    // not driven on to the -18 floor.
    for (let i = 0; i < 30; i++) s = governReturn(s, 1.6, 0.1, true);
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

/**
 * A held wet gesture: the governor may loosen but never tighten, and it
 * loosens at the idle creep, not faster.
 *
 * With the headroom right the governor is at 0 at every real send level, so a
 * press normally has nothing to release. When it IS holding a genuine runaway
 * down, the first cut of this released it at 2.25 dB a tick — thirteen dB in
 * two seconds, then re-clamped in one second on release. Heard as a pump:
 * "they all sound the same", "very reverb washed", "stutters when i
 * activate/deactivate" (2026-09-23). A gesture does not uncork the wash. It
 * only stops the governor fighting the move.
 */
describe('governReturn under a held wet gesture', () => {
  it('loosens at the idle creep while held, no faster', () => {
    let s = { db: -6, hold: 8 };
    const first = governReturn(s, 0.307, 0.020, true, true);
    expect(first.db).toBeCloseTo(-6 + RETURN_GOVERNOR.releaseDb, 6);
    for (let i = 0; i < 8; i++) s = governReturn(s, 0.307, 0.020, true, true);
    // Two seconds in: a dB and change, not thirteen.
    expect(s.db).toBeLessThan(-4);
  });

  it('never tightens while held, whatever the return does', () => {
    let s = { db: -3, hold: 0 };
    for (let i = 0; i < 8; i++) s = governReturn(s, 100, 0.01, true, true);
    expect(s.db).toBeGreaterThanOrEqual(-3);
  });

  it('is the plain governor when nothing is held', () => {
    const idle = governReturn({ db: -18, hold: 4 }, 0.307, 0.020, true);
    const held = governReturn({ db: -18, hold: 4 }, 0.307, 0.020, true, false);
    expect(held).toEqual(idle);
    // ...and that plain governor is still holding a +24 dB return at the floor.
    expect(idle.db).toBe(-RETURN_GOVERNOR.maxDb);
  });

  it('governs again the tick after the hand comes off', () => {
    let s = { db: -6, hold: 0 };
    for (let i = 0; i < 4; i++) s = governReturn(s, 0.307, 0.020, true, true);
    const released = s.db;
    s = governReturn(s, 0.307, 0.020, true, false);
    expect(s.db).toBeLessThan(released);
  });
});

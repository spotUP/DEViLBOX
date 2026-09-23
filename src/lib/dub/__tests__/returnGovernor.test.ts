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

/**
 * A held wet gesture is the performer overriding the safety.
 *
 * 0c158b836 stopped the governor TIGHTENING while a gesture is held. It did
 * nothing about a clamp earned before the press: four sends at 0.96 through a
 * 0.79-feedback echo is +20 dB, the governor goes to its -18 dB floor, and
 * the rider then releases at 0.15 dB per 250 ms tick — thirty seconds, after
 * eight ticks of hold. Every toggle pressed in that window landed on a return
 * held at 12 %. Measured 2026-09-23 with the owner's faders at max:
 * returnGovernorDb -18, returnTrim 0.1259, "completely dead".
 *
 * Runaway protection is untouched: the moment the hand comes off, the next
 * tick governs as before.
 */
describe('governReturn under a held wet gesture', () => {
  it('releases a clamp earned before the press, at gesture pace', () => {
    // The measured clamp. The return is still over the programme when the
    // performer presses — that is what the press is FOR.
    let s = { db: -18, hold: 8 };
    for (let i = 0; i < 8; i++) s = governReturn(s, 0.307, 0.020, true, true);
    // Two seconds in, the return is audibly back: past -6 dB, not creeping
    // 1.2 dB up the way the idle release would.
    expect(s.db).toBeGreaterThan(-6);
  });

  it('never tightens while held, whatever the return does', () => {
    let s = { db: -3, hold: 0 };
    for (let i = 0; i < 8; i++) s = governReturn(s, 100, 0.01, true, true);
    expect(s.db).toBeGreaterThanOrEqual(-3);
  });

  it('is the plain governor when nothing is held', () => {
    const idle = governReturn({ db: -18, hold: 0 }, 0.307, 0.020, true);
    const held = governReturn({ db: -18, hold: 0 }, 0.307, 0.020, true, false);
    expect(held).toEqual(idle);
    // ...and that plain governor is still holding a +24 dB return down.
    expect(idle.db).toBe(-RETURN_GOVERNOR.maxDb);
  });

  it('governs again the tick after the hand comes off', () => {
    let s = { db: -18, hold: 8 };
    for (let i = 0; i < 8; i++) s = governReturn(s, 0.307, 0.020, true, true);
    const released = s.db;
    s = governReturn(s, 0.307, 0.020, true, false);
    expect(s.db).toBeLessThan(released);
  });
});

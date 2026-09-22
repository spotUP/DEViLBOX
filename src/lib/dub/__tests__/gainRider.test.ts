import { describe, it, expect } from 'vitest';
import { stepRider, RIDER_REST, type RiderConfig } from '../gainRider';

/**
 * "it sounds very artificially sidechained" (2026-09-22): a ride that attacks
 * in full and releases fast is a sidechain. This one settles, holds, creeps.
 */
const cfg: RiderConfig = { attackFraction: 0.5, holdTicks: 4, releaseDb: 0.2, maxDb: 12 };

describe('stepRider', () => {
  it('takes only a fraction of the overshoot per tick', () => {
    const s = stepRider(RIDER_REST, 6, cfg);
    expect(s.db).toBeCloseTo(-3, 6);
    expect(s.hold).toBe(cfg.holdTicks);
  });

  it('settles on a held overshoot over a few ticks rather than in one', () => {
    let s = RIDER_REST;
    const raw = 6;
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) {
      s = stepRider(s, raw + s.db, cfg);   // what remains after the depth applied
      seen.push(s.db);
    }
    expect(seen[0]).toBeCloseTo(-3, 6);
    expect(seen[1]).toBeCloseTo(-4.5, 6);
    expect(seen[5]).toBeCloseTo(-6 * (1 - 0.5 ** 6), 6);
  });

  it('holds after an attack — a quiet bar does not bring the level straight back', () => {
    let s = stepRider(RIDER_REST, 6, cfg);
    for (let i = 0; i < cfg.holdTicks; i++) {
      s = stepRider(s, -20, cfg);
      expect(s.db).toBeCloseTo(-3, 6);
    }
    // Then it creeps.
    s = stepRider(s, -20, cfg);
    expect(s.db).toBeCloseTo(-3 + cfg.releaseDb, 6);
  });

  it('never rises above zero or falls below the maximum', () => {
    expect(stepRider({ db: -0.1, hold: 0 }, -1, cfg).db).toBe(0);
    expect(stepRider({ db: -11.9, hold: 0 }, 40, cfg).db).toBe(-cfg.maxDb);
  });

  it('treats a bad state as rest', () => {
    expect(stepRider({ db: NaN, hold: NaN }, -1, cfg)).toEqual({ db: 0, hold: 0 });
  });
});

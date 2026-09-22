import { describe, it, expect } from 'vitest';
import { lowMidDipDbFor, LOW_MID_DIP_MAX_DB } from '../lowMidDip';

describe('lowMidDipDbFor — heavy but clean', () => {
  it('cuts nothing at rest or for a cut', () => {
    for (const db of [0, -3, -12]) expect(lowMidDipDbFor(db)).toBe(0);
  });

  it('cuts more as the low end goes up, to its maximum at the top', () => {
    expect(lowMidDipDbFor(6)).toBeLessThan(0);
    expect(lowMidDipDbFor(12)).toBeLessThan(lowMidDipDbFor(6));
    expect(lowMidDipDbFor(12)).toBe(LOW_MID_DIP_MAX_DB);
  });

  it('is a dip, never a boost, and not deep enough to hollow the mids', () => {
    expect(LOW_MID_DIP_MAX_DB).toBeLessThan(0);
    expect(LOW_MID_DIP_MAX_DB).toBeGreaterThanOrEqual(-3);
    for (let db = -12; db <= 24; db += 3) expect(lowMidDipDbFor(db)).toBeLessThanOrEqual(0);
  });
});

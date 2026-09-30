/**
 * The liquid sweep colours without adding level (measured tables, 2026-09-30).
 */
import { describe, it, expect } from 'vitest';
import { sweepBranchNorm, sweepMix, COMB_BRANCH_DB, PHASER_BRANCH_DB } from '../sweepLevel';

const db = (x: number) => 20 * Math.log10(x);

describe('sweep level', () => {
  it('normalises each measured point to unity', () => {
    for (const [fb, g] of COMB_BRANCH_DB) expect(db(sweepBranchNorm('comb', fb)) + g).toBeCloseTo(0, 6);
    for (const [fb, g] of PHASER_BRANCH_DB) expect(db(sweepBranchNorm('phaser', fb)) + g).toBeCloseTo(0, 6);
  });
  it('interpolates between points and holds at the ends', () => {
    const mid = db(sweepBranchNorm('phaser', 0.6));
    expect(mid).toBeLessThan(-4.1);
    expect(mid).toBeGreaterThan(-6.0);
    expect(db(sweepBranchNorm('phaser', 1))).toBeCloseTo(-17.4, 6);
  });
  it('mixes equal-power: off is all dry, full is an even blend at unity power', () => {
    expect(sweepMix(0)).toEqual({ dry: 1, wet: 0 });
    const full = sweepMix(1);
    expect(full.dry).toBeCloseTo(full.wet, 12);
    expect(full.dry ** 2 + full.wet ** 2).toBeCloseTo(1, 12);
  });
});

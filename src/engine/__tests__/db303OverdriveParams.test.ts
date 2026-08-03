import { describe, it, expect } from 'vitest';
import { tb303OverdriveToParams } from '../db303/overdriveParams';

/**
 * Regression: config overdrive is percent-scale (0-100, written by the DB-303
 * panel and the DevilFish presets). The old code passed it raw into a 0-1
 * clamp, so any amount above 1% slammed the drive to maximum.
 */
describe('tb303OverdriveToParams', () => {
  it('maps percent amount to normalized drive instead of clamping to full', () => {
    expect(tb303OverdriveToParams({ amount: 50 }).amount).toBeCloseTo(0.5);
    expect(tb303OverdriveToParams({ amount: 50 }).amount).not.toBe(1);
    expect(tb303OverdriveToParams({ amount: 15 }).amount).toBeCloseTo(0.15);
  });

  it('amount 0 bypasses, amount 100 is full drive, out-of-range clamps', () => {
    expect(tb303OverdriveToParams({ amount: 0 }).amount).toBe(0);
    expect(tb303OverdriveToParams({ amount: 100 }).amount).toBe(1);
    expect(tb303OverdriveToParams({ amount: 150 }).amount).toBe(1);
    expect(tb303OverdriveToParams({ amount: -5 }).amount).toBe(0);
  });

  it('defaults: Soft model, full wet mix', () => {
    const p = tb303OverdriveToParams({ amount: 50 });
    expect(p.model).toBe(0);
    expect(p.mix).toBe(1);
  });

  it('modelIndex 1 selects RAT; higher legacy GuitarML indices also map to RAT', () => {
    expect(tb303OverdriveToParams({ amount: 50, modelIndex: 0 }).model).toBe(0);
    expect(tb303OverdriveToParams({ amount: 50, modelIndex: 1 }).model).toBe(1);
    expect(tb303OverdriveToParams({ amount: 50, modelIndex: 7 }).model).toBe(1);
  });

  it('dryWet percent maps to 0-1 mix', () => {
    expect(tb303OverdriveToParams({ amount: 50, dryWet: 25 }).mix).toBeCloseTo(0.25);
    expect(tb303OverdriveToParams({ amount: 50, dryWet: 0 }).mix).toBe(0);
  });
});

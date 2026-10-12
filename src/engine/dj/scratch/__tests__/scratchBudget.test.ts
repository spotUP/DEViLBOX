/** Performance budget (owner scratch plan section 55; ledger SCR-P6.8). */
import { describe, it, expect } from 'vitest';
import { PerformanceBudget, budgetBand } from '../scratchBudget';

describe('performance budget (SCR-P6.8)', () => {
  it('band labels at 10 / 30 / 60 / 90', () => {
    expect([10, 30, 60, 90].map(budgetBand)).toEqual(['normal', 'occasional', 'performance', 'feature']);
  });

  it('a feature lifts the total to >= 75; it falls back below 25 within 6 bars', () => {
    const b = new PerformanceBudget();
    b.add('juggle', 10);
    b.feature();
    expect(b.total).toBeGreaterThanOrEqual(75);
    expect(b.band).toBe('feature');
    b.tickBar(6);
    expect(b.total).toBeLessThan(25);
    expect(b.parts.juggle).toBeGreaterThan(0);
  });

  it('never exceeds 100 and never goes below 0', () => {
    const b = new PerformanceBudget();
    b.add('scratch', 80); b.add('fx', 50);
    expect(b.total).toBe(100);
    b.tickBar(20);
    expect(b.total).toBe(0);
  });
});

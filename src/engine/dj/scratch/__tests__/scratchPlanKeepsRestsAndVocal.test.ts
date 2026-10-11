/**
 * Audit SA-M6 (thoughts/shared/research/2026-10-12_scratch-work-audit.md; owner scratch plan
 * sections 23, 24, 74, 77): the planner's final output keeps the rest and vocal rules the
 * placement layer guarantees. Before the fix `planBars` chose the showcase rest window (1/8 of
 * 32 bars) from the section's UNcapped state, so electro in a drop under PERFORMER (capped to
 * high) kept 0 empty bars in some 16-bar windows (72 of 80 under a quarter); and routines were
 * written over bars after the vocal rule: boomBap chorus at vocal 0.9 planned 647 events vs 702
 * at vocal 0.
 */
import { describe, it, expect } from 'vitest';
import { planScratch } from '../scratchPlanner';
import { scenarioContext } from './fixtures/scenarioContext';

describe('the final plan keeps rests and vocal space (SA-M6)', () => {
  it('electro drop under PERFORMER keeps at least a quarter of every 16 bars empty (40 seeds)', () => {
    let windows = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const plan = planScratch(scenarioContext({ style: 'electro', kind: 'drop', bpm: 128, energy: 0.9 }), { mode: 'PERFORMER', seed, fromBar: 16, bars: 32 });
      for (let w = 0; w < 32; w += 16) {
        const empty = plan.bars.slice(w, w + 16).filter((b) => b.length === 0).length;
        expect(empty, `seed ${seed} window ${w}`).toBeGreaterThanOrEqual(4);
        windows++;
      }
    }
    expect(windows).toBe(80);
  });

  it('a vocal at 0.9 thins the whole plan, routines included: boomBap chorus MUSICAL plans under half the events', () => {
    let quiet = 0, vocal = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const at = (v: number) => planScratch(scenarioContext({ style: 'boomBap', kind: 'chorus', bpm: 92, energy: 0.6, vocal: v }), { mode: 'MUSICAL', seed, fromBar: 16, bars: 32 });
      quiet += at(0).events.length;
      vocal += at(0.9).events.length;
    }
    expect(quiet).toBeGreaterThan(100);
    expect(vocal).toBeLessThan(quiet * 0.5);
  });
});

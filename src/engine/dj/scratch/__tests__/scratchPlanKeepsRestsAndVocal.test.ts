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

// P13 (owner 2026-10-12): the demo's own rests and strokes are the demo's to keep (electro's drop is its 'high'
// state, every bar busy in some windows, as the demo plays it); the rules govern what DEViLBOX adds on top
describe('the final plan keeps rests and vocal space (SA-M6)', () => {
  it('the extras never fill a bar the demo leaves empty unless the evaluation escalates (40 seeds)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const [style, kind, mode] of [['electro', 'drop', 'PERFORMER'], ['boomBap', 'verse', 'PERFORMER'], ['boomBap', 'chorus', 'MUSICAL']] as const) {
        const ctx = scenarioContext({ style, kind, bpm: 128, energy: 0.9 });
        const p = planScratch(ctx, { mode, seed, fromBar: 16, bars: 32 });
        const alone = planScratch(ctx, { mode, seed, fromBar: 16, bars: 32, extras: false });
        expect(p.bars.map((b) => b.length === 0), `${style} ${kind} seed ${seed}`).toEqual(alone.bars.map((b) => b.length === 0));
      }
    }
  });

  it('a vocal at 0.9 never thins the demo\'s strokes, routines included: boomBap chorus MUSICAL plays the same demo plan', () => {
    let n = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const at = (v: number) => planScratch(scenarioContext({ style: 'boomBap', kind: 'chorus', bpm: 92, energy: 0.6, vocal: v }), { mode: 'MUSICAL', seed, fromBar: 16, bars: 32, routine: 'auto' })
        .events.filter((e) => e.layer === 'demo').map((e) => `${e.bar}:${e.step}:${e.gesture}`);
      expect(at(0.9), `seed ${seed}`).toEqual(at(0));
      n += at(0).length;
    }
    expect(n).toBeGreaterThan(100);
  });
});

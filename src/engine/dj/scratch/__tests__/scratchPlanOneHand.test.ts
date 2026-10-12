/**
 * Audit SA-B1 (thoughts/shared/research/2026-10-12_scratch-work-audit.md; owner scratch plan
 * sections 8, 21, 83): one hand on one deck performs one gesture at a time. Before the fix the
 * planner put two gestures on step 15 (the reference clamps its 16 to 15) and adjacent
 * sixteenths 6/7/8 under gestures 2-4 steps long: boomBap MUSICAL 13 same-beat and 160
 * overlapping pairs over 40 seeds x 32 bars, battle 811 same-beat. The executor would fire both
 * and the first one's disengage would stop the second mid-stroke.
 *
 * P13 (owner 2026-10-12): the demo sums both strokes and its plan is played as it is (every stroke is a
 * render on the bus now, PG-J: two strokes overlap as the demo's do). One hand governs the DEViLBOX
 * extras on top: an extra never starts inside, or runs into, any sounding stroke.
 */
import { describe, it, expect } from 'vitest';
import { planScratch } from '../scratchPlanner';
import { planPhrase, planVocabulary, overlapsOneHand, validatePhrase, type PlacedScratch } from '../scratchPlacement';
import { scenarioContext } from './fixtures/scenarioContext';
import type { SectionKind } from '../../autodj/types';
import type { ScratchDJStyle } from '../scratchTypes';
import type { ScratchMode } from '../scratchStyles';

const CASES: Array<{ style: ScratchDJStyle; kind: SectionKind; mode: ScratchMode; extras?: true }> = [
  { style: 'boomBap', kind: 'groove', mode: 'MUSICAL' },
  { style: 'boomBap', kind: 'verse', mode: 'PERFORMER', extras: true },
  { style: 'electro', kind: 'drop', mode: 'PERFORMER' },
  { style: 'battle', kind: 'instrumental', mode: 'BATTLE' },
];

describe('one hand performs one gesture at a time (SA-B1)', () => {
  for (const c of CASES) {
    it(`${c.style} ${c.kind} ${c.mode}: every demo stroke plays; no extra starts with or inside another stroke (40 seeds x 32 bars)`, () => {
      let demo = 0, extras = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const ctx = scenarioContext({ style: c.style, kind: c.kind, bpm: 100, energy: 0.8 });
        const plan = planScratch(ctx, { mode: c.mode, seed, fromBar: 16, bars: 32, densityShift: 1 });
        const alone = planScratch(ctx, { mode: c.mode, seed, fromBar: 16, bars: 32, extras: false });
        const key = (e: PlacedScratch) => `${e.bar}:${e.step}:${e.gesture}:${e.velocity}`;
        expect(plan.events.filter((e) => e.layer === 'demo').map(key), `seed ${seed}`).toEqual(alone.events.map(key));
        for (const e of plan.events.filter((x) => x.layer === 'extra')) {
          extras++;
          expect(plan.events.filter((o) => o !== e && overlapsOneHand(o, e)).length, `seed ${seed} bar ${e.bar} step ${e.step}`).toBe(0);
        }
        demo += alone.events.length;
      }
      expect(demo).toBeGreaterThan(40); // the plans are not trivially empty
      if (c.extras) expect(extras).toBeGreaterThan(0); // the escalation adds strokes on top of a sparse section
    });
  }

  it('the demo\'s own placement sums two strokes on step 15 when it plans two (plan_phrase clamps its 16)', () => {
    const gestures = planVocabulary('battle', 'BATTLE');
    let doubled = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const bar = planPhrase({ style: 'battle', section: 'showcase', bar: 15, bars: 16, seed, gestures, demo: true });
      if (bar.length >= 2) { expect(bar.slice(0, 2).map((e) => e.step)).toEqual([15, 15]); doubled++; }
    }
    expect(doubled).toBeGreaterThan(0);
  });

  it('the reference step 16 is never planned onto step 15: a showcase phrase end places one turnaround', () => {
    const gestures = planVocabulary('battle', 'BATTLE');
    for (let seed = 1; seed <= 200; seed++) {
      const bar = planPhrase({ style: 'battle', section: 'showcase', bar: 15, bars: 16, seed, gestures });
      expect(bar.filter((e) => e.step === 15).length, `seed ${seed}`).toBeLessThanOrEqual(1);
      expect(bar.every((e) => e.step < 16)).toBe(true);
    }
  });

  it('validation reports overlapping gestures (routines are checked by the same rule)', () => {
    const ev = (step: number): PlacedScratch => ({ bar: 0, step, beat: step / 4, gesture: 'baby', velocity: 0.8, placementRole: 'accent', role: 'ACCENT' });
    expect(validatePhrase([[ev(6), ev(7)]]).join(' ')).toMatch(/one hand/); // baby is 2 steps (the reference)
    expect(validatePhrase([[ev(0), ev(4)]]).join(' ')).not.toMatch(/one hand/);
  });
});

/**
 * Audit SA-B1 (thoughts/shared/research/2026-10-12_scratch-work-audit.md; owner scratch plan
 * sections 8, 21, 83): one hand on one deck performs one gesture at a time. Before the fix the
 * planner put two gestures on step 15 (the reference clamps its 16 to 15) and adjacent
 * sixteenths 6/7/8 under gestures 2-4 steps long: boomBap MUSICAL 13 same-beat and 160
 * overlapping pairs over 40 seeds x 32 bars, battle 811 same-beat. The executor would fire both
 * and the first one's disengage would stop the second mid-stroke.
 */
import { describe, it, expect } from 'vitest';
import { planScratch } from '../scratchPlanner';
import { planPhrase, planVocabulary, oneHandConflicts, validatePhrase, placedEnd, type PlacedScratch } from '../scratchPlacement';
import { scenarioContext } from './fixtures/scenarioContext';
import type { SectionKind } from '../../autodj/types';
import type { ScratchDJStyle } from '../scratchTypes';
import type { ScratchMode } from '../scratchStyles';

const CASES: Array<{ style: ScratchDJStyle; kind: SectionKind; mode: ScratchMode }> = [
  { style: 'boomBap', kind: 'groove', mode: 'MUSICAL' },
  { style: 'electro', kind: 'drop', mode: 'PERFORMER' },
  { style: 'battle', kind: 'instrumental', mode: 'BATTLE' },
];

function sameBeatPairs(events: readonly PlacedScratch[]): number {
  let n = 0;
  for (let i = 0; i < events.length; i++) for (let j = i + 1; j < events.length; j++) if (Math.abs(events[i]!.beat - events[j]!.beat) < 1e-9) n++;
  return n;
}

describe('one hand performs one gesture at a time (SA-B1)', () => {
  for (const c of CASES) {
    it(`${c.style} ${c.kind} ${c.mode}: no two planned scratches start together or overlap (40 seeds x 32 bars)`, () => {
      let events = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const plan = planScratch(scenarioContext({ style: c.style, kind: c.kind, bpm: 100, energy: 0.8 }), { mode: c.mode, seed, fromBar: 16, bars: 32 });
        events += plan.events.length;
        expect(sameBeatPairs(plan.events), `seed ${seed}`).toBe(0);
        expect(oneHandConflicts(plan.events), `seed ${seed}`).toBe(0);
        for (let k = 1; k < plan.events.length; k++) expect(plan.events[k]!.beat).toBeGreaterThanOrEqual(placedEnd(plan.events[k - 1]!) - 1e-9);
      }
      expect(events).toBeGreaterThan(40); // the plans are not trivially empty
    });
  }

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
    expect(validatePhrase([[ev(6), ev(8)]]).join(' ')).toMatch(/one hand/);
    expect(validatePhrase([[ev(0), ev(4)]]).join(' ')).not.toMatch(/one hand/);
  });
});

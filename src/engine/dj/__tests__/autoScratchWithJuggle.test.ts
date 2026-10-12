/**
 * Scratch beside a running juggle (owner scratch plan sections 26, 49; ledger SCR-P7.9), through
 * the controller's entry `DJScratchDJ.tick()` with `juggleActive` (what DJAutoDJ.scratchTick passes
 * while the juggle controller performs): the decks are the juggle's - every scratch event is a crate
 * record on the record voice, only answers and accents, never a feature; no scratch gesture touches
 * the crossfader (the juggle sink owns it); the same set without a juggle plays its full phrases.
 */
import { describe, it, expect } from 'vitest';
import { DJScratchDJ } from '../scratch/DJScratchDJ';
import { corpusAnalysis } from '../autodj/testing/corpus';
import { timeAtBeat, barStartBeat } from '../autodj/beatGrid';
import { fieldsTouchedBy } from '../scratch/scratchSnapshot';
import { getGesture } from '../scratch/scratchGestureCatalog';
import type { DJPerformanceContext } from '../autodj/types';
import type { ScratchEvent } from '../scratch/scratchTypes';
import { scratchDJStats } from '../scratch/DJScratchDJ';

type Shape = Parameters<DJScratchDJ['tick']>[0]['juggleShape'];

function run(juggleActive: boolean, opts: { shape?: Shape; permission?: number } = {}) {
  const track = corpusAnalysis('steady');
  const events: ScratchEvent[] = [];
  const plans: NonNullable<DJScratchDJ['lastPlan']>[] = [];
  const ctrl = new DJScratchDJ({ seed: 4, executorFor: () => ({ schedule: (e) => { events.push(e); }, cancel: () => {}, active: 0 }) });
  for (let b = 0; b < track.downbeats.bars.length - 1; b++) for (const f of [0.1, 0.6]) {
    const t = timeAtBeat(track.beatGrid, barStartBeat(track.downbeats, b)) + f;
    ctrl.tick({
      perf: { currentDeck: 'A', currentTrack: track, incomingTrack: null, currentPosition: t, setPhase: 'PEAK', setEnergy: 0.8, targetEnergy: 0.9 } as unknown as DJPerformanceContext,
      deck: 'A', mode: 'PERFORMER', style: 'electro', genreHint: 'house', scratchPermission: opts.permission ?? 2, juggleActive, juggleShape: opts.shape,
    });
    if (ctrl.lastPlan?.routine === 'juggleResponse' && !plans.includes(ctrl.lastPlan)) plans.push(ctrl.lastPlan);
  }
  return { events, ctrl, plans, track };
}

describe('scratch beside a juggle (SCR-P7.9)', () => {
  it('under a juggle: crate records only, answers and accents only, no feature, never the crossfader', () => {
    // the demo plays no scratch while the hands juggle (three_deck: Deck C is out); the overlay keeps only
    // its answers and accents, so a sparse set may keep none at all - the controller still plans every window
    const plans = scratchDJStats.plans;
    const { events, ctrl } = run(true);
    expect(scratchDJStats.plans).toBeGreaterThan(plans);
    for (const e of events) {
      expect(e.source.type, e.gesture).toBe('CRATE');
      if (e.gesture !== 'drop' && e.gesture !== 'dropPhrase') expect(['ANSWER', 'ACCENT']).toContain(e.role);
      expect(fieldsTouchedBy(e.source.type, getGesture(e.gesture).faderWindows)).not.toContain('crossfader');
    }
    expect(ctrl.states.history.some((h) => h.to === 'FEATURE')).toBe(false);
  });

  it('without a juggle the same set plays its full phrases (the restriction belongs to the juggle)', () => {
    const { events } = run(false);
    expect(events.some((e) => e.gesture !== 'drop' && e.gesture !== 'dropPhrase' && e.role !== 'ANSWER' && e.role !== 'ACCENT')).toBe(true);
  });

  // Section 49 (the juggle response): a juggle over bars 8-15 - ESTABLISH 2 bars, the A/B trade (PEAK) 4 bars,
  // the A+B payoff 2 bars - with two hands free: the scratch vocal over the loops, a response in each
  // trade bar (the reference call / response: even step 6, odd step 14), out for the payoff.
  const shapeAt = (track: ReturnType<typeof corpusAnalysis>) => ({
    startBeat: barStartBeat(track.downbeats, 8),
    phases: [{ phase: 'ESTABLISH' as const, startBeat: 0, endBeat: 8 }, { phase: 'PEAK' as const, startBeat: 8, endBeat: 24 }, { phase: 'PAYOFF' as const, startBeat: 24, endBeat: 32 }],
  });

  it('juggleResponse: the scratch vocal over the loops, a response per trade bar, nothing in the payoff', () => {
    const before = scratchDJStats.juggleResponses;
    const { plans } = run(true, { shape: shapeAt(corpusAnalysis('steady')) });
    expect(scratchDJStats.juggleResponses - before).toBeGreaterThanOrEqual(1);
    const evs = plans.flatMap((p) => p.events).filter((e) => e.bar >= 8 && e.bar < 16);
    const at = (bar: number) => evs.filter((e) => e.bar === bar);
    for (const bar of [8, 9]) expect(at(bar).map((e) => [e.step, e.role])).toEqual([[2, 'THEME'], [10, 'THEME']]);
    expect(at(10).map((e) => [e.step, e.role, e.velocity])).toEqual([[6, 'ANSWER', 0.72]]);
    expect(at(11).map((e) => [e.step, e.role, e.velocity])).toEqual([[14, 'ACCENT', 0.75]]);
    expect(at(12).map((e) => e.step)).toEqual([6]);
    expect(at(13).map((e) => e.step)).toEqual([14]);
    expect(at(14)).toEqual([]);
    expect(at(15)).toEqual([]);
  });

  it('juggleResponse needs two hands: with one hand left the scratch only answers and accents', () => {
    const before = scratchDJStats.juggleResponses;
    const { plans, events } = run(true, { shape: shapeAt(corpusAnalysis('steady')), permission: 1 });
    expect(scratchDJStats.juggleResponses - before).toBe(0);
    expect(plans).toHaveLength(0);
    for (const e of events) if (e.gesture !== 'drop' && e.gesture !== 'dropPhrase') expect(['ANSWER', 'ACCENT']).toContain(e.role);
  });
});

/**
 * Scratch beside a running juggle (owner scratch plan sections 26, 49; ledger SCR-P7.9), through
 * the controller's entry `DJScratchDJ.tick()` with `juggleActive` (what DJAutoDJ.scratchTick passes
 * while the juggle controller performs): the decks are the juggle's - every scratch event is a crate
 * record rendered the demo's way on its section's overlay bus (PG-J), never a feature; no scratch gesture touches
 * the crossfader (the juggle sink owns it); the same set without a juggle plays its full phrases.
 * P13 (owner 2026-10-12): the demo's overlay strokes play under the juggle as the demo plans them; the
 * restriction (answers and accents only) and the juggle response are DEViLBOX extras on top.
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
import { DEMO_PROFILES } from '../scratch/scratchRender';
import { overlapsOneHand } from '../scratch/scratchPlacement';

type Shape = Parameters<DJScratchDJ['tick']>[0]['juggleShape'];

function run(juggleActive: boolean, opts: { shape?: Shape; permission?: number } = {}) {
  const track = corpusAnalysis('steady');
  const events: ScratchEvent[] = [];
  const plans: NonNullable<DJScratchDJ['lastPlan']>[] = [];
  const all: NonNullable<DJScratchDJ['lastPlan']>[] = [];
  const ctrl = new DJScratchDJ({ seed: 4, executorFor: () => ({ schedule: (e) => { events.push(e); }, cancel: () => {}, active: 0 }) });
  for (let b = 0; b < track.downbeats.bars.length - 1; b++) for (const f of [0.1, 0.6]) {
    const t = timeAtBeat(track.beatGrid, barStartBeat(track.downbeats, b)) + f;
    ctrl.tick({
      perf: { currentDeck: 'A', currentTrack: track, incomingTrack: null, currentPosition: t, setPhase: 'PEAK', setEnergy: 0.8, targetEnergy: 0.9 } as unknown as DJPerformanceContext,
      deck: 'A', mode: 'PERFORMER', style: 'electro', genreHint: 'house', scratchPermission: opts.permission ?? 2, juggleActive, juggleShape: opts.shape,
    });
    if (ctrl.lastPlan?.routine === 'juggleResponse' && !plans.includes(ctrl.lastPlan)) plans.push(ctrl.lastPlan);
    if (ctrl.lastPlan && !all.includes(ctrl.lastPlan)) all.push(ctrl.lastPlan);
  }
  // the scheduled strokes of every plan with their layer (the demo's or a DEViLBOX extra)
  const placed = all.flatMap((p) => p.events);
  return { events, ctrl, plans, track, placed };
}

describe('scratch beside a juggle (SCR-P7.9)', () => {
  it('under a juggle: crate records only, the demo\'s strokes as planned, the extras answers and accents only, no feature, never the crossfader', () => {
    const plans = scratchDJStats.plans;
    const { events, ctrl, placed } = run(true);
    const free = run(false).placed;
    expect(scratchDJStats.plans).toBeGreaterThan(plans);
    const key = (e: { bar: number; step: number; gesture: string }) => `${e.bar}:${e.step}:${e.gesture}`;
    expect(placed.filter((e) => e.layer === 'demo').map(key)).toEqual(free.filter((e) => e.layer === 'demo').map(key));
    expect(placed.some((e) => e.layer === 'demo')).toBe(true);
    for (const e of placed.filter((x) => x.layer !== 'demo')) if (e.gesture !== 'drop' && e.gesture !== 'dropPhrase') expect(['ANSWER', 'ACCENT']).toContain(e.role);
    for (const e of events) {
      expect(e.source.type, e.gesture).toBe('CRATE');
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
    const { plans, events } = run(true, { shape: shapeAt(corpusAnalysis('steady')) });
    expect(scratchDJStats.juggleResponses - before).toBeGreaterThanOrEqual(1);
    // PG-J: every response stroke renders the demo's way on its section's overlay bus - the electro profile's deck and
    // FX, the physics seed (seed + section start) x 3 + bar x 16 + step, no human timing (DEViLBOX's own strokes);
    // P13: on top of the demo's overlay strokes, which keep theirs
    const response = plans.flatMap((p) => p.events).filter((e) => e.layer === 'extra' && e.bar >= 8 && e.bar < 16);
    expect(response.length).toBeGreaterThan(0);
    for (const e of response) {
      expect(e.render?.chain, e.gesture).toBe('overlay');
      expect(e.render!.deck).toBe('electro');
      expect(e.render!.section!.fx).toEqual(DEMO_PROFILES.electro.fx);
      expect(e.render!.humanizeSamples).toBe(0);
    }
    for (const e of events) if (e.render) expect(e.humanizeMs).toBe(0);
    expect(plans.some((p) => p.events.some((e) => e.layer === 'demo'))).toBe(true);
    const evs = response;
    const at = (bar: number) => evs.filter((e) => e.bar === bar);
    // the response as written (bars 8-9 the vocal, 10-13 a response per trade bar: even step 6, odd 14, none in the
    // payoff), each stroke kept unless one hand finds a demo stroke sounding there (P13: the demo's wins)
    const demo = plans.flatMap((p) => p.events).filter((e) => e.layer === 'demo');
    const expected: Array<[number, number, string, number?]> = [[8, 2, 'THEME'], [8, 10, 'THEME'], [9, 2, 'THEME'], [9, 10, 'THEME'], [10, 6, 'ANSWER', 0.72], [11, 14, 'ACCENT', 0.75], [12, 6, 'ANSWER'], [13, 14, 'ACCENT']];
    let kept = 0;
    for (const [bar, step, role, velocity] of expected) {
      const e = at(bar).find((x) => x.step === step);
      if (!e) { expect(demo.some((d) => overlapsOneHand(d, { beat: bar * 4 + step / 4, gesture: 'baby' })), `bar ${bar} step ${step}`).toBe(true); continue; }
      kept++;
      expect(e.role).toBe(role);
      if (velocity !== undefined) expect(e.velocity).toBe(velocity);
    }
    expect(kept).toBeGreaterThanOrEqual(4);
    expect(evs.length).toBe(kept);
    expect(at(14)).toEqual([]);
    expect(at(15)).toEqual([]);
  });

  it('juggleResponse needs two hands: with one hand left the scratch only answers and accents', () => {
    const before = scratchDJStats.juggleResponses;
    const { plans, placed } = run(true, { shape: shapeAt(corpusAnalysis('steady')), permission: 1 });
    expect(scratchDJStats.juggleResponses - before).toBe(0);
    expect(plans).toHaveLength(0);
    for (const e of placed.filter((x) => x.layer !== 'demo')) if (e.gesture !== 'drop' && e.gesture !== 'dropPhrase') expect(['ANSWER', 'ACCENT']).toContain(e.role);
  });
});

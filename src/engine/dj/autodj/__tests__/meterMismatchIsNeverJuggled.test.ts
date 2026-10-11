/**
 * Audit JA-M6 (thoughts/shared/research/2026-10-11_juggling-sonnet-work-audit.md, M6): nothing compared
 * the two decks' meters before a juggle. A 3/4 module into a 4/4 track got a juggle transition whose
 * rungs were counted in 4-beat bars, the 3/4 deck drifting a beat per bar against the cuts. Owner
 * juggling plan sections 25 (bad timing) and 56 (the meter is consulted): different meters -> no
 * juggle, a normal transition. One gate (meterMismatch) for the transition planner and the juggle
 * layer's conditions (in-mix and stand-alone juggles, the trade stage's re-check).
 */
import { describe, it, expect } from 'vitest';
import { corpusAnalysis } from '../testing/corpus';
import { planTransition, type TransitionPlanInput } from '../transitionPlanner';
import { getStyle } from '../styleProfiles';
import { DJSessionMemory } from '../sessionMemory';
import { DJJuggleController, type TickInput } from '../juggle/juggleController';
import { conditions } from '../juggle/jugglePlanner';
import type { DJTrackAnalysis } from '../types';

function pair(incomingBeatsPerBar: number): { o: DJTrackAnalysis; i: DJTrackAnalysis } {
  const o = structuredClone(corpusAnalysis('steady'));
  const i = structuredClone(corpusAnalysis('compatibleKey'));
  i.meter.beatsPerBar = incomingBeatsPerBar;
  return { o, i };
}

function plan(incomingBeatsPerBar: number) {
  const { o, i } = pair(incomingBeatsPerBar);
  const input: TransitionPlanInput = {
    outgoing: o, incoming: i, outgoingDeck: 'A', incomingDeck: 'B', outgoingPosition: 10, style: getStyle('Club'),
    creativeRisk: 0.6, memory: new DJSessionMemory().snapshot(), userBars: 8, withFilter: true, smartCuts: false,
    setPhase: 'PEAK', targetEnergy: 0.8, leadSec: 1, seed: 3, juggleMode: 'PERFORMER',
  };
  return planTransition(input);
}

function badConditions(incomingBeatsPerBar: number): string[] {
  const { o, i } = pair(incomingBeatsPerBar);
  const controller = new DJJuggleController({
    sink: { apply: () => {}, state: () => ({ crossfader: 0, playing: { A: true, B: true }, audible: { A: true, B: false }, loops: { A: false, B: false } }), restore: () => {} },
    clockFor: () => ({ beatNow: () => 0, beatSec: () => 0.5 }),
    positionOf: () => 40,
    now: () => 1_000_000,
  });
  const input: TickInput = {
    masterDeck: 'A',
    decks: {
      A: { trackId: 'steady.wav', analysis: o, positionSec: 40, playing: true, bpm: o.bpm },
      B: { trackId: 'waltz.mod', analysis: i, positionSec: 40, playing: true, bpm: o.bpm },
    },
    setPhase: 'PEAK', energy: 0.7, targetEnergy: 0.8, performanceMode: 'JUGGLE', transitionApproachingSec: null,
  };
  return conditions(controller.buildContext(input)).bad;
}

describe('JA-M6: two decks in different meters are never juggled', () => {
  it('a 3/4 incoming after a 4/4 track gets a normal transition, not a juggle transition', () => {
    // The same pair in one meter is a juggle transition (PERFORMER at the peak).
    expect(plan(4).style).toBe('juggleTransition');
    const p = plan(3);
    expect(p.style).not.toBe('juggleTransition');
    expect(p.juggle).toBeUndefined();
    expect(p.reasons.some((r) => r.includes('meters differ (4 against 3 beats per bar): normal transition'))).toBe(true);
  });

  it('a 3/4 deck against a 4/4 deck is a bad condition for an in-mix juggle and for the trade stage', () => {
    expect(badConditions(4).some((r) => r.startsWith('meters differ'))).toBe(false);
    expect(badConditions(3)).toContain('meters differ (4 against 3 beats per bar)');
  });
});

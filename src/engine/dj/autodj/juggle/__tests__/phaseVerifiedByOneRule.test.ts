/**
 * JA-PHASE-ONE: the juggle layer verified bar phase with two copies of one rule and of its 5 ms
 * constant - the ladder's gate in juggleController (LADDER_PHASE_VERIFIED_SEC) and the double layer's
 * gate in juggleExecutor (PHASE_VERIFIED_SEC) - free to drift apart. Owner plan section 16: one
 * verification. Both gates, and the stand-alone double's setup, now ask phaseVerification's
 * phaseUnverified.
 *
 * Behaviour: (1) at the tolerance's edge (PHASE_VERIFIED_SEC +- 2 %) the ladder answers with the
 * incoming exactly when the double layers its copy; (2) with the rule's verdict overridden (the real
 * measurement says "in phase", the rule says "not") the ladder never cuts to the incoming, the double
 * never layers, and the stand-alone double is not verified - each obeys the one rule, not its own
 * copy of it. Virtual clock, recording sinks, no audio.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const holder = vi.hoisted(() => ({ override: null as null | ((deck: 'A' | 'B') => string | null) }));
vi.mock('../phaseVerification', async (orig) => {
  const actual = await orig<typeof import('../phaseVerification')>();
  return { ...actual, phaseUnverified: (...args: Parameters<typeof actual.phaseUnverified>) => (holder.override ? holder.override(args[1]) : actual.phaseUnverified(...args)) };
});
vi.mock('@/engine/dj/DJEngine', () => ({ getDJEngine: () => { throw new Error('no engine'); }, getDJEngineIfActive: () => null }));

import { VirtualTimers } from '../../testing/setSimulator';
import { corpusAnalysis } from '../../testing/corpus';
import { executeJuggle, type JuggleActionSink, type SinkState } from '../juggleExecutor';
import { DJJuggleController, analysisClock, type TickInput } from '../juggleController';
import { double, type PatternParams } from '../jugglePatterns';
import { PHASE_VERIFIED_SEC } from '../phaseVerification';
import { idleBarPhaseVerified } from '../standaloneJuggle';
import type { DJJuggleAction } from '../juggleTypes';

const BEAT_SEC = 60 / 126;

function recordingSink(phaseErrorSec: number) {
  let crossfader = 0;
  const applied: Array<{ action: DJJuggleAction; crossfader: number }> = [];
  const sink: JuggleActionSink & { applied: typeof applied } = {
    applied,
    state(): SinkState { return { crossfader, playing: { A: true, B: true }, audible: { A: crossfader < 0.999, B: crossfader > 0.001 }, loops: { A: false, B: false } }; },
    apply(action) {
      if (action.type === 'CutIn' || action.type === 'ReleaseDeck') crossfader = action.deck === 'A' ? 0 : action.deck === 'B' ? 1 : 0.5;
      if (action.type === 'CutOut') crossfader = action.deck === 'A' ? 1 : action.deck === 'B' ? 0 : 0.5;
      if (action.type === 'HoldDeck') crossfader = 0.5;
      applied.push({ action, crossfader });
    },
    phaseError: (deck) => (deck === 'B' ? phaseErrorSec : 0),
  };
  return sink;
}

/** The ladder gate: the controller's juggle-transition ladder onto deck B. Did B get a cut? */
async function ladderAnswers(phaseErrorSec: number): Promise<boolean> {
  const timers = new VirtualTimers();
  const sink = recordingSink(phaseErrorSec);
  const analyses = { A: corpusAnalysis('steady'), B: corpusAnalysis('compatibleKey') };
  const start = { A: 15.2381, B: 0 };
  const pos = (d: 'A' | 'B') => start[d] + timers.now() / 1000;
  const c = new DJJuggleController({ sink, timers, now: () => timers.now(), positionOf: pos, seed: 1, clockFor: (_d, a, p) => analysisClock(a, p) });
  c.setMode('PERFORMER');
  const input: TickInput = {
    masterDeck: 'A', setPhase: 'PEAK', energy: 0.7, targetEnergy: 0.8, performanceMode: 'JUGGLE_TRANSITION', transitionApproachingSec: null,
    decks: {
      A: { trackId: 'steady', analysis: analyses.A, positionSec: pos('A'), playing: true, bpm: analyses.A.bpm },
      B: { trackId: 'compatibleKey', analysis: analyses.B, positionSec: pos('B'), playing: true, bpm: analyses.B.bpm },
    },
  };
  const done = c.performLadder(input, { ladderBars: [4, 2, 1, 1], target: 'B' });
  await timers.run(80_000);
  const r = await done;
  expect(r.reason).not.toMatch(/not performed/);
  return sink.applied.some((a) => a.action.type === 'CutIn' && a.action.deck === 'B');
}

/** The double-layer gate: the executor's governor on the double's payoff. Did the copy get layered? */
async function doubleLayers(phaseErrorSec: number): Promise<boolean> {
  const timers = new VirtualTimers();
  const sink = recordingSink(phaseErrorSec);
  const params: PatternParams = { primary: 'A', beatsPerBar: 4, intensity: 0.7, phraseBars: 8, confidence: 0.9, minRung: 2, double: { offsetBeats: 4, primaryPosition: 20 } };
  const pattern = double(params);
  const exec = executeJuggle(pattern, 8, { clock: { beatNow: () => timers.now() / 1000 / BEAT_SEC, beatSec: () => BEAT_SEC }, sink, timers, tickMs: 15 });
  await timers.run((8 + pattern.durationBars * 4 + 8) * BEAT_SEC * 1000);
  await exec.done;
  return sink.applied.some((a) => a.action.type === 'HoldDeck');
}

describe('JA-PHASE-ONE: the ladder gate, the double layer and the stand-alone setup verify phase with one rule', () => {
  afterEach(() => { holder.override = null; });

  it('at the tolerance\'s edge the ladder answers with the incoming exactly when the double layers its copy', async () => {
    const inside = PHASE_VERIFIED_SEC * 0.98, outside = PHASE_VERIFIED_SEC * 1.02;
    expect(await ladderAnswers(inside)).toBe(true);
    expect(await doubleLayers(inside)).toBe(true);
    expect(await ladderAnswers(outside)).toBe(false);
    expect(await doubleLayers(outside)).toBe(false);
  });

  it('the one rule decides: measured in phase but ruled unverified, no gate lets the deck be heard', async () => {
    expect(await ladderAnswers(0)).toBe(true);
    expect(await doubleLayers(0)).toBe(true);
    holder.override = (deck) => `deck ${deck} ruled out`;
    expect(await ladderAnswers(0)).toBe(false);
    expect(await doubleLayers(0)).toBe(false);
    expect(idleBarPhaseVerified('B')).toBe(false);
    holder.override = () => null;
    expect(idleBarPhaseVerified('B')).toBe(true);
  });
});

/**
 * Stand-alone juggle triggers (plan 2026-10-11-dj-juggling, JUGX-P4.1): with
 * one deck playing, `juggleOpportunity` judges the master as if the idle deck
 * held a phase-locked double - the planner's own budget, conditions and
 * confidence policy decide - and needs a musical moment within the next
 * phrase: a breakdown or a build ahead, the end of a phrase, or an energy lift.
 * Corpus analyses, the controller's own context builder.
 */
import { describe, it, expect } from 'vitest';
import { corpusAnalysis, type CorpusId } from '../../testing/corpus';
import { DJJuggleController, type TickInput } from '../juggleController';
import { juggleOpportunity } from '../juggleOpportunity';
import type { DJJugglePerformanceContext, JuggleMode } from '../juggleTypes';
import type { SetEnergyPhase } from '../../types';

function contextFor(id: CorpusId, positionSec: number, opts: { setPhase?: SetEnergyPhase; energy?: number; targetEnergy?: number; transitionApproachingSec?: number | null; idle?: { id: CorpusId; positionSec: number } } = {}): DJJugglePerformanceContext {
  const now = 1_000_000;
  const controller = new DJJuggleController({
    sink: { apply: () => {}, state: () => ({ crossfader: 0, playing: { A: true, B: false }, audible: { A: true, B: false }, loops: { A: false, B: false } }), restore: () => {} },
    clockFor: () => ({ beatNow: () => 0, beatSec: () => 0.5 }),
    positionOf: () => positionSec,
    now: () => now,
  });
  const a = corpusAnalysis(id);
  const input: TickInput = {
    masterDeck: 'A',
    decks: {
      A: { trackId: `${id}.wav`, analysis: a, positionSec, playing: true, bpm: a.bpm },
      B: opts.idle ? { trackId: `${opts.idle.id}.wav`, analysis: corpusAnalysis(opts.idle.id), positionSec: opts.idle.positionSec, playing: true, bpm: a.bpm } : { trackId: '', analysis: null, positionSec: 0, playing: false, bpm: 0 },
    },
    setPhase: opts.setPhase ?? 'CRUISING', energy: opts.energy ?? 0.6, targetEnergy: opts.targetEnergy ?? 0.65,
    performanceMode: 'JUGGLE', transitionApproachingSec: opts.transitionApproachingSec === undefined ? 400 : opts.transitionApproachingSec,
  };
  return controller.buildContext(input);
}

function judge(ctx: DJJugglePerformanceContext, mode: JuggleMode = 'MUSICAL', next: Parameters<typeof juggleOpportunity>[2] = null) {
  const why: string[] = [];
  const op = juggleOpportunity(ctx, mode, next, why);
  return { op, why };
}

describe('juggleOpportunity: a stand-alone juggle where the music asks for one', () => {
  it('a build within the next phrase (drops, build at 59 s, from 50 s): a double, starting on a phrase', () => {
    const { op, why } = judge(contextFor('drops', 50));
    expect(op, why.join('; ')).not.toBeNull();
    expect(op!.trigger).toBe('build');
    expect(op!.source).toBe('double');
    const ctx = contextFor('drops', 50);
    expect(op!.startBeat).toBeGreaterThan(ctx.masterBeat);
    expect(op!.reason).toContain('build');
  });

  it('a breakdown within the next phrase (breakdowns, break at 30.7 s, from 20 s)', () => {
    const { op, why } = judge(contextFor('breakdowns', 20));
    expect(op, why.join('; ')).not.toBeNull();
    expect(op!.trigger).toBe('break');
  });

  it('the last quarter of a phrase with no section change ahead (steady, phrase 0-15.2 s, at 12 s)', () => {
    const { op, why } = judge(contextFor('steady', 12));
    expect(op, why.join('; ')).not.toBeNull();
    expect(op!.trigger).toBe('phraseEnd');
  });

  it('the set needs energy (target 0.2 above the energy), early in a phrase', () => {
    const { op, why } = judge(contextFor('steady', 3, { energy: 0.6, targetEnergy: 0.8 }));
    expect(op, why.join('; ')).not.toBeNull();
    expect(op!.trigger).toBe('energy');
  });

  it('no musical moment ahead: null, and says so', () => {
    const { op, why } = judge(contextFor('steady', 3, { energy: 0.6, targetEnergy: 0.62 }));
    expect(op).toBeNull();
    expect(why.join('; ')).toMatch(/no musical moment/);
  });

  it('OPENING and RECOVERY: null with the set-phase budget reason', () => {
    for (const setPhase of ['OPENING', 'RECOVERY'] as const) {
      const { op, why } = judge(contextFor('drops', 50, { setPhase }));
      expect(op, setPhase).toBeNull();
      expect(why.join('; '), setPhase).toContain(`set phase ${setPhase}`);
    }
  });

  it('Auto Juggle off: null', () => {
    const { op, why } = judge(contextFor('drops', 50), 'OFF');
    expect(op).toBeNull();
    expect(why.join('; ')).toContain('Auto Juggle off');
  });

  it('cooldown not elapsed (CRUISING, MUSICAL: 180 s; 60 s since the last juggle): null with the cooldown left', () => {
    const ctx = { ...contextFor('drops', 50), secondsSinceLastJuggle: 60 };
    const { op, why } = judge(ctx);
    expect(op).toBeNull();
    expect(why.join('; ')).toContain('cooldown 120 s left');
  });

  it('a transition too close for the setup, the pattern and 30 s of margin: null', () => {
    // 40 s: the planner itself would still allow a pattern (not "imminent"); the stand-alone guard does not.
    const { op, why } = judge(contextFor('drops', 50, { transitionApproachingSec: 40 }));
    expect(op).toBeNull();
    expect(why.join('; ')).toMatch(/transition in 40 s/);
    // No planned transition at all: allowed.
    expect(judge(contextFor('drops', 50, { transitionApproachingSec: null })).op).not.toBeNull();
  });

  it('the pre-rendered next track is teased only when compatible and the transition is at most 180 s away', () => {
    const next = { analysis: corpusAnalysis('compatibleKey'), compatible: true, pair: contextFor('drops', 50, { transitionApproachingSec: 150, idle: { id: 'compatibleKey', positionSec: 0 } }) };
    expect(judge(contextFor('drops', 50, { transitionApproachingSec: 150 }), 'MUSICAL', next).op?.source).toBe('next');
    expect(judge(contextFor('drops', 50, { transitionApproachingSec: 200 }), 'MUSICAL', next).op?.source).toBe('double');
    expect(judge(contextFor('drops', 50, { transitionApproachingSec: 150 }), 'MUSICAL', { ...next, compatible: false }).op?.source).toBe('double');
    expect(judge(contextFor('drops', 50, { transitionApproachingSec: 150 }), 'MUSICAL', null).op?.source).toBe('double');
  });

  it('the pair that would play is judged by the planner (owner plan section 25): a key clash or an unjudged pair means the double', () => {
    // The heard key of the next track at its cue against the master's A minor: F# major is a clash at high confidence.
    const pairCtx = contextFor('drops', 50, { transitionApproachingSec: 150, idle: { id: 'clashKey', positionSec: 0 } });
    const clash = { analysis: corpusAnalysis('clashKey'), compatible: true, pair: { ...pairCtx, deckB: { ...pairCtx.deckB, key: 'F# major', keyConfidence: 0.95 } } };
    const r = judge(contextFor('drops', 50, { transitionApproachingSec: 150 }), 'MUSICAL', clash);
    expect(r.op?.source).toBe('double');
    expect(r.why.join('; ')).toMatch(/no tease of the next track: key clash/);
    const unjudged = judge(contextFor('drops', 50, { transitionApproachingSec: 150 }), 'MUSICAL', { analysis: corpusAnalysis('compatibleKey'), compatible: true });
    expect(unjudged.op?.source).toBe('double');
  });

  it('too little energy for the double the mode allows (MUSICAL: double only, needs intensity >= 0.45): null with the planner reason', () => {
    const { op, why } = judge(contextFor('drops', 50, { energy: 0.05, targetEnergy: 0.06 }));
    expect(op).toBeNull();
    expect(why.join('; ')).toMatch(/no pattern fits/);
  });
});

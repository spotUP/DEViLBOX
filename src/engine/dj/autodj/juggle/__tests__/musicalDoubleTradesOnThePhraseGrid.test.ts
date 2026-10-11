/**
 * Audit JA-M3 (2026-10-11 juggling audit; owner plan sections 9, 44, 47): the
 * MUSICAL stand-alone double was 9 bars - a SETUP bar on the phrase start,
 * then 2-bar and 1-bar trades - so every cut fell on an odd bar of the
 * 8-bar phrase and the release landed one bar into the next phrase. The
 * double is one whole phrase: it starts on a phrase start, every rung starts
 * on a multiple of its own length, MUSICAL trades 2-bar rungs only (1-bar
 * rungs are PERFORMER's), and the release lands on the next phrase start.
 * Planner entry (planJuggle) on the controller's own context of a corpus
 * track, as the stand-alone juggle judges it.
 */
import { describe, it, expect } from 'vitest';
import { corpusAnalysis } from '../../testing/corpus';
import { DJJuggleController, type TickInput } from '../juggleController';
import { asDoubleContext } from '../juggleOpportunity';
import { patternBars, planJuggle } from '../jugglePlanner';
import { double } from '../jugglePatterns';
import type { DJJugglePattern, DJJugglePerformanceContext } from '../juggleTypes';

function doubleContext(positionSec: number): DJJugglePerformanceContext {
  const controller = new DJJuggleController({
    sink: { apply: () => {}, state: () => ({ crossfader: 0, playing: { A: true, B: false }, audible: { A: true, B: false }, loops: { A: false, B: false } }), restore: () => {} },
    clockFor: () => ({ beatNow: () => 0, beatSec: () => 0.5 }),
    positionOf: () => positionSec,
    now: () => 1_000_000,
  });
  const a = corpusAnalysis('drops');
  const input: TickInput = {
    masterDeck: 'A',
    decks: { A: { trackId: 'drops.wav', analysis: a, positionSec, playing: true, bpm: a.bpm }, B: { trackId: '', analysis: null, positionSec: 0, playing: false, bpm: 0 } },
    setPhase: 'CRUISING', energy: 0.6, targetEnergy: 0.65, performanceMode: 'JUGGLE', transitionApproachingSec: 400,
  };
  return asDoubleContext(controller.buildContext(input));
}

/** Pattern beats of every crossfader move: the cuts, the layer and the release. */
const moves = (p: DJJugglePattern): number[] => p.actions.filter((a) => a.type === 'CutIn' || a.type === 'HoldDeck' || a.type === 'ReleaseDeck').map((a) => a.executeAtBeat);

describe('the same-track double is one whole phrase on the phrase grid', () => {
  it('MUSICAL: 8 bars from a phrase start, 2-bar rungs on even bars only, released on the next phrase start', () => {
    const ctx = doubleContext(50);
    const bpb = ctx.beatsPerBar;
    expect(ctx.phraseLengthBars).toBe(8);
    const d = planJuggle(ctx, { mode: 'MUSICAL', intensityOverride: -1, seed: 0 });
    expect(d.pattern, d.reason).not.toBeNull();
    const p = d.pattern!;
    expect(p.type).toBe('double');
    expect(p.durationBars).toBe(8);
    expect(patternBars('double', ctx)).toBe(8);
    // The start is a phrase start of the master, and so is the release.
    const phraseBeats = ctx.phraseLengthBars * bpb;
    const phraseStartBefore = ctx.masterBeat - ctx.phrasePosition * phraseBeats;
    expect(Math.abs(((d.startBeat - phraseStartBefore) % phraseBeats + phraseBeats) % phraseBeats)).toBeLessThan(1e-6);
    const release = p.actions.find((a) => a.type === 'ReleaseDeck')!;
    expect(release.executeAtBeat).toBe(phraseBeats);
    // Every move on an even bar; no rung shorter than 2 bars.
    const m = moves(p);
    for (const beat of m) expect(beat % (2 * bpb), `move at pattern beat ${beat}`).toBe(0);
    const gaps = m.slice(1).map((beat, i) => beat - m[i]).filter((g) => g > 0);
    expect(Math.min(...gaps)).toBe(2 * bpb);
    expect(p.sequence).toBe('A B A A+B A');
  });

  it('PERFORMER keeps its 1-bar rungs, still one 8-bar phrase', () => {
    const p = double({ primary: 'A', beatsPerBar: 4, intensity: 0.8, phraseBars: 8, confidence: 0.9, minRung: 1, double: { offsetBeats: 4, primaryPosition: 20 } });
    expect(p.durationBars).toBe(8);
    expect(p.actions.find((a) => a.type === 'ReleaseDeck')!.executeAtBeat).toBe(32);
    expect(p.sequence).toBe('A B A B A A+B A');
    const m = moves(p);
    for (const beat of m) expect(beat % 4).toBe(0);
    expect(Math.min(...m.slice(1).map((beat, i) => beat - m[i]).filter((g) => g > 0))).toBe(4);
  });
});

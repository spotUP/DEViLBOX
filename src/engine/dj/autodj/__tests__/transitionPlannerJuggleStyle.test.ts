/**
 * The juggle-transition style (plan 2026-10-11-dj-juggling, JUGX-P3.1-P3.4,
 * P3.U): the transition planner offers 'juggleTransition' when the juggle
 * layer's own gates hold (mode MUSICAL and up, a normal tempo band, no key
 * clash, few vocals, drums on both, a phrase-level grid) and a trading ladder
 * fits both tracks; the ladder is 4-2-1 bars on a beat-level grid, 8-4 on a
 * phrase-level one; the incoming starts the ladder's length before its mix-in.
 */
import { describe, it, expect } from 'vitest';
import { corpusAnalysis, type CorpusId } from '../testing/corpus';
import { planTransition, laddersFor, scoreStyles, type TransitionPlanInput } from '../transitionPlanner';
import { getStyle } from '../styleProfiles';
import { DJSessionMemory } from '../sessionMemory';
import type { DJTrackAnalysis, DJTransitionPlan } from '../types';
import type { JuggleMode } from '../juggle/juggleTypes';

function plan(out: CorpusId, inc: CorpusId, mode: JuggleMode, opts: { position?: number; mutate?: (o: DJTrackAnalysis, i: DJTrackAnalysis) => void; setPhase?: string; creativeRisk?: number } = {}): DJTransitionPlan {
  // Copies: the corpus analyses are shared, a mutation must not leak into the next case.
  const o = structuredClone(corpusAnalysis(out));
  const i = structuredClone(corpusAnalysis(inc));
  opts.mutate?.(o, i);
  const input: TransitionPlanInput = {
    outgoing: o, incoming: i, outgoingDeck: 'A', incomingDeck: 'B', outgoingPosition: opts.position ?? 10, style: getStyle('Club'),
    creativeRisk: opts.creativeRisk ?? 0.6, memory: new DJSessionMemory().snapshot(), userBars: 8, withFilter: true, smartCuts: false,
    setPhase: opts.setPhase ?? 'PEAK', targetEnergy: 0.8, leadSec: 1, seed: 3, juggleMode: mode,
  };
  return planTransition(input);
}

/** Offered = scored (chosen or rejected with a score), not rejected for want of a trigger. */
function offered(p: DJTransitionPlan): boolean {
  if (p.style === 'juggleTransition') return true;
  const r = p.rejected.find((x) => x.style === 'juggleTransition');
  return !!r && r.reason !== 'no musical trigger';
}

describe('juggle transition style', () => {
  it('is offered for a compatible pair in MUSICAL and chosen in PERFORMER at the peak', () => {
    expect(offered(plan('steady', 'compatibleKey', 'MUSICAL'))).toBe(true);
    const p = plan('steady', 'compatibleKey', 'PERFORMER');
    expect(p.style).toBe('juggleTransition');
    expect(p.juggle).toBeDefined();
    expect(p.durationBars).toBe(1);
    expect(p.humanize.startOffsetMs).toBe(0);
    expect(p.reasons.some((r) => r.startsWith('juggle: '))).toBe(true);
  });

  it('is not offered with Auto Juggle OFF or SAFE', () => {
    expect(offered(plan('steady', 'compatibleKey', 'OFF'))).toBe(false);
    expect(offered(plan('steady', 'compatibleKey', 'SAFE'))).toBe(false);
  });

  it('is not offered across an extreme tempo gap', () => {
    expect(offered(plan('steady', 'fastBpm', 'PERFORMER'))).toBe(false);
  });

  // The gates by themselves (a corpus pair's key and vocal risks are low: the planner shifts a clashing key away).
  const gateCtx = (over: Partial<Parameters<typeof scoreStyles>[0]> = {}) => ({
    outSection: undefined, inSection: undefined, outgoing: corpusAnalysis('steady'), incoming: corpusAnalysis('compatibleKey'),
    vocalRisk: 0.05, outgoingVocalEnding: false, drumScore: 0.9, bothBassHeavy: false, energyDelta: 0, clashRisk: 0.05,
    tempoBand: 'none', tempoMethod: 'none', style: getStyle('Club'), creativeRisk: 0.6, memory: new DJSessionMemory().snapshot(), smartCuts: false,
    outroRoomBars: 32, incomingHasDrumIntro: false, confidence: 0.9, setPhaseIsPeak: () => true, juggleMode: 'MUSICAL' as JuggleMode, ladderFits: true,
    ...over,
  });
  const scored = (over: Partial<Parameters<typeof scoreStyles>[0]> = {}) => scoreStyles(gateCtx(over)).some((x) => x.style === 'juggleTransition');

  it('gates: scored when everything holds', () => { expect(scored()).toBe(true); });
  it('is not offered on a key clash', () => { expect(scored({ clashRisk: 0.6 })).toBe(false); });
  it('is not offered with vocals on both tracks', () => { expect(scored({ vocalRisk: 0.5 })).toBe(false); });
  it('is not offered when the drums fight', () => { expect(scored({ drumScore: 0.4 })).toBe(false); });
  it('is not offered in a creative or extreme tempo band', () => {
    expect(scored({ tempoBand: 'creative' })).toBe(false);
    expect(scored({ tempoBand: 'extreme' })).toBe(false);
    expect(scored({ tempoBand: 'normal' })).toBe(true);
  });
  it('is not offered without a ladder that fits', () => { expect(scored({ ladderFits: false })).toBe(false); });

  it('is not offered when the outgoing has no room for the ladder', () => {
    const o = corpusAnalysis('steady');
    const end = o.cuePoints.finalBeat ?? o.durationSec;
    expect(offered(plan('steady', 'compatibleKey', 'PERFORMER', { position: end - 10 }))).toBe(false);
  });

  it('ladder 4-2-1 on a beat-level grid, 8-4 on a phrase-level grid', () => {
    expect(laddersFor(1)[0]).toEqual([4, 2, 1]);
    expect(laddersFor(0.7)[0]).toEqual([8, 4]);
    const high = plan('steady', 'compatibleKey', 'PERFORMER', { mutate: (o, i) => { o.analysisConfidence.beatGrid = 1; i.analysisConfidence.beatGrid = 1; } });
    expect(high.juggle).toEqual({ ladderBars: [4, 2, 1], tradeBeats: 56 });
    const mid = plan('steady', 'compatibleKey', 'PERFORMER', { mutate: (o, i) => { o.analysisConfidence.beatGrid = 0.7; i.analysisConfidence.beatGrid = 0.7; } });
    expect(mid.style).toBe('juggleTransition');
    expect(mid.juggle).toEqual({ ladderBars: [8, 4], tradeBeats: 96 });
  });

  it('the incoming starts the ladder length before its mix-in', () => {
    const p = plan('steady', 'compatibleKey', 'PERFORMER');
    const inc = corpusAnalysis('compatibleKey');
    const tradeSec = p.juggle!.tradeBeats * (60 / inc.bpm);
    // No drop on this track and its best mix-in is the start: the ladder trades from there.
    expect(inc.cuePoints.firstDrop).toBeUndefined();
    expect(p.incomingPosition).toBeCloseTo(inc.cuePoints.bestMixIn!, 6);
    expect(p.reasons.some((r) => r.includes('the ladder trades from the incoming mix-in'))).toBe(true);
    // A drop with the ladder's length before it: the last trade lands on the drop.
    const dropAt = 60;
    const withDrop = plan('steady', 'compatibleKey', 'PERFORMER', { mutate: (_o, i) => { i.cuePoints.firstDrop = dropAt; } });
    expect(withDrop.style).toBe('juggleTransition');
    expect(withDrop.incomingPosition + tradeSec).toBeCloseTo(dropAt, 6);
    expect(p.incomingPosition).toBeGreaterThanOrEqual(0);
    // The release follows the ladder: the transition ends after trades + one bar.
    expect(p.endBeat - p.startBeat).toBe(p.juggle!.tradeBeats + p.beatsPerBar);
  });

  it('the ladder ends near the hand-over, not at the first phrase that fits', () => {
    const p = plan('steady', 'compatibleKey', 'PERFORMER');
    const blend = plan('steady', 'compatibleKey', 'OFF');
    const o = corpusAnalysis('steady');
    const barSec = (60 / o.bpm) * 4;
    const ladderEnd = p.startTimeSec + (p.juggle!.tradeBeats / 4 + 1) * barSec;
    // The ordinary transition hands over at its mix-out + length; the ladder ends within two bars of the track's room for it.
    expect(p.startTimeSec).toBeGreaterThan(10 + 8 * barSec);
    expect(ladderEnd).toBeLessThanOrEqual((o.cuePoints.finalBeat ?? o.durationSec) + 0.5);
    expect(ladderEnd).toBeGreaterThan(blend.startTimeSec);
  });
});

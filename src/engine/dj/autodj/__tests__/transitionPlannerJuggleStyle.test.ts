/**
 * The juggle-transition style (plan 2026-10-11-dj-juggling, JUGX-P3.1-P3.4,
 * P3.U; conformed to the owner's juggling plan by JUGX-CONFORM, audit rows
 * 11-17): the transition planner offers 'juggleTransition' when the juggle
 * layer's own gates hold (a normal tempo band, no key clash, few vocals,
 * drums on both), the set arc and the juggle budget allow it, and a trading
 * ladder fits both tracks musically. The ladder is a whole phrase, its
 * shortest rung set by the mode table and the pair's confidence, its shape
 * varied against the last ladders.
 */
import { describe, it, expect } from 'vitest';
import { corpusAnalysis, type CorpusId } from '../testing/corpus';
import { planTransition, ladderCandidates, ladderCutBars, onPhraseGroup, scoreStyles, type TransitionPlanInput } from '../transitionPlanner';
import { getStyle } from '../styleProfiles';
import { DJSessionMemory } from '../sessionMemory';
import type { DJTrackAnalysis, DJTransitionPlan } from '../types';
import { JUGGLE_PATTERN_TYPES, type JuggleMode } from '../juggle/juggleTypes';
import { MODE_PATTERNS, coarsenLadder, minLadderRung, transitionLadder } from '../juggle/jugglePatterns';
import type { DJJuggleHistory } from '../juggle/juggleTypes';

/** Both tracks' phrases sure enough for beat-level work (the incoming corpus track's phrases read 0.5: phrase level). */
const surePhrases = (o: DJTrackAnalysis, i: DJTrackAnalysis) => { for (const p of [...o.phrases, ...i.phrases]) p.confidence = 0.9; };

function plan(out: CorpusId, inc: CorpusId, mode: JuggleMode, opts: { position?: number; mutate?: (o: DJTrackAnalysis, i: DJTrackAnalysis) => void; setPhase?: string; creativeRisk?: number; juggleState?: TransitionPlanInput['juggleState'] } = {}): DJTransitionPlan {
  // Copies: the corpus analyses are shared, a mutation must not leak into the next case.
  const o = structuredClone(corpusAnalysis(out));
  const i = structuredClone(corpusAnalysis(inc));
  opts.mutate?.(o, i);
  const input: TransitionPlanInput = {
    outgoing: o, incoming: i, outgoingDeck: 'A', incomingDeck: 'B', outgoingPosition: opts.position ?? 10, style: getStyle('Club'),
    creativeRisk: opts.creativeRisk ?? 0.6, memory: new DJSessionMemory().snapshot(), userBars: 8, withFilter: true, smartCuts: false,
    setPhase: opts.setPhase ?? 'PEAK', targetEnergy: 0.8, leadSec: 1, seed: 3, juggleMode: mode, juggleState: opts.juggleState,
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

  it('is not offered with Auto Juggle OFF', () => {
    expect(offered(plan('steady', 'compatibleKey', 'OFF'))).toBe(false);
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

  it('the incoming starts the ladder length before its mix-in', () => {
    const p = plan('steady', 'compatibleKey', 'PERFORMER');
    const inc = corpusAnalysis('compatibleKey');
    const tradeSec = p.juggle!.tradeBeats * (60 / inc.bpm);
    // No drop on this track and its best mix-in is the start: the ladder trades from there.
    expect(inc.cuePoints.firstDrop).toBeUndefined();
    expect(p.incomingPosition).toBeCloseTo(inc.cuePoints.bestMixIn!, 6);
    expect(p.reasons.some((r) => r.includes('the ladder trades from the incoming mix-in'))).toBe(true);
    // A drop on an incoming phrase with the ladder's length before it: the last trade lands on the drop.
    const dropAt = inc.phrases[1].start;
    expect(dropAt).toBeGreaterThanOrEqual(tradeSec - 1e-6);
    const withDrop = plan('steady', 'compatibleKey', 'PERFORMER', { mutate: (_o, i) => { i.cuePoints.firstDrop = dropAt; } });
    expect(withDrop.style).toBe('juggleTransition');
    expect(withDrop.incomingPosition + tradeSec).toBeCloseTo(dropAt, 6);
    expect(p.incomingPosition).toBeGreaterThanOrEqual(0);
    // The release follows the ladder: the transition ends after trades + one bar.
    expect(p.endBeat - p.startBeat).toBe(p.juggle!.tradeBeats + p.beatsPerBar);
  });

  it('the ladder starts on the outgoing phrase nearest the hand-over that still leaves it room', () => {
    const p = plan('steady', 'compatibleKey', 'PERFORMER');
    const o = corpusAnalysis('steady');
    const barSec = (60 / o.bpm) * 4;
    const final = o.cuePoints.finalBeat ?? o.durationSec;
    const room = (p.juggle!.tradeBeats / 4 + 2) * barSec;
    // The 32-bar corpus track: the phrases at bars 8 and 16 are the ones after the position; only bar 8 leaves the room.
    const fitting = o.phrases.filter((ph) => ph.start >= 11 - 1e-6 && ph.start + room <= final + 1e-6);
    expect(fitting.length).toBeGreaterThanOrEqual(1);
    expect(p.startTimeSec).toBeCloseTo(fitting[fitting.length - 1].start, 6);
    expect(p.startTimeSec + (p.juggle!.tradeBeats / 4 + 1) * barSec).toBeLessThanOrEqual(final + 0.5);
  });
});

describe('transition ladder pattern (JUGX-P3.5)', () => {
  it('4-2-1-1: the incoming is locked first, cuts on beats 0, 16, 32, 40, 48, 52, 56, 60 and the release onto the incoming on beat 64', () => {
    const p = transitionLadder({ primary: 'A', target: 'B', beatsPerBar: 4, intensity: 0.6, phraseBars: 8, confidence: 1, ladderBars: [4, 2, 1, 1] });
    expect(p.actions[0]).toMatchObject({ type: 'PhaseLock', deck: 'B', executeAtBeat: 0 });
    const cuts = p.actions.filter((a) => a.type === 'CutIn').map((a) => [a.executeAtBeat, a.deck]);
    expect(cuts).toEqual([[0, 'A'], [16, 'B'], [32, 'A'], [40, 'B'], [48, 'A'], [52, 'B'], [56, 'A'], [60, 'B']]);
    const rel = p.actions.find((a) => a.type === 'ReleaseDeck')!;
    expect([rel.executeAtBeat, rel.deck]).toEqual([64, 'B']);
    expect(p.actions.find((a) => a.type === 'ResetDeck')!.deck).toBe('A');
    expect(p.durationBars).toBe(16);
    expect(p.targetDeck).toBe('B');
    expect(p.ladderBars).toEqual([4, 2, 1, 1]);
  });

  it('is never in a mode\'s library: the stand-alone planner cannot choose it', () => {
    for (const types of Object.values(MODE_PATTERNS)) expect(types).not.toContain('transitionLadder');
    expect(JUGGLE_PATTERN_TYPES).not.toContain('transitionLadder');
  });
});

// ── The owner's juggling plan (audit 2026-10-11 rows 11-17) ──────────────────

const BAR = (60 / corpusAnalysis('steady').bpm) * 4;
const tradeBarsOf = (p: DJTransitionPlan) => p.juggle!.tradeBeats / p.beatsPerBar;

describe('a juggle transition trades whole phrases on both tracks (owner plan sections 9, 41)', () => {
  it('the ladder is a whole phrase and starts and ends on a 4-bar group of both tracks\' phrase grids', () => {
    for (const mode of ['SAFE', 'MUSICAL', 'PERFORMER'] as const) {
      const p = plan('steady', 'compatibleKey', mode, { mutate: surePhrases });
      expect(p.style, `${mode}: ${p.reasons.join(' | ')}`).toBe('juggleTransition');
      const o = corpusAnalysis('steady'), i = corpusAnalysis('compatibleKey');
      const bars = tradeBarsOf(p);
      expect(bars % 16, `${mode}: ${p.juggle!.ladderBars.join('-')}`).toBe(0);
      const tradeSec = p.juggle!.tradeBeats * (60 / i.bpm);
      expect(onPhraseGroup(o, p.startTimeSec)).toBe(true);
      expect(onPhraseGroup(o, p.startTimeSec + bars * BAR)).toBe(true);
      expect(onPhraseGroup(i, p.incomingPosition)).toBe(true);
      expect(onPhraseGroup(i, p.incomingPosition + tradeSec)).toBe(true);
      // Each rung's trades start on a multiple of their own length: no trade straddles a 4-bar group.
      let bar = 0;
      for (const r of p.juggle!.ladderBars) { expect(bar % (2 * r)).toBe(0); bar += 2 * r; }
    }
  });

  it('a ladder never starts on a bare bar boundary: an outgoing phrase start, or no juggle transition', () => {
    // One 32-bar phrase from bar 0: from position 10 s no phrase starts before the track runs out.
    const p = plan('steady', 'compatibleKey', 'PERFORMER', { mutate: (o, i) => { surePhrases(o, i); o.phrases = [{ ...o.phrases[0], lengthBars: 32, end: o.durationSec }]; } });
    expect(p.style).not.toBe('juggleTransition');
    expect(p.reasons.some((r) => r.includes('no outgoing phrase boundary'))).toBe(true);
  });

  it('no trade cuts into a sung phrase on either deck (section 9: never switch halfway through a vocal phrase)', () => {
    const sing = (a: DJTrackAnalysis, from: number, to: number) => {
      a.vocalActivity = { ...a.vocalActivity, confidence: 1, values: a.vocalActivity.values.map((_, k) => { const t = k * a.vocalActivity.hopSec; return t >= from && t < to ? 1 : 0; }) };
    };
    // The outgoing sings from bar 8 to its end: every cut of every ladder would interrupt it.
    const sung = plan('steady', 'compatibleKey', 'PERFORMER', { mutate: (o, i) => { surePhrases(o, i); sing(o, 8 * BAR, o.durationSec); } });
    expect(sung.style).not.toBe('juggleTransition');
    expect(sung.reasons.some((r) => r.includes('inside a sung phrase'))).toBe(true);
    // Sung only before the ladder: the ladder runs, and no cut falls inside the sung bars.
    const before = plan('steady', 'compatibleKey', 'PERFORMER', { mutate: (o, i) => { surePhrases(o, i); sing(o, 0, 6 * BAR); } });
    expect(before.style).toBe('juggleTransition');
    for (const bar of ladderCutBars(before.juggle!.ladderBars)) expect(before.startTimeSec + bar * BAR).toBeGreaterThanOrEqual(6 * BAR);
  });
});

describe('the ladder follows the mode table and the confidence (owner plan sections 31, 44)', () => {
  const minRungOf = (p: DJTransitionPlan) => Math.min(...p.juggle!.ladderBars);

  it('SAFE trades 8/4-bar phrases, MUSICAL adds 2-bar trades, PERFORMER single bars - at beat-level confidence', () => {
    const safe = plan('steady', 'compatibleKey', 'SAFE', { mutate: surePhrases });
    expect(safe.style).toBe('juggleTransition');
    expect(minRungOf(safe)).toBeGreaterThanOrEqual(4);
    const musical = plan('steady', 'compatibleKey', 'MUSICAL', { mutate: surePhrases });
    expect(minRungOf(musical)).toBe(2);
    const performer = plan('steady', 'compatibleKey', 'PERFORMER', { mutate: surePhrases });
    expect(minRungOf(performer)).toBe(1);
  });

  it('moderate confidence is phrase trading only: PERFORMER gets no 1-bar trades when a track\'s phrases or grid are only moderately sure', () => {
    // The incoming corpus track's phrases read 0.5.
    const phrases = plan('steady', 'compatibleKey', 'PERFORMER');
    expect(phrases.style).toBe('juggleTransition');
    expect(minRungOf(phrases)).toBeGreaterThanOrEqual(2);
    const grid = plan('steady', 'compatibleKey', 'PERFORMER', { mutate: (o, i) => { surePhrases(o, i); o.analysisConfidence.beatGrid = 0.7; i.analysisConfidence.beatGrid = 0.7; } });
    expect(minRungOf(grid)).toBeGreaterThanOrEqual(2);
    // Low confidence: a normal transition.
    const low = plan('steady', 'compatibleKey', 'PERFORMER', { mutate: (o, i) => { o.analysisConfidence.beatGrid = 0.4; i.analysisConfidence.beatGrid = 0.4; } });
    expect(offered(low)).toBe(false);
  });

  it('the rung table and the coarsening keep the ladder\'s length', () => {
    expect([minLadderRung('SAFE', 'beat'), minLadderRung('MUSICAL', 'beat'), minLadderRung('PERFORMER', 'beat'), minLadderRung('PERFORMER', 'phrase'), minLadderRung('MUSICAL', 'none')]).toEqual([4, 2, 1, 2, null]);
    expect(coarsenLadder([4, 2, 1, 1], 2)).toEqual([4, 2, 2]);
    expect(coarsenLadder([8, 4, 2, 1, 1], 4)).toEqual([8, 4, 4]);
  });
});

describe('juggle transitions are budgeted like every juggle (owner plan sections 24, 28)', () => {
  it('OPENING and RECOVERY mix normally', () => {
    expect(offered(plan('steady', 'compatibleKey', 'PERFORMER', { setPhase: 'OPENING' }))).toBe(false);
    expect(offered(plan('steady', 'compatibleKey', 'PERFORMER', { setPhase: 'RECOVERY' }))).toBe(false);
    expect(plan('steady', 'compatibleKey', 'PERFORMER', { setPhase: 'OPENING' }).reasons.some((r) => r.includes('set phase OPENING: normal mixing'))).toBe(true);
  });

  it('a juggle cooldown or a spent budget blocks it', () => {
    const p = plan('steady', 'compatibleKey', 'PERFORMER', { juggleState: { allowed: false, reasons: ['cooldown 40 s left'], recent: [] } });
    expect(offered(p)).toBe(false);
    expect(p.reasons.some((r) => r.includes('cooldown 40 s left'))).toBe(true);
  });
});

describe('the ladder varies its shape (owner plan sections 21, 29)', () => {
  const history = (ladderBars: number[]): DJJuggleHistory => ({ patternType: 'transitionLadder', durationBars: 16, intensity: 0.6, sourceTracks: ['a', 'b'], successScore: 0.9, timestamp: 0, sequence: 'A B', ladderBars });

  it('the last ladder\'s shape is not repeated straight away when another fits', () => {
    const first = plan('steady', 'compatibleKey', 'PERFORMER', { mutate: surePhrases, juggleState: { allowed: true, reasons: [], recent: [] } });
    expect(first.style).toBe('juggleTransition');
    const second = plan('steady', 'compatibleKey', 'PERFORMER', { mutate: surePhrases, juggleState: { allowed: true, reasons: [], recent: [history(first.juggle!.ladderBars)] } });
    expect(second.style).toBe('juggleTransition');
    expect(second.juggle!.ladderBars).not.toEqual(first.juggle!.ladderBars);
  });

  it('candidates: the tightest shapes the mode allows first, recently used ones last', () => {
    const all = ladderCandidates(1, [], 1);
    expect(Math.min(...all[0])).toBe(1);
    const used = ladderCandidates(1, [history([4, 2, 1, 1]), history([8, 4, 2, 1, 1])], 1);
    expect(used.slice(-2).map((l) => l.join('-')).sort()).toEqual(['4-2-1-1', '8-4-2-1-1']);
    expect(ladderCandidates(4).every((l) => Math.min(...l) >= 4)).toBe(true);
  });

  it('candidates: a shape whose recorded performances were poor is tried after the others; a good record leads between equally tight shapes (owner plan section 50)', () => {
    const rec = (bars: number[], successScore: number): DJJuggleHistory => ({ ...history(bars), successScore });
    const A = [4, 2, 1, 1], B = [8, 4, 2, 1, 1]; // both reach the single-bar rung
    // Three later ladders of other shapes push A's record out of the "recently used" window.
    const filler = [rec([4, 4], 0.8), rec([8, 4, 4], 0.8), rec([8, 8], 0.8)];
    const order = (h: DJJuggleHistory[]): string[] => ladderCandidates(1, h, 1).map((l) => l.join('-')).filter((k) => k === A.join('-') || k === B.join('-'));
    expect(order([rec(A, 0.1), ...filler])).toEqual([B.join('-'), A.join('-')]);
    expect(order([rec(A, 0.95), ...filler])).toEqual([A.join('-'), B.join('-')]);
    expect(order([rec(B, 0.95), ...filler])).toEqual([B.join('-'), A.join('-')]);
    // A shape with no record is neutral: not demoted below a poor one, not preferred over a good one.
    expect(order(filler)).toHaveLength(2);
  });
});

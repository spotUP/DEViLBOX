/**
 * Scratch in the transition plan (scratch plan D8, sections 44-48; ledger SCR-P7.1-P7.5, P7.8,
 * P7.11): the planner attaches `plan.scratch` by the section 45 compatibility table, plays the
 * scratch as the transition when the performer and the incoming drop allow it, performs the
 * outgoing at its phrase end, answers an incoming vocal call, and keeps every risky pair reduced
 * or refused with a reason. The hands budget (section 27) caps it.
 */
import { describe, it, expect } from 'vitest';
import { corpusAnalysis } from '../testing/corpus';
import { planTransition, type TransitionPlanInput } from '../transitionPlanner';
import { getStyle } from '../styleProfiles';
import { DJSessionMemory } from '../sessionMemory';
import { planTransitionScratch, type TransitionScratchInput } from '../../scratch/transitionScratch';
import { scratchPermission, juggleCost, transitionCost, checkHands, HAND_COSTS } from '../performanceBudget';
import type { DJTransitionPlan, TransitionStyle } from '../types';
import type { ScratchMode } from '../../scratch/scratchStyles';

const out = () => structuredClone(corpusAnalysis('steady'));
const inc = () => structuredClone(corpusAnalysis('drops'));

function basePlan(scratchMode: ScratchMode = 'MUSICAL', over: Partial<TransitionPlanInput> = {}): DJTransitionPlan {
  return planTransition({
    outgoing: out(), incoming: inc(), outgoingDeck: 'A', incomingDeck: 'B', outgoingPosition: 10, style: getStyle('Club'),
    creativeRisk: 0.4, memory: new DJSessionMemory().snapshot(), userBars: 8, withFilter: true, smartCuts: false,
    setPhase: 'CRUISING', targetEnergy: 0.7, leadSec: 1, seed: 3, scratchMode, ...over,
  });
}

function scratchFor(style: TransitionStyle, over: Partial<TransitionScratchInput> = {}, planOver: Partial<DJTransitionPlan> = {}) {
  const p = { ...basePlan('OFF'), style, ...planOver };
  return planTransitionScratch({ plan: p, outgoing: out(), incoming: inc(), mode: 'MUSICAL', permission: 4, creativeRisk: 0.4, setPhase: 'CRUISING', seed: 3, ...over });
}

describe('the planner attaches a scratch to the transition (SCR-P7.1)', () => {
  it('MUSICAL: the plan carries scratch events inside the transition and says so in its reasons; OFF: none', () => {
    const p = basePlan('MUSICAL');
    const line = p.reasons.find((r) => r.startsWith('scratch:'));
    expect(line).toBeDefined();
    if (p.scratch) {
      for (const e of p.scratch.events) expect(e.executeAtBeat + e.durationBeats).toBeLessThanOrEqual(p.endBeat + 1e-9);
      expect(p.scratch.startBeat).toBeLessThanOrEqual(p.scratch.endBeat);
    }
    const off = basePlan('OFF');
    expect(off.scratch).toBeUndefined();
    expect(off.reasons.some((r) => r.startsWith('scratch:'))).toBe(false);
  });
});

describe('section 45 compatibility (SCR-P7.2)', () => {
  it('the six good pairs carry a scratch with their own gesture', () => {
    const want: Record<string, string[]> = {
      longBlend: ['baby', 'babySlow'], shortBlend: ['chirp'], breakdownMix: ['baby', 'chirp'], dropMix: ['transformer4', 'transformer8'],
      hardCut: ['forwardStab'], drumIntroMix: ['baby', 'forwardStab'],
    };
    for (const [style, gestures] of Object.entries(want)) {
      const r = scratchFor(style as TransitionStyle);
      expect(r.scratch, `${style}: ${r.reason}`).toBeDefined();
      const performed = r.scratch!.events.filter((e) => e.gesture !== 'drop' && e.role !== 'ANSWER');
      expect(performed.length, style).toBeGreaterThan(0);
      for (const e of performed) expect(gestures, `${style} ${e.gesture}`).toContain(e.gesture);
      // section 28: nothing lands on the transition start itself
      const start = basePlan('OFF').startBeat;
      for (const e of r.scratch!.events) expect(Math.abs(e.executeAtBeat - start), `${style} ${e.gesture} on the start`).toBeGreaterThan(1e-9);
    }
  });

  it('the four risky pairs are reduced to one accent or refused, with the reason', () => {
    for (const style of ['echoOut', 'vocalSwap', 'bassSwap', 'filterBuild'] as const) {
      const r = scratchFor(style);
      expect(r.reason, style).toMatch(/risky|echo/);
      if (r.scratch) expect(r.scratch.events.filter((e) => e.gesture !== 'drop' && e.role !== 'ANSWER').length, style).toBeLessThanOrEqual(1);
    }
    // a vocal swap never scratches a voice
    const vs = scratchFor('vocalSwap');
    if (vs.scratch) expect(vs.scratch.source.type).not.toBe('CRATE');
  });
});

describe('scratch as the transition, outgoing performance, vocal response (SCR-P7.3-P7.5)', () => {
  it('PERFORMER, creative risk 0.6, an incoming drop: scratchTransition in the last 4 outgoing bars, transformer cuts, a release', () => {
    const p = basePlan('OFF');
    const r = scratchFor('dropMix', { mode: 'PERFORMER', creativeRisk: 0.6 }, { durationBeats: 32, endBeat: p.startBeat + 32 });
    expect(r.scratch?.kind).toBe('scratchTransition');
    const s = r.scratch!;
    const lastFour = p.startBeat + 32 - 16;
    for (const e of s.events) expect(e.executeAtBeat).toBeGreaterThanOrEqual(lastFour - 1e-9);
    expect(s.events.some((e) => e.gesture === 'transformer4' || e.gesture === 'transformer8')).toBe(true);
    expect(s.events.at(-1)!.role).toBe('OUTRO');
    expect(s.source.type).toBe('DECK');
    expect(s.fxRequest).toBe('transition');
  });

  it('the outgoing deck is performed at its phrase end and its events end before the incoming enters', () => {
    const r = scratchFor('longBlend');
    expect(r.scratch?.kind).toBe('scratchFeature');
    const p = basePlan('OFF');
    for (const e of r.scratch!.events) {
      expect(e.deck).toBe('A');
      expect(e.executeAtBeat + e.durationBeats).toBeLessThanOrEqual(p.startBeat + 1e-9);
    }
  });

  it('an incoming vocal onset in the first 2 bars is answered once with a YEAH on step 6-8 after it', () => {
    const p = basePlan('OFF');
    const i = inc();
    const beatSec = 60 / i.bpm;
    i.cuePoints.firstVocal = p.incomingPosition + 1 * beatSec; // the call on beat 2 of bar 0
    const r = planTransitionScratch({ plan: { ...p, style: 'shortBlend' }, outgoing: out(), incoming: i, mode: 'MUSICAL', permission: 4, creativeRisk: 0.4, setPhase: 'CRUISING', seed: 3 });
    const answers = r.scratch!.events.filter((e) => e.role === 'ANSWER');
    expect(answers).toHaveLength(1);
    expect(answers[0]!.source.type).toBe('CRATE');
    expect((answers[0]!.source as { recordId: string }).recordId).toMatch(/YEAH/);
    const step = Math.round((answers[0]!.executeAtBeat - p.startBeat) * 4) % 16;
    expect(step).toBeGreaterThanOrEqual(6);
    expect(step).toBeLessThanOrEqual(8);
    expect(answers[0]!.executeAtBeat).toBeGreaterThan(p.startBeat + 1);
  });
});

describe('dub / FX requests (SCR-P7.8)', () => {
  it('long blend -> dubbed, hard cut -> dry; an echo out whose echo shares the throw bar is refused', () => {
    expect(scratchFor('breakdownMix', {}, {}).scratch?.fxRequest).toBe('dubbed');
    expect(scratchFor('hardCut').scratch?.fxRequest).toBe('dry');
    const p = basePlan('OFF');
    const r = scratchFor('echoOut', {}, { effects: [{ kind: 'echo-out', deck: 'outgoing', beat: 0, lengthBeats: 4, amount: 1, reason: 'echo' }], startBeat: p.startBeat });
    expect(r.scratch).toBeUndefined();
    expect(r.reason).toMatch(/throw in the echo bar/);
  });
});

describe('hands budget (SCR-P7.11, section 27)', () => {
  it('juggle 3 + filter 1 leaves the scratch <= 2; aggressive juggle + bass swap + echo leaves 0; the pile-up is refused', () => {
    expect(scratchPermission({ juggleCost: juggleCost(2), fxCost: HAND_COSTS.filterMove })).toBeLessThanOrEqual(2);
    expect(scratchPermission({ juggleCost: juggleCost(3), transitionCost: transitionCost('bassSwap'), fxCost: 1 })).toBe(0);
    expect(checkHands(['beatJuggle', 'complexScratch', 'complexScratch', 'filterMove', 'filterMove', 'eqMove']).ok).toBe(false);
    expect(checkHands(['normalBlend', 'shortScratch', 'eqMove']).ok).toBe(true);
  });

  it('no hands left = no scratch in the transition', () => {
    expect(scratchFor('longBlend', { permission: 0 }).scratch).toBeUndefined();
  });
});

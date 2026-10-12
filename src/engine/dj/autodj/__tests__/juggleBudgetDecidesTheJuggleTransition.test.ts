/**
 * JUGGLE-FOLLOWUPS (a), live 2026-10-12 (37-minute set, 3 juggles): in the Classic style (risk 0.35) the
 * juggle transition scored 0.60 against 0.70 for a bass swap or long blend, so it was almost never chosen
 * even with the juggle budget open. Owner decision 2026-10-12: the budget decides (owner plan sections 24,
 * 28, 44) - when the budget allows a juggle and a ladder fits, the juggle transition outranks the blends
 * in every style; the safety gates are unchanged.
 *
 * Entry: planTransition, the one transition planner, on the corpus pair the juggle-style suite uses.
 */
import { describe, it, expect } from 'vitest';
import { corpusAnalysis } from '../testing/corpus';
import { planTransition, type TransitionPlanInput } from '../transitionPlanner';
import { getStyle } from '../styleProfiles';
import { DJSessionMemory } from '../sessionMemory';

function classicPlan(juggleState: TransitionPlanInput['juggleState']) {
  const o = structuredClone(corpusAnalysis('steady'));
  const i = structuredClone(corpusAnalysis('compatibleKey'));
  for (const p of [...o.phrases, ...i.phrases]) p.confidence = 0.9;
  const style = getStyle('Classic');
  return planTransition({
    outgoing: o, incoming: i, outgoingDeck: 'A', incomingDeck: 'B', outgoingPosition: 10, style,
    creativeRisk: style.riskTolerance, memory: new DJSessionMemory().snapshot(), userBars: 8, withFilter: true, smartCuts: false,
    setPhase: 'CRUISING', targetEnergy: 0.6, leadSec: 1, seed: 3, juggleMode: 'MUSICAL', juggleState,
  });
}

describe('JUGGLE-FOLLOWUPS (a): the juggle budget decides the juggle transition', () => {
  it('a Classic MUSICAL set outside PEAK with the budget open picks the juggle transition', () => {
    const p = classicPlan({ allowed: true, reasons: [], recent: [] });
    expect(p.style, p.rejected.map((r) => `${r.style}: ${r.reason}`).join(' | ')).toBe('juggleTransition');
    expect(p.juggle).toBeDefined();
  });

  it('with the budget closed (cooldown) the same pair mixes normally', () => {
    const p = classicPlan({ allowed: false, reasons: ['cooldown 90 s left'], recent: [] });
    expect(p.style).not.toBe('juggleTransition');
  });
});

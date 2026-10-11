/**
 * Audit JA-m7 (thoughts/shared/research/2026-10-11_juggling-sonnet-work-audit.md, minor m7): the bass
 * handover let both basslines share a bar at -6 dB (`coexist`) whatever their keys. Owner juggling plan
 * section 35: "A bass, B bass" only when the material is compatible, otherwise "cut A bass, bring B
 * bass" as an intentional handover. The shared bar now needs the basslines' keys to sit together
 * (same, relative, a fifth apart, both known with confidence).
 */
import { describe, it, expect } from 'vitest';
import { corpusAnalysis } from '../testing/corpus';
import { planTransition, type TransitionPlanInput } from '../transitionPlanner';
import { bassKeysCompatible, harmonicCompatibility } from '../compatibility';
import { getStyle } from '../styleProfiles';
import { DJSessionMemory } from '../sessionMemory';
import type { DJTrackAnalysis, MusicalKey } from '../types';

const UNKNOWN: MusicalKey = { name: 'Unknown', root: null, mode: 'unknown', camelot: null, alternatives: [] };

/** A light, non-melodic pair (the other coexist conditions hold); the incoming in `key`, both keys sure. */
function plan(incomingKey: 'same' | 'unknown') {
  const o: DJTrackAnalysis = structuredClone(corpusAnalysis('steady'));
  const i: DJTrackAnalysis = structuredClone(corpusAnalysis('compatibleKey'));
  for (const a of [o, i]) { a.bass.heaviness = 0.3; a.bass.melodic = false; a.keyTimeline = undefined; a.keyConfidence = 0.9; }
  i.key = incomingKey === 'same' ? structuredClone(o.key) : UNKNOWN;
  const input: TransitionPlanInput = {
    outgoing: o, incoming: i, outgoingDeck: 'A', incomingDeck: 'B', outgoingPosition: 10, style: getStyle('Club'),
    creativeRisk: 0.3, memory: new DJSessionMemory().snapshot(), userBars: 8, withFilter: false, smartCuts: false,
    setPhase: 'CRUISING', targetEnergy: 0.6, leadSec: 1, seed: 5, juggleMode: 'OFF',
  };
  return planTransition(input);
}

describe('JA-m7: two basslines share a bar only in compatible keys', () => {
  it('basslines in the same key share one bar at -6 dB before the hand-over', () => {
    const p = plan('same');
    expect(p.bassPlan.bassKeysCompatible, p.bassPlan.reason).toBe(true);
    expect(p.bassPlan.coexist).toBe(true);
    expect(p.bassPlan.schedule.some((s) => s.owner === 'SHARED')).toBe(true);
  });

  it('a bassline whose key is not known never shares the low end: cut A bass, bring B bass', () => {
    const p = plan('unknown');
    expect(p.bassPlan.bassKeysCompatible).toBe(false);
    expect(p.bassPlan.coexist, p.bassPlan.reason).toBe(false);
    expect(p.bassPlan.schedule.some((s) => s.owner === 'SHARED')).toBe(false);
    expect(p.bassPlan.reason).toContain('bass keys not proven compatible');
  });

  it('keys that sit together: same, relative, a fifth; a clash, a weak key or an unknown key do not', () => {
    const sure = (a: string, b: string, conf = 0.9) => bassKeysCompatible(harmonicCompatibility(a, conf, b, conf));
    expect(sure('A minor', 'A minor')).toBe(true);
    expect(sure('A minor', 'C major')).toBe(true);
    expect(sure('A minor', 'E minor')).toBe(true);
    expect(sure('A minor', 'D# minor')).toBe(false);
    expect(sure('A minor', 'A minor', 0.4)).toBe(false);
    expect(bassKeysCompatible(harmonicCompatibility('A minor', 0.9, null, 0))).toBe(false);
  });
});

/**
 * The set remembers its scratches (scratch ledger SCR-P7.12, plan D9): the session memory counts the
 * performed scratch phrases and keeps their gestures; the transition scratch's accents rotate away
 * from what the set scratched lately (section 29 variety). The Auto DJ wiring (one SCRATCH decision
 * and one memory record per performed phrase) is proven in autoDJScratchReachesTheDecks.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { DJSessionMemory } from '../sessionMemory';
import { leastRecent, planTransitionScratch } from '../../scratch/transitionScratch';
import { corpusAnalysis } from '../testing/corpus';

describe('session memory: scratch counts and the transition variety term (SCR-P7.12)', () => {
  it('counts scratch phrases and keeps the recent gestures; reset clears them', () => {
    const m = new DJSessionMemory(() => 0);
    expect(m.snapshot().scratchPhrases).toBe(0);
    m.recordScratch({ gestures: ['baby', 'chirp'], source: 'AH_FRESH' });
    m.recordScratch({ gestures: ['forwardStab'], source: 'deck A' });
    expect(m.snapshot().scratchPhrases).toBe(2);
    expect(m.snapshot().recentScratchGestures).toEqual(['baby', 'chirp', 'forwardStab']);
    m.reset();
    expect(m.snapshot().scratchPhrases).toBe(0);
  });

  it('leastRecent picks the gesture the set used least', () => {
    expect(leastRecent(['baby', 'babySlow'], ['baby', 'baby'], () => 0)).toBe('babySlow');
    expect(leastRecent(['baby', 'babySlow'], ['babySlow'], () => 0.99)).toBe('baby');
  });

  it('a long blend (SAFE: accents) after a set of baby scratches accents with babySlow', () => {
    const a = corpusAnalysis('steady');
    const input = {
      plan: { style: 'longBlend' as const, startBeat: 64, endBeat: 128, durationBeats: 64, beatsPerBar: 4, outgoingDeck: 'A' as const, incomingDeck: 'B' as const, incomingPosition: 0, effects: [] },
      outgoing: a, incoming: a, mode: 'SAFE' as const, permission: 2, creativeRisk: 0.2, setPhase: 'CRUISING', seed: 3,
    };
    const accents = (recent: string[]) => planTransitionScratch({ ...input, recentGestures: recent }).scratch?.events.filter((e) => e.role === 'ACCENT').map((e) => e.gesture) ?? [];
    const afterBaby = accents(['baby', 'baby', 'baby']);
    expect(afterBaby.length).toBeGreaterThan(0);
    expect(afterBaby[0]).toBe('babySlow');
    expect(accents(['babySlow', 'babySlow', 'babySlow'])[0]).toBe('baby');
  });
});

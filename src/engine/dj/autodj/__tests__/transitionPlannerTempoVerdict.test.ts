import { describe, it, expect } from 'vitest';
import { scoreStyles, type StyleScore } from '../transitionPlanner';
import { corpusAnalysis } from '../testing/corpus';
import { getStyle } from '../styleProfiles';
import { DJSessionMemory } from '../sessionMemory';

// DJ-K: the planner solved "12.7 % beyond the creative range: no beatmatch, short transition only"
// and still picked a 4-8 bar longBlend. The style choice must honour the tempo verdict.
type Ctx = Parameters<typeof scoreStyles>[0];
const ctx = (over: Partial<Ctx> = {}): Ctx => ({
  outSection: undefined, inSection: undefined, outgoing: corpusAnalysis('steady'), incoming: corpusAnalysis('compatibleKey'),
  vocalRisk: 0.05, outgoingVocalEnding: false, drumScore: 0.9, bothBassHeavy: false, energyDelta: 0, clashRisk: 0.05,
  tempoBand: 'none', tempoMethod: 'none', style: getStyle('Club'), creativeRisk: 0.6, memory: new DJSessionMemory().snapshot(), smartCuts: false,
  outroRoomBars: 32, incomingHasDrumIntro: false, confidence: 0.9, setPhaseIsPeak: () => true,
  ...over,
});
const best = (s: StyleScore[]) => [...s].sort((a, b) => b.score - a.score)[0].style;

describe('scoreStyles honours the tempo verdict (DJ-K)', () => {
  it('offers no grid-locked blend when the verdict is avoid', () => {
    const styles = scoreStyles(ctx({ tempoBand: 'extreme', tempoMethod: 'avoid' })).map((s) => s.style);
    expect(styles).not.toContain('longBlend');
    expect(styles).not.toContain('bassSwap');
  });
  it('picks a short or punctuated exit across an unmatched gap', () => {
    expect(['shortBlend', 'echoOut', 'reverbOut']).toContain(best(scoreStyles(ctx({ tempoBand: 'extreme', tempoMethod: 'avoid' }))));
    expect(['shortBlend', 'echoOut', 'reverbOut']).toContain(best(scoreStyles(ctx({ tempoBand: 'extreme', tempoMethod: 'avoid', confidence: 0.3 }))));
  });
  it('keeps longBlend when the tempos match', () => {
    expect(scoreStyles(ctx()).map((s) => s.style)).toContain('longBlend');
  });
});

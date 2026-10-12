/** Phrase evaluation and quality (owner scratch plan sections 52, 89; ledger SCR-P6.5, P6.10). */
import { describe, it, expect } from 'vitest';
import { evaluatePhrase, scoreScratchQuality, type PhraseTrace, type TracedScratch } from '../scratchEvaluate';
import { ScratchMemory } from '../scratchMemory';

const ev = (bar: number, gesture: TracedScratch['gesture'], role: TracedScratch['role'], errMs = 0, sourceKey = 'crate:AH_STANDARD'): TracedScratch =>
  ({ bar, gesture, role, sourceKey, intensity: 0.6, scheduledSec: bar * 2, firedSec: bar * 2 + errMs / 1000, anchorQuality: 0.9 });
const trace = (events: TracedScratch[], over: Partial<PhraseTrace> = {}): PhraseTrace =>
  ({ events, vocalByBar: {}, energyBefore: 0.6, energyAfter: 0.6, setEnergyTrend: 0, ...over });

describe('quality score (SCR-P6.10)', () => {
  it('0 ms error, no collision, 3 distinct gestures scores >= 0.8; 40 ms errors score timing <= 0.3', () => {
    const good = scoreScratchQuality(trace([ev(0, 'baby', 'THEME'), ev(1, 'chirp', 'THEME'), ev(2, 'forwardStab', 'ANSWER')]), { energy: 0.6 });
    expect(good.total).toBeGreaterThanOrEqual(0.8);
    expect(good.timing).toBe(1);
    const late = scoreScratchQuality(trace([ev(0, 'baby', 'THEME', 40), ev(1, 'chirp', 'THEME', -40)]), { energy: 0.6 });
    expect(late.timing).toBeLessThanOrEqual(0.3);
  });
});

describe('evaluation after each phrase (SCR-P6.5)', () => {
  it('a vocal collision -> rest', () => {
    const e = evaluatePhrase(trace([ev(0, 'baby', 'THEME')], { vocalByBar: { 0: 0.9 }, energyAfter: 0.8 }), { energy: 0.6 }, new ScratchMemory());
    expect(e.vocalCollisions).toBe(1);
    expect(e.decision).toBe('rest');
  });

  it('rising energy and no repetition -> escalate', () => {
    const e = evaluatePhrase(trace([ev(0, 'baby', 'THEME'), ev(1, 'chirp', 'ANSWER')], { energyAfter: 0.8, setEnergyTrend: 0.1 }), { energy: 0.6 }, new ScratchMemory());
    expect(e.decision).toBe('escalate');
  });

  it('the third repetition of one idea -> resolve', () => {
    const m = new ScratchMemory();
    for (let i = 0; i < 3; i++) m.record({ bar: i, sourceKey: 'crate:AH_STANDARD', gesture: 'chirp', intensity: 0.5, section: 'A' });
    const e = evaluatePhrase(trace([ev(3, 'chirp', 'THEME')], { energyAfter: 0.8 }), { energy: 0.6 }, m);
    expect(e.repetition).toBe(3);
    expect(e.decision).toBe('resolve');
  });

  it('a vocal call in the next bar -> answer', () => {
    const e = evaluatePhrase(trace([ev(0, 'baby', 'THEME')], { nextBarVocal: 0.9 }), { energy: 0.6 }, new ScratchMemory());
    expect(e.decision).toBe('answer');
  });
});

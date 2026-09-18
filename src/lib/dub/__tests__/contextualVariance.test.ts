import { describe, it, expect } from 'vitest';
import { allowSurprise, varianceInputsFrom, type VarianceInputs } from '../contextualVariance';
import { PERSONA_BEHAVIOUR } from '../personaBehaviour';
import {
  PerformanceMemory,
  buildPerformanceContext,
  readWetEnergy,
} from '../performanceContext';

const always = () => 0;      // always takes the chance
const never = () => 0.999;   // never takes it

function settled(over: Partial<VarianceInputs> = {}): VarianceInputs {
  return {
    rowsSinceLastAction: 32,
    positionInPhrase: 0.5,
    wet: 0.1,
    repetition: 0,
    gesturesInFlight: 0,
    ...over,
  };
}

describe('allowSurprise — the situation gates it, the persona takes it', () => {
  it('allows a bold persona to depart when the music is settled', () => {
    const v = allowSurprise(settled(), PERSONA_BEHAVIOUR.perry, always);
    expect(v.allowed).toBe(true);
    expect(v.probability).toBeGreaterThan(0);
  });

  it('never departs for a persona with no appetite for risk', () => {
    const v = allowSurprise(settled(), { ...PERSONA_BEHAVIOUR.tubby, risk: 0 }, always);
    expect(v.allowed).toBe(false);
    expect(v.reason).toMatch(/does not depart/);
  });

  it('refuses while a gesture is in flight — that is a mess, not a surprise', () => {
    const v = allowSurprise(settled({ gesturesInFlight: 1 }), PERSONA_BEHAVIOUR.perry, always);
    expect(v.allowed).toBe(false);
    expect(v.reason).toMatch(/already in flight/);
  });

  it('refuses into a wet mix, where a surprise just reads as noise', () => {
    const v = allowSurprise(settled({ wet: 0.8 }), PERSONA_BEHAVIOUR.perry, always);
    expect(v.allowed).toBe(false);
    expect(v.reason).toMatch(/wet/);
  });

  it('refuses at a phrase seam, where the arrangement is already saying something', () => {
    expect(allowSurprise(settled({ positionInPhrase: 0.95 }), PERSONA_BEHAVIOUR.perry, always).allowed)
      .toBe(false);
    expect(allowSurprise(settled({ positionInPhrase: 0.01 }), PERSONA_BEHAVIOUR.perry, always).allowed)
      .toBe(false);
  });

  it('refuses too soon after the last move', () => {
    const v = allowSurprise(settled({ rowsSinceLastAction: 1 }), PERSONA_BEHAVIOUR.perry, always);
    expect(v.allowed).toBe(false);
    expect(v.reason).toMatch(/since the last move/);
  });

  it('lets a bolder persona depart sooner after the last move than a careful one', () => {
    const inputs = settled({ rowsSinceLastAction: 5 });
    expect(allowSurprise(inputs, PERSONA_BEHAVIOUR.perry, always).allowed).toBe(true);
    expect(allowSurprise(inputs, PERSONA_BEHAVIOUR.tubby, always).allowed).toBe(false);
  });

  it('raises the chance when the performer has been repeating itself', () => {
    const plain = allowSurprise(settled({ repetition: 0 }), PERSONA_BEHAVIOUR.perry, never);
    const repetitive = allowSurprise(settled({ repetition: 1 }), PERSONA_BEHAVIOUR.perry, never);
    expect(repetitive.probability).toBeGreaterThan(plain.probability);
  });

  it('keeps the chance bounded however repetitive things get', () => {
    const v = allowSurprise(settled({ repetition: 1 }), { ...PERSONA_BEHAVIOUR.perry, risk: 1, novelty: 1 }, never);
    expect(v.probability).toBeLessThanOrEqual(0.6);
  });

  it('says so when the situation allowed it but the persona passed', () => {
    const v = allowSurprise(settled(), PERSONA_BEHAVIOUR.perry, never);
    expect(v.allowed).toBe(false);
    expect(v.reason).toMatch(/did not take it/);
  });

  it('gives Tubby a far smaller chance than Perry in the same situation', () => {
    const perry = allowSurprise(settled(), PERSONA_BEHAVIOUR.perry, never).probability;
    const tubby = allowSurprise(settled(), PERSONA_BEHAVIOUR.tubby, never).probability;
    expect(perry).toBeGreaterThan(tubby * 2);
  });
});

describe('varianceInputsFrom', () => {
  it('reads repetition from what the performer actually just played', () => {
    const memory = new PerformanceMemory();
    for (let i = 0; i < 4; i++) {
      memory.noteFire({
        invocationId: `a${i}`, moveId: 'echoThrow', row: i * 4, timeSec: i,
        source: 'live', isHold: false,
      });
    }
    const ctx = buildPerformanceContext(memory, {
      row: 32, ticksPerRow: 6, bpm: 120, sources: [],
      energy: readWetEnergy(
        { returnGain: 0.5, echoWet: 0.2, springWet: 0, echoIntensity: 0.3, extFeedbackGain: 0 }, 0),
    });
    const inputs = varianceInputsFrom(ctx);
    expect(inputs.repetition).toBe(1);
    expect(inputs.rowsSinceLastAction).toBe(20);
  });

  it('reports no repetition when the performer has been varying', () => {
    const memory = new PerformanceMemory();
    ['echoThrow', 'dubStab', 'sonarPing'].forEach((moveId, i) => {
      memory.noteFire({
        invocationId: `b${i}`, moveId, row: i * 4, timeSec: i, source: 'live', isHold: false,
      });
    });
    const ctx = buildPerformanceContext(memory, {
      row: 12, ticksPerRow: 6, bpm: 120, sources: [],
      energy: readWetEnergy(
        { returnGain: 0.5, echoWet: 0.2, springWet: 0, echoIntensity: 0.3, extFeedbackGain: 0 }, 0),
    });
    expect(varianceInputsFrom(ctx).repetition).toBeLessThan(0.5);
  });
});

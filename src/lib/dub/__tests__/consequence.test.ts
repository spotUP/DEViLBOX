import { describe, it, expect } from 'vitest';
import { measureConsequence, consequenceWeight, type MixReading } from '../consequence';

function reading(over: Partial<MixReading> = {}): MixReading {
  return {
    rms: 0.2,
    sub: 0.2, bass: 0.3, mid: 0.3, high: 0.2,
    channelLevels: new Map([[0, 0.4], [1, 0.3], [2, 0.2]]),
    audibleChannels: 4,
    wet: 0.2,
    feedback: 0.3,
    ...over,
  };
}

describe('measureConsequence — measured, not assumed', () => {
  it('calls a move that changed nothing inaudible', () => {
    const c = measureConsequence(reading(), reading(), { targetChannel: 1 });
    expect(c.verdict).toBe('inaudible');
    expect(c.reason).toMatch(/nothing moved/);
  });

  it('detects a throw at a channel that was not playing', () => {
    // The target's own level did not move, and neither did anything else.
    const before = reading({ channelLevels: new Map([[1, 0]]) });
    const after = reading({ channelLevels: new Map([[1, 0]]) });
    const c = measureConsequence(before, after, { targetChannel: 1 });
    expect(c.targetAudibility).toBe(0);
    expect(c.verdict).toBe('inaudible');
  });

  it('reports the target getting louder', () => {
    const before = reading({ channelLevels: new Map([[1, 0.2]]) });
    const after = reading({ rms: 0.3, channelLevels: new Map([[1, 0.6]]) });
    const c = measureConsequence(before, after, { targetChannel: 1 });
    expect(c.targetAudibility).toBeCloseTo(0.4, 6);
    expect(c.verdict).toBe('effective');
    expect(c.reason).toMatch(/target moved up/);
  });

  it('reports the target getting quieter just as readily', () => {
    const before = reading({ channelLevels: new Map([[1, 0.6]]) });
    const after = reading({ rms: 0.15, channelLevels: new Map([[1, 0.1]]) });
    const c = measureConsequence(before, after, { targetChannel: 1 });
    expect(c.targetAudibility).toBeLessThan(0);
    expect(c.reason).toMatch(/target moved down/);
  });

  it('calls a busier-but-not-louder mix muddying', () => {
    const before = reading();
    const after = reading({ mid: 0.7, high: 0.5, rms: 0.205 });
    expect(measureConsequence(before, after).verdict).toBe('muddying');
  });

  it('does not call a genuinely louder mix muddying', () => {
    const before = reading();
    const after = reading({ mid: 0.7, high: 0.5, rms: 0.6 });
    expect(measureConsequence(before, after).verdict).not.toBe('muddying');
  });

  it('calls a move that removed a chunk of the arrangement subtractive', () => {
    const before = reading({ audibleChannels: 5 });
    const after = reading({ audibleChannels: 2, rms: 0.1 });
    const c = measureConsequence(before, after);
    expect(c.verdict).toBe('subtractive');
    expect(c.structuralImpact).toBeCloseTo(-0.6, 6);
    expect(c.reason).toMatch(/60% of the arrangement left/);
  });

  it('measures wet and feedback change from the ledger readings', () => {
    const c = measureConsequence(
      reading({ wet: 0.2, feedback: 0.3 }),
      reading({ wet: 0.75, feedback: 0.55, rms: 0.35 }),
    );
    expect(c.wetEnergyChange).toBeCloseTo(0.55, 6);
    expect(c.feedbackChange).toBeCloseTo(0.25, 6);
    expect(c.verdict).toBe('effective');
  });

  it('counts a wet-only change as audible even when the level did not move', () => {
    const c = measureConsequence(
      reading(),
      reading({ wet: 0.8 }),
      { targetChannel: 1 },
    );
    expect(c.verdict).toBe('effective');
  });

  it('has no opinion about the target when the move had none', () => {
    expect(measureConsequence(reading(), reading()).targetAudibility).toBeNull();
  });

  it('survives a channel missing from either reading', () => {
    const c = measureConsequence(
      reading({ channelLevels: new Map() }),
      reading({ channelLevels: new Map([[9, 0.5]]) }),
      { targetChannel: 9 },
    );
    expect(c.targetAudibility).toBeCloseTo(0.5, 6);
  });
});

describe('consequenceWeight — gentle and asymmetric', () => {
  const verdictOf = (verdict: string) => ({ verdict } as never);

  it('pushes a no-op down hard — repeating one wastes a bar', () => {
    expect(consequenceWeight(verdictOf('inaudible'))).toBeLessThan(0.5);
  });

  it('pushes a muddying move down less: it did something, just not here', () => {
    expect(consequenceWeight(verdictOf('muddying')))
      .toBeGreaterThan(consequenceWeight(verdictOf('inaudible')));
  });

  it('does not reward success — that is how an engine plays one move forever', () => {
    expect(consequenceWeight(verdictOf('effective'))).toBe(1);
    expect(consequenceWeight(verdictOf('subtractive'))).toBe(1);
  });

  it('is neutral when there is no history', () => {
    expect(consequenceWeight(undefined)).toBe(1);
  });
});

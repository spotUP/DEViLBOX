/**
 * Ported from varyform/re-rebirth (no licence granted yet) - do not push until licensed.
 * re-rebirth Compressor: a lower threshold lowers the peak of a loud tone.
 */
import { describe, it, expect } from 'vitest';
import { peakAbs } from '@/engine/tone/__tests__/toneKnobRender';
import { renderEffect, sine } from './fxRender';

const peak = async (threshold: number): Promise<number> => {
  const r = await renderEffect({
    type: 'ReRebirthCompressor', parameters: { amount: 0.8, threshold }, seconds: 1.2, source: sine(220, 0.9),
  });
  return peakAbs(r, 0.6, 1.1);
};

describe('re-rebirth Compressor through the registry', () => {
  it('a lower threshold gives a lower peak', async () => {
    const high = await peak(0.95);
    const low = await peak(0.1);
    expect(low).toBeLessThan(high * 0.8);
  }, 60000);
});

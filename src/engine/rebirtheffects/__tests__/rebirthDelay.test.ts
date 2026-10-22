/**
 * Ported from varyform/re-rebirth (no licence granted yet) - do not push until licensed.
 * re-rebirth Delay: the steps knob moves the arrival time of the echo.
 */
import { describe, it, expect } from 'vitest';
import { renderEffect, SR } from './fxRender';

const echoAt = async (steps: number): Promise<number> => {
  const r = await renderEffect({
    type: 'ReRebirthDelay', parameters: { steps, feedback: 0, pan: 0.5, triplet: 0 }, seconds: 1.4, bpm: 120,
    source: (i) => (i < 20 ? 0.8 : 0),
  });
  // First sample after the dry click (and its tail) whose level is an echo.
  let peak = 0;
  for (let i = Math.round(SR * 0.05); i < r.samples.length; i++) peak = Math.max(peak, Math.abs(r.samples[i]));
  for (let i = Math.round(SR * 0.05); i < r.samples.length; i++) if (Math.abs(r.samples[i]) > peak * 0.5) return i / SR;
  return -1;
};

describe('re-rebirth Delay through the registry', () => {
  it('more steps delay the echo later, near the tempo time', async () => {
    const short = await echoAt(2 / 31);
    const long = await echoAt(6 / 31);
    expect(short).toBeGreaterThan(0);
    expect(long).toBeGreaterThan(short + 0.1);
  }, 60000);
});

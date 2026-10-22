/**
 * Ported from varyform/re-rebirth (no licence granted yet) - do not push until licensed.
 * re-rebirth Distortion: the amount knob raises harmonic energy (clip mode), and moves it in fold mode.
 */
import { describe, it, expect } from 'vitest';
import { toneAmplitude } from '@/engine/tone/__tests__/toneKnobRender';
import { renderEffect, sine } from './fxRender';

const harmonics = async (amount: number, shape: number): Promise<number> => {
  const r = await renderEffect({ type: 'ReRebirthDistortion', parameters: { amount, shape }, seconds: 0.6, source: sine(440, 0.4) });
  const fundamental = Math.max(1e-9, toneAmplitude(r, 440, 0.2, 0.55));
  return (toneAmplitude(r, 1320, 0.2, 0.55) + toneAmplitude(r, 2200, 0.2, 0.55) + toneAmplitude(r, 3080, 0.2, 0.55)) / fundamental;
};

describe('re-rebirth Distortion through the registry', () => {
  it('clip mode: a higher amount puts more energy in the odd harmonics', async () => {
    const low = await harmonics(0.05, 0);
    const high = await harmonics(0.9, 0);
    expect(high).toBeGreaterThan(low * 2);
  }, 60000);

  it('fold mode: the amount knob changes the harmonic balance', async () => {
    const low = await harmonics(0.05, 0.6);
    const high = await harmonics(0.9, 0.6);
    expect(Math.abs(high - low)).toBeGreaterThan(0.1);
  }, 60000);
});

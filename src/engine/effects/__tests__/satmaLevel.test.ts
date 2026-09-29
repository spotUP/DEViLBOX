/**
 * Satma comes out at a mix's level, and louder input never comes out quieter.
 *
 * Three defects (2026-09-29): the soft clipper clamped at +-1.5 on
 * x - x^3/3, whose peak is at 1, so a hotter signal FOLDED BACK to a smaller
 * one (1.5 -> 0.375); the drive had no makeup, +11 dB at -18 dBFS; and the
 * tone knob's centre summed its low-pass and high-pass halves to -6 dB.
 * Runs the real WASM build on centre pink noise at -18 dBFS RMS.
 */
import { describe, it, expect } from 'vitest';
import { noiseGainDb } from './wasmEffectHarness';

// noiseGainDb's pink is Kellet * 0.11 * amp * 4; this amp reads -18 dBFS RMS.
const AMP_MINUS_18 = 0.227;

describe('Satma', () => {
  it('stays within 2 dB of a -18 dBFS input at every drive, tone centred', async () => {
    for (const distortion of [0, 0.25, 0.5, 0.75, 1]) {
      const g = await noiseGainDb('satma', 'Satma', 'satma', { distortion, tone: 0.5, mix: 1 }, 2, AMP_MINUS_18, 'pink', true);
      expect(Math.abs(g), `distortion ${distortion}: ${g.toFixed(1)} dB`).toBeLessThan(2);
    }
  }, 60000);

  it('gets no quieter when the input gets 10 dB louder', async () => {
    for (const distortion of [0, 0.5, 1]) {
      const p = { distortion, tone: 0.5, mix: 1 };
      const ref = await noiseGainDb('satma', 'Satma', 'satma', p, 2, AMP_MINUS_18, 'pink', true);
      const loud = await noiseGainDb('satma', 'Satma', 'satma', p, 2, AMP_MINUS_18 * 3.162, 'pink', true);
      // Output level = input level + gain; the loud input is 10 dB up.
      expect(loud + 10, `distortion ${distortion}: ${(loud + 10).toFixed(1)} vs ${ref.toFixed(1)}`).toBeGreaterThan(ref - 0.5);
    }
  }, 60000);
});

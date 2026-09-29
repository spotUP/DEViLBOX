/**
 * Multiband effects sum flat when they do nothing.
 *
 * Their crossovers summed a low-pass and high-pass that cancel at the split
 * frequency, and the lower bands never carried the higher splits' phase:
 * measured at default settings, MultibandComp -47 dB at 3 kHz, MultibandEnhancer
 * -25.6 dB at 8 kHz (2026-09-29) - every Modern master preset sounded thin, and
 * disabling one effect never fixed it because another still notched. Now one
 * Linkwitz-Riley 4th-order splitter (wasm-common/lr4_crossover.h) with
 * all-pass compensation. Runs the real WASM builds.
 */
import { describe, it, expect } from 'vitest';
import { multitoneGainDb } from './wasmEffectHarness';

const FREQS = [40, 100, 150, 200, 250, 1000, 2000, 3000, 4000, 8000, 12000];

describe('multiband effects at neutral settings', () => {
  const cases: [string, string, string, string, Record<string, number>][] = [
    ['MultibandComp (ratio 1)', 'multiband-comp', 'MultibandComp', 'multiband_comp', { low_ratio: 1, mid_ratio: 1, high_ratio: 1 }],
    ['MultibandEnhancer (width 1)', 'multiband-enhancer', 'MultibandEnhancer', 'multiband_enhancer', {}],
    ['MultibandGate (open)', 'multiband-gate', 'MultibandGate', 'multiband_gate', { lowThresh: -80, midThresh: -80, highThresh: -80 }],
    ['MultibandLimiter (0 dB ceilings)', 'multiband-limiter', 'MultibandLimiter', 'multiband_limiter', { lowCeil: 0, midCeil: 0, highCeil: 0 }],
    // mix < 1 blended the raw input with the 64-sample-delayed bands: a comb.
    ['MultibandLimiter (half mix)', 'multiband-limiter', 'MultibandLimiter', 'multiband_limiter', { lowCeil: 0, midCeil: 0, highCeil: 0, mix: 0.5 }],
  ];
  for (const [label, dir, stem, prefix, params] of cases) {
    it(`${label} passes every frequency within 0.5 dB, crossovers included`, async () => {
      const gains = await multitoneGainDb(dir, stem, prefix, params, FREQS);
      for (let i = 0; i < FREQS.length; i++) expect(Math.abs(gains[i]), `${FREQS[i]} Hz`).toBeLessThan(0.5);
    });
  }
});

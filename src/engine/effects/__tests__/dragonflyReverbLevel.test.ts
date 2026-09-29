/**
 * The Dragonfly reverbs come out at the input's level, whatever the decay.
 *
 * Their all-passes were the Freeverb-style kind (noise power gain
 * 1 + 1/(1-g^2) per stage) without Freeverb's 0.015 input gain, and four
 * combs summed at a fixed 0.25 whatever their feedback: at wet 100 % on
 * pink noise the Hall read +19 dB, the Room +18, the Plate +14, rising with
 * decay (2026-09-29). The first fix was calibrated on unfiltered pink noise,
 * whose sub-20 Hz part lands on the combs' in-phase DC gain: in the app, on
 * music, the three then read 12-16 dB quiet and fell further with decay.
 * Runs the real WASM builds on centre (L = R) pink noise high-passed at
 * 20 Hz. Shimmer
 * Reverb read -16 dB for the opposite reason: an output gain 12.5 dB short.
 */
import { describe, it, expect } from 'vitest';
import { noiseGainDb, noiseGainDbClass } from './wasmEffectHarness';

const REVERBS: [string, string, string][] = [
  ['dragonfly-hall', 'DragonflyHall', 'dragonfly_hall'],
  ['dragonfly-plate', 'DragonflyPlate', 'dragonfly_plate'],
  ['dragonfly-room', 'DragonflyRoom', 'dragonfly_room'],
];

describe('Dragonfly reverbs', () => {
  for (const [dir, stem, prefix] of REVERBS) {
    it(`${stem} stays within 4 dB of the input from short to long decay`, async () => {
      for (const decay of [0.3, 0.8, 0.95]) {
        const g = await noiseGainDb(dir, stem, prefix, { decay }, 3, 0.1, 'pink', true);
        expect(Math.abs(g), `decay ${decay}: ${g.toFixed(1)} dB`).toBeLessThan(4);
      }
    }, 60000);
  }

  it('Shimmer Reverb stays within 2 dB of the input at wet 100 %', async () => {
    const defaults = { 0: 0.5, 1: 0.3, 2: 12, 3: 0.6, 4: 0.6, 5: 0, 6: 0.3, 7: 0.2, 8: 1 };
    for (const decay of [0.2, 0.5, 0.8]) {
      const g = await noiseGainDbClass('shimmer-reverb', 'ShimmerReverb', 'ShimmerReverbEffect', { ...defaults, 0: decay }, 3, 0.1, 'pink');
      expect(Math.abs(g), `decay ${decay}: ${g.toFixed(1)} dB`).toBeLessThan(2);
    }
  }, 60000);
});

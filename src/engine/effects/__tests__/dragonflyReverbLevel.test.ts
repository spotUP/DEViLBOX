/**
 * The Dragonfly reverbs come out at the input's level, whatever the decay.
 *
 * Their all-passes were the Freeverb-style kind (noise power gain
 * 1 + 1/(1-g^2) per stage) without Freeverb's 0.015 input gain, and four
 * combs summed at a fixed 0.25 whatever their feedback: at wet 100 % on
 * pink noise the Hall read +19 dB, the Room +18, the Plate +14, rising with
 * decay (2026-09-29). Runs the real WASM builds on white noise.
 */
import { describe, it, expect } from 'vitest';
import { noiseGainDb } from './wasmEffectHarness';

const REVERBS: [string, string, string][] = [
  ['dragonfly-hall', 'DragonflyHall', 'dragonfly_hall'],
  ['dragonfly-plate', 'DragonflyPlate', 'dragonfly_plate'],
  ['dragonfly-room', 'DragonflyRoom', 'dragonfly_room'],
];

describe('Dragonfly reverbs', () => {
  for (const [dir, stem, prefix] of REVERBS) {
    it(`${stem} stays within 3 dB of the input from short to long decay`, async () => {
      for (const decay of [0.3, 0.8, 0.95]) {
        const g = await noiseGainDb(dir, stem, prefix, { decay });
        expect(Math.abs(g), `decay ${decay}: ${g.toFixed(1)} dB`).toBeLessThan(3);
      }
    }, 60000);
  }
});

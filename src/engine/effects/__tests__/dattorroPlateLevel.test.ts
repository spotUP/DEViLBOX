/**
 * The Dattorro plate passes its level through at every decay.
 *
 * The plate's tank output grew with its feedback (damped: 1/(1 - 0.897 g^2))
 * on top of a +4.2 dB tap gain - +4.2 dB at decay 0.1 to +11.4 dB at 0.95 over
 * its input at 100 % wet, measured 2026-09-30 - and the dub bus's plate stage
 * drowned the mix ("the echo/reverb is still on overdrive drowning
 * everything"). The C++ now applies the inverse, as the Dragonfly reverbs are
 * scaled at source. Runs the real WASM build, pink noise, 100 % wet, 8 s so
 * the long tails settle.
 */
import { describe, it, expect } from 'vitest';
import { noiseGainDbClass } from './wasmEffectHarness';

const PARAM_DECAY = 4;

describe('Dattorro plate level', () => {
  for (const decay of [0.1, 0.3, 0.5, 0.7, 0.85, 0.95]) {
    it(`is within 1 dB of its input at decay ${decay}`, async () => {
      const db = await noiseGainDbClass('dattorro-plate', 'DattorroPlate', 'DattorroPlateEffect', { [PARAM_DECAY]: decay }, 8, 0.1, 'pink', true);
      expect(Math.abs(db)).toBeLessThan(1);
    }, 60000);
  }
});

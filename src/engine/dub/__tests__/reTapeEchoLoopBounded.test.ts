/**
 * The RE-Tape Echo on the dub bus decays at every intensity - no runaway.
 *
 * Owner, 2026-09-30: "the echo/reverb is still on overdrive drowning
 * everything". Measured live the same day, the RE-Tape Echo engine at the
 * bus's intensity 0.85 came out +25.5 dB over its input while the other
 * engines sat within +5 dB: its playhead EQ adds up to 8.7 dB inside the
 * feedback loop and its intensity is a dB scale, so the bus's intensity
 * passed straight in crossed unity loop gain at ~0.71 and self-oscillated.
 * The adapter now asks the engine for the bus's loop gain.
 *
 * Runs the real WASM build (public/re-tape-echo) with the adapter's settings,
 * pink noise, dub-length tape speed (every dub echo time clamps to the
 * slowest speed), 6 s so a slow build-up shows.
 */
import { describe, it, expect } from 'vitest';
import { noiseGainDb } from '@engine/effects/__tests__/wasmEffectHarness';
import { reTapeEchoIntensity } from '../DubEchoEngine';

const busSettings = (intensity: number) => ({
  mode: 3, repeat_rate: 0, intensity, echo_volume: 0.85, wow: 0.3, flutter: 0.25, dirt: 0.15, playhead_filter: 1,
});
const gainDb = (engineIntensity: number) =>
  noiseGainDb('re-tape-echo', 'RETapeEcho', 're_tape_echo', busSettings(engineIntensity), 6, 0.1, 'pink', true);

describe('RE-Tape Echo on the dub bus', () => {
  for (const bus of [0.3, 0.62, 0.85, 1]) {
    it(`stays within +6 dB of its input at the bus's intensity ${bus}`, async () => {
      const db = await gainDb(reTapeEchoIntensity(bus));
      expect(db).toBeLessThan(6);
    }, 60000);
  }

  it('gets louder as the intensity rises', async () => {
    const levels = [];
    for (const bus of [0.3, 0.62, 0.85]) levels.push(await gainDb(reTapeEchoIntensity(bus)));
    expect(levels[1]).toBeGreaterThan(levels[0]);
    expect(levels[2]).toBeGreaterThan(levels[1]);
  }, 60000);

  it('never asks the engine for a loop gain at or above unity', () => {
    for (let i = 0; i <= 100; i++) {
      const engine = reTapeEchoIntensity(i / 100);
      const fbGain = 10 ** ((engine * 30 - 30) / 20);
      expect(fbGain * 10 ** (8.73 / 20)).toBeLessThan(0.91);
    }
  });
});

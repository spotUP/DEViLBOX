/**
 * The RE-201 on the dub bus decays with any head combination.
 *
 * Owner, 2026-09-30: "re-201 it self oscillates? it gets stronger and
 * stronger". The RE-201 sums every active head into its feedback at
 * intensity x 0.85 each; the Tubby persona's mode 9 (three heads) at the
 * bus's intensity 0.62 has a loop gain of ~1.6, so a single burst built up
 * until the tape saturation held it. The adapter now shares the bus's
 * intensity over the heads. Runs the real WASM build: a 20 ms burst, then
 * silence; the last half second must be far below the first repeats.
 */
import { describe, it, expect } from 'vitest';
import { loadWasmEffect } from '@engine/effects/__tests__/wasmEffectHarness';
import { re201Intensity } from '../DubEchoEngine';

async function tailRatioDb(delayMode: number, engineIntensity: number): Promise<number> {
  const { m, heap } = await loadWasmEffect('re201', 'RE201');
  const h = m._re201_create(48000);
  m._re201_set_delay_mode(h, delayMode);
  m._re201_set_repeat_rate(h, 0.585); // ~320 ms, as the adapter maps it
  m._re201_set_intensity(h, engineIntensity);
  m._re201_set_echo_volume(h, 0.9);
  m._re201_set_reverb_volume(h, 0);
  const block = 128, bytes = block * 4;
  const iL = m._malloc(bytes), iR = m._malloc(bytes), oL = m._malloc(bytes), oR = m._malloc(bytes);
  const seconds = 6, blocks = (48000 * seconds) / block;
  let early = 0, late = 0;
  for (let b = 0; b < blocks; b++) {
    const x = new Float32Array(block);
    if (b * block < 960) for (let i = 0; i < block; i++) x[i] = Math.sin(i * 0.3) * 0.5;
    heap().set(x, iL >> 2); heap().set(x, iR >> 2);
    m._re201_process(h, iL, iR, oL, oR, block);
    const y = heap().subarray(oL >> 2, (oL >> 2) + block);
    const t = (b * block) / 48000;
    for (let i = 0; i < block; i++) {
      if (t < 1.5) early += y[i] * y[i];
      if (t > seconds - 0.5) late += y[i] * y[i];
    }
  }
  return 10 * Math.log10((late / 0.5) / (early / 1.5) + 1e-20);
}

describe('RE-201 on the dub bus', () => {
  it('three heads at the old intensity run away (the bug)', async () => {
    expect(await tailRatioDb(9, 0.62)).toBeGreaterThan(-10);
  }, 60000);

  for (const mode of [1, 4, 9]) {
    it(`mode ${mode} decays at the bus's intensity 0.62 and 0.85`, async () => {
      for (const bus of [0.62, 0.85]) {
        expect(await tailRatioDb(mode, re201Intensity(bus, mode)), `bus ${bus}`).toBeLessThan(-20);
      }
    }, 60000);
  }
});

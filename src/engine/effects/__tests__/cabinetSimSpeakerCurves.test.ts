/**
 * Cabinet Simulator cabinets are speaker curves, level-neutral at 1 kHz.
 *
 * The cabinets were synthetic 256-tap FIRs built from decaying sine waves
 * (narrow band-passes, windowed from their start): at the defaults -59 dB at
 * 1 kHz and -159 dB at 10 kHz (tools/master-fx-response-audit.ts,
 * 2026-09-29). Runs the real WASM.
 */
import { describe, it, expect } from 'vitest';
import { multitoneGainDb } from './wasmEffectHarness';

const F = [60, 100, 250, 500, 1000, 2500, 4000, 10000];
const at = (g: number[], f: number) => g[F.indexOf(f)];

describe('Cabinet Simulator', () => {
  for (const cabinet of [0, 1, 2]) {
    it(`cabinet ${cabinet}: mids pass at unity, lows and mids within 6 dB, the top rolls off`, async () => {
      const g = await multitoneGainDb('cabinet-sim', 'CabinetSim', 'cabinet_sim', { cabinet, brightness: 0.5 }, F);
      expect(Math.abs(at(g, 1000))).toBeLessThan(0.5);
      for (const f of [100, 250, 500, 2500, 4000]) expect(Math.abs(at(g, f)), `${f} Hz`).toBeLessThan(6);
      expect(at(g, 10000)).toBeLessThan(-15);
    });
  }

  it('DI at neutral brightness is flat', async () => {
    const g = await multitoneGainDb('cabinet-sim', 'CabinetSim', 'cabinet_sim', { cabinet: 3, brightness: 0.5 }, F);
    for (let i = 0; i < F.length; i++) expect(Math.abs(g[i]), `${F[i]} Hz`).toBeLessThan(0.5);
  });
});

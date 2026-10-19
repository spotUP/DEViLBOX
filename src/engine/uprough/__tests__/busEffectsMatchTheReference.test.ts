/**
 * The bus effects against synth_dsp.py / sampler.py / softsynth_engine.py: fixtures/bus_effects.json holds the
 * test signal and every 13th output sample of each effect at its defaults and at non-default options
 * (tools/softsynth-fixtures/gen_bus_effects.py). The port is float64 with the same op order and RNG draws.
 * The bound is 1e-9 per kept sample; a case may carry a looser entry in TOLERANCE with its reason.
 */
import { describe, expect, it } from 'vitest';
import * as bus from '../effects/busEffects';
import fixture from './fixtures/bus_effects.json';

interface Case { effect: string; options: Record<string, unknown>; length: number; rms: number; samples: number[] }
const ref = fixture as unknown as { rate: number; keep: number; input: number[]; cases: Case[] };
const X = Float64Array.from(ref.input);
const RATE = ref.rate;

type Runner = (o: Record<string, unknown>) => ArrayLike<number>;
const RUN: Record<string, Runner> = {
  softClip: (o) => bus.softClip(X, o.drive as number | undefined),
  tapeSat: (o) => bus.tapeSat(X, o.drive as number | undefined),
  tube: (o) => bus.tube(X, o.drive as number | undefined, o.bias as number | undefined),
  delay: (o) => bus.delay(X, RATE, o),
  chorus: (o) => bus.chorus(X, RATE, o),
  schroederReverb: (o) => bus.schroeder(X, RATE, o),
  samplerReverb: (o) => bus.reverb(X, RATE, o),
  drumBus: (o) => bus.drumBus(X, RATE, o),
  parallelDirt: (o) => bus.parallelDirt(X, RATE, o),
  mixerColor: (o) => bus.mixerColor(X, RATE, o),
  vinylSurface: (o) => bus.addVinylSurface(X, RATE, o),
  vintageCharacter: (o) => bus.vintageCharacter(X, RATE, o),
  samplerProcess: (o) => bus.samplerProcess(X, o.profile as string, RATE, o.dither as boolean | undefined, o.seed as number | undefined),
  paulaZoh: (o) => bus.paulaZoh(X, RATE, o.replayRate as number | undefined),
  paulaFilter: (o) => bus.paulaFilter(X, RATE, o),
  masterBus: (o) => bus.masterBus(X, o),
};

/** Looser bounds than 1e-9, with the reason. Empty when every case holds the default bound. */
const TOLERANCE: Record<string, number> = {};

describe('bus effects match the Python reference', () => {
  it('has a fixture case for every effect the port exports', () => {
    expect(new Set(ref.cases.map((c) => c.effect))).toEqual(new Set(Object.keys(RUN)));
  });

  it('declares labelled metadata with in-range defaults for every metadata id', () => {
    for (const [id, m] of Object.entries(bus.BUS_EFFECTS)) {
      expect(m.label.length, id).toBeGreaterThan(3);
      for (const p of m.parameters) {
        expect(p.label.length, `${id}.${p.key}`).toBeGreaterThan(2);
        if (p.type === 'knob') { expect(p.default).toBeGreaterThanOrEqual(p.min!); expect(p.default).toBeLessThanOrEqual(p.max!); }
      }
    }
  });

  ref.cases.forEach((c, i) => {
    it(`${c.effect} case ${i} (${JSON.stringify(c.options).slice(0, 70)}) is sample-exact`, () => {
      const y = RUN[c.effect]!(c.options);
      expect(y.length).toBe(c.length);
      const bound = TOLERANCE[`${c.effect}:${i}`] ?? TOLERANCE[c.effect] ?? 1e-9;
      let worst = 0;
      c.samples.forEach((r, k) => { worst = Math.max(worst, Math.abs(y[k * ref.keep]! - r)); });
      expect(worst).toBeLessThanOrEqual(bound);
      let sq = 0;
      for (let k = 0; k < y.length; k++) sq += y[k]! * y[k]!;
      expect(Math.abs(Math.sqrt(sq / y.length) - c.rms)).toBeLessThanOrEqual(bound);
    });
  });
});

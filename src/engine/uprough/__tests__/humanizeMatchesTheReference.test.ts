/**
 * humanize.ts against synth_dsp.humanize + hiphop._vary_hit: fixtures/humanize.json
 * (tools/softsynth-fixtures/gen_humanize.py), 1e-9 per kept sample, equal lengths, equal draws.
 */
import { describe, expect, it } from 'vitest';
import { NumpyRandomState } from '@/engine/turntable/turntableSim';
import { humanizeDraw, humanizeSeed, varyHit } from '../humanize';
import fixture from './fixtures/humanize.json';

interface Case { seed: number; tighten: number; h: Record<string, number>; dtype: string; length: number; samples: number[] }
const ref = fixture as unknown as { keep: number; cases: Case[] };
const input = new NumpyRandomState(7).uniformArray(-1, 1, 2600);

describe('humanize matches the reference', () => {
  ref.cases.forEach((c, i) => {
    it(`case ${i} (seed ${c.seed}, tighten ${c.tighten}, ${c.dtype}) draws and varies the hit exactly`, () => {
      const h = humanizeDraw(c.seed);
      for (const k of ['cents', 'gain', 'attack', 'start'] as const) expect(Math.abs(h[k] - c.h[k]!)).toBeLessThanOrEqual(1e-12);
      const y = varyHit(input, h, c.tighten);
      expect(y.length).toBe(c.length);
      let worst = 0;
      c.samples.forEach((r, k) => { worst = Math.max(worst, Math.abs(y[k * ref.keep]! - r)); });
      expect(worst).toBeLessThanOrEqual(1e-9);
    });
  });

  it('covers both numpy dtypes and the per-hit seed differs between hits', () => {
    expect(new Set(ref.cases.map((c) => c.dtype))).toEqual(new Set(['float32', 'float64']));
    expect(humanizeSeed(3, 0)).not.toBe(humanizeSeed(3, 1));
  });
});

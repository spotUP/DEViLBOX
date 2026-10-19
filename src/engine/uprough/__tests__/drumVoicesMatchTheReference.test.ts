/**
 * The drum SoftsynthVoices against tools/drummachine.py: fixtures/drums.json holds every 13th sample of
 * each Python voice at its defaults and two non-default parameter sets
 * (tools/softsynth-fixtures/gen_drums.py). The port is float64 with the same op order and RNG draws, so the
 * bound is 1e-9 per kept sample and the lengths are equal.
 */
import { describe, expect, it } from 'vitest';
import { DRUM_VOICES } from '../voices/drums';
import { SOFTSYNTH_RATE } from '../softsynthVoice';
import fixture from './fixtures/drums.json';

interface Case { voice: string; seed: number; params: Record<string, number>; length: number; rms: number; samples: number[] }
const ref = fixture as unknown as { keep: number; cases: Case[] };
const cases = ref.cases;
const keep = ref.keep;

describe('drum voices match drummachine.py', () => {
  it('declares the twelve voices with unique ids and in-range defaults', () => {
    expect(DRUM_VOICES.map((v) => v.id)).toEqual(['kick', 'snare808', 'snare909', 'clap', 'hatClosed', 'hatOpen', 'hatPedal', 'tom', 'rim', 'cowbell', 'conga', 'ride']);
    for (const v of DRUM_VOICES) for (const p of v.params) {
      if (p.type === 'knob') { expect(p.default).toBeGreaterThanOrEqual(p.min!); expect(p.default).toBeLessThanOrEqual(p.max!); }
    }
  });

  cases.forEach((c, i) => {
    it(`${c.voice} case ${i} (${JSON.stringify(c.params).slice(0, 60)}) is sample-exact`, () => {
      const voice = DRUM_VOICES.find((v) => v.id === c.voice)!;
      const y = voice.render(c.params, { midi: 60, durSec: 0.5, velocity: 1 }, SOFTSYNTH_RATE, c.seed);
      expect(y.length).toBe(c.length);
      let worst = 0;
      c.samples.forEach((ref, k) => { worst = Math.max(worst, Math.abs(y[k * keep]! - ref)); });
      expect(worst).toBeLessThanOrEqual(1e-9);
      let sq = 0;
      for (let k = 0; k < y.length; k++) sq += y[k]! * y[k]!;
      expect(Math.abs(Math.sqrt(sq / y.length) - c.rms)).toBeLessThanOrEqual(1e-9);
    });
  });

  it('velocity scales the output and the note shifts tune', () => {
    const kick = DRUM_VOICES.find((v) => v.id === 'kick')!;
    const a = kick.render({}, { midi: 60, durSec: 0.5, velocity: 1 }, SOFTSYNTH_RATE, 1);
    const half = kick.render({}, { midi: 60, durSec: 0.5, velocity: 0.5 }, SOFTSYNTH_RATE, 1);
    const up = kick.render({}, { midi: 72, durSec: 0.5, velocity: 1 }, SOFTSYNTH_RATE, 1);
    expect(half[100]).toBeCloseTo(a[100]! * 0.5, 12);
    expect(up[3000]).not.toBe(a[3000]);
  });
});

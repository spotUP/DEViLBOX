/**
 * The song-mix stage against tools/hiphop.py: fixtures/song_mix.json holds the lane buffers, the mirrored constants and
 * every 7th output sample of bus balance, make-up, drum trim, the sample echo, the scratch duck and the master texture
 * (tools/softsynth-fixtures/gen_song_mix.py, which calls the real Python). The bound is 1e-9 per kept sample unless
 * TOLERANCE says otherwise with its reason.
 */
import { describe, expect, it } from 'vitest';
import * as mix from '../mix/songMix';
import fixture from './fixtures/song_mix.json';

interface Out { length: number; rms: number; samples: number[] }
interface Case extends Partial<Out> {
  fn: string; input?: string; options?: Record<string, unknown>; scalar?: number; trim?: number; model?: string;
  outputs?: Record<string, Out>;
}
const ref = fixture as unknown as {
  rate: number; keep: number; barLen: number; lanes: Record<string, number[]>; sparse: number[];
  constants: { MIX_GAINS: Record<string, number>; BUS_REFERENCE_RMS: number; BUS_REFERENCE_PEAK: number;
    SAMPLE_ECHO: { send: number; fb: number }; STYLE_TEXTURE: Record<string, { tape: number; vinyl: number }> };
  cases: Case[];
};
const RATE = ref.rate;
const lane = (k: string): Float64Array => Float64Array.from(ref.lanes[k]!);
const LOUD = lane('drums');
const QUIET = lane('melody').map((v) => v * 0.4);
const INPUTS: Record<string, Float64Array> = {
  loud: LOUD, quiet: QUIET, sparse: Float64Array.from(ref.sparse), tiny: LOUD.slice(0, 100),
  sample: lane('sample'), vocal: lane('vocal'), melody: lane('melody'),
};
const MIXED = Float64Array.from(LOUD, (_, i) => (LOUD[i]! + lane('bass')[i]! + lane('sample')[i]! + lane('melody')[i]!) * 0.3);

/** Looser bounds than 1e-9, with the reason. Empty when every case holds the default bound. */
const TOLERANCE: Record<string, number> = {};

function check(label: string, y: ArrayLike<number>, r: Out, bound: number): number {
  expect(y.length, label).toBe(r.length);
  let worst = 0;
  r.samples.forEach((v, k) => { worst = Math.max(worst, Math.abs(y[k * ref.keep]! - v)); });
  let sq = 0;
  for (let k = 0; k < y.length; k++) sq += y[k]! * y[k]!;
  worst = Math.max(worst, Math.abs(Math.sqrt(sq / y.length) - r.rms));
  expect(worst, label).toBeLessThanOrEqual(bound);
  return worst;
}

describe('song mix matches the Python reference', () => {
  it('mirrors the Python constants', () => {
    expect(mix.MIX_GAINS).toEqual(ref.constants.MIX_GAINS);
    expect(mix.BUS_REFERENCE_RMS).toBe(ref.constants.BUS_REFERENCE_RMS);
    expect(mix.BUS_REFERENCE_PEAK).toBe(ref.constants.BUS_REFERENCE_PEAK);
    expect(mix.SAMPLE_ECHO).toEqual(ref.constants.SAMPLE_ECHO);
    expect(mix.STYLE_TEXTURE).toEqual(ref.constants.STYLE_TEXTURE);
  });

  it('covers every branch of the texture choice', () => {
    const models = new Set(ref.cases.filter((c) => c.fn === 'applyTexture' && c.model).map((c) => c.model));
    expect(models).toEqual(new Set(['a500', 'a1200']));
    const tapes = Object.values(mix.STYLE_TEXTURE).map((s) => s.tape);
    expect(tapes.some((t) => t <= 0.25) && tapes.some((t) => t > 0.25 && t <= 0.3) && tapes.some((t) => t > 0.3)).toBe(true);
    expect(ref.cases.filter((c) => c.fn === 'applyTexture' && c.options!.masterRev !== undefined).length).toBeGreaterThanOrEqual(3);
  });

  ref.cases.forEach((c, i) => {
    it(`${c.fn} case ${i} (${JSON.stringify(c.options ?? c.input ?? '').slice(0, 70)}) is sample-exact`, () => {
      const o = c.options ?? {};
      const bound = TOLERANCE[`${c.fn}:${i}`] ?? TOLERANCE[c.fn] ?? 1e-9;
      const label = `${c.fn}:${i}`;
      const x = c.input ? INPUTS[c.input]! : LOUD;
      switch (c.fn) {
        case 'busRms': expect(Math.abs(mix.busRms(x) - c.scalar!)).toBeLessThanOrEqual(bound); break;
        case 'activeRms':
          expect(Math.abs(mix.activeRms(x, RATE, o.floorDb as number | undefined, o.frameSec as number | undefined) - c.scalar!)).toBeLessThanOrEqual(bound);
          break;
        case 'busMakeup': check(label, mix.busMakeup(x, o.preRms as number, o.cap as number), c as Out, bound); break;
        case 'trimDrumsToPeak': {
          const t = mix.trimDrumsToPeak(x);
          expect(Math.abs(t.trim - c.trim!)).toBeLessThanOrEqual(bound);
          check(label, t.buf, c as Out, bound);
          break;
        }
        case 'restoreDrumTrim': check(label, mix.restoreDrumTrim(mix.trimDrumsToPeak(x).buf, o.trim as number), c as Out, bound); break;
        case 'balanceBuses': {
          const bufs = { drums: lane('drums'), bass: lane('bass'), sample: lane('sample'), melody: lane('melody'), vocal: lane('vocal'), reinforce: lane('reinforce') };
          if (o.silent) bufs[o.silent as 'melody'].fill(0);
          const y = mix.balanceBuses(bufs, { bassGain: o.bassGain as number, hasDrums: o.hasDrums as boolean });
          for (const [k, r] of Object.entries(c.outputs!)) check(`${label}.${k}`, y[k as 'drums']!, r, bound);
          break;
        }
        case 'echo': check(label, mix.echo(x, RATE, o.delaySec as number, o.fb as number, o.g as number, o.damp as number | undefined), c as Out, bound); break;
        case 'duckUnderVoice':
          check(label, mix.duckUnderVoice(x, o.voiceBars as number[], o.barLen as number, RATE, o.floor as number, o.fadeSec as number), c as Out, bound);
          break;
        case 'applyTexture': check(label, mix.applyTexture(MIXED, RATE, o as { style: string }), c as Out, bound); break;
        default: throw new Error(`no runner for ${c.fn}`);
      }
    });
  });
});

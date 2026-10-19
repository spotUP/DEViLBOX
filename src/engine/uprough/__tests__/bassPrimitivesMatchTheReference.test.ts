/**
 * The bass DSP primitives against the Up Rough reference (synth_dsp osc / drift_curve / moog_ladder / distort / fm_2op /
 * karplus, synth_factory _env). Fixture: tools/softsynth-fixtures/gen_bass_primitives.py (every 13th sample, + length + RMS).
 *
 * Tolerance 1e-9 per kept sample. karplus(fractional) has no host reference (the host raises), so it is not asserted here.
 */
import { afterAll, describe, expect, it } from 'vitest';
import fixture from './fixtures/bass_primitives.json';
import { distort, driftCurve, env, fm2op, karplus, moogLadder, osc, type OscKind } from '../synthDsp';

const TOL = 1e-9;
const N = 4410;
const RATE = fixture.rate;

interface Sig { length: number; rms: number; kept: number[] }
interface Case { params: Record<string, any>; signal: Sig }  // eslint-disable-line @typescript-eslint/no-explicit-any

const linspace = (a: number, b: number, n: number): Float64Array => {
  const out = new Float64Array(n);
  const step = (b - a) / (n - 1);
  for (let i = 0; i < n; i++) out[i] = i * step + a;
  out[n - 1] = b;
  return out;
};

const saw = osc('saw', 110.0, N, RATE);
const noise = osc('noise', 110.0, N, RATE, { seed: 5 });
const mix = ((): Float64Array => {
  const s = osc('sine', 140.0, N, RATE);
  return Float64Array.from(s, (v, i) => 0.8 * v + 0.3 * noise[i]!);
})();

function render(name: string, p: Record<string, any>): Float64Array {  // eslint-disable-line @typescript-eslint/no-explicit-any
  if (name.startsWith('osc_')) {
    const opts: Parameters<typeof osc>[4] = { seed: 7 };
    if (p.pw !== undefined) opts.pw = p.pw;
    if (p.pwLinspace) opts.pw = linspace(p.pwLinspace[0], p.pwLinspace[1], p.n);
    if (p.detune !== undefined) opts.detune = p.detune;
    if (p.phase0 !== undefined) opts.phase0 = p.phase0;
    if (p.fold !== undefined) opts.fold = p.fold;
    if (p.bandLimit !== undefined) opts.bandLimit = p.bandLimit;
    if (p.drift) opts.drift = driftCurve(p.drift.n, RATE, p.drift.depthCents, p.drift.hz, p.drift.seed);
    const freq = p.freqLinspace ? linspace(p.freqLinspace[0], p.freqLinspace[1], p.n) : p.freq;
    return osc(p.kind as OscKind, freq, p.n, RATE, opts);
  }
  if (name.startsWith('drift_')) return driftCurve(p.n, RATE, p.depthCents, p.hz, p.seed);
  if (name.startsWith('env_')) return env(p.n, p.a, p.d, p.sus, p.r, RATE);
  if (name.startsWith('moog_')) {
    const x = p.src === 'saw110' ? saw : noise;
    return moogLadder(x, p.fcLinspace ? linspace(p.fcLinspace[0], p.fcLinspace[1], p.n) : p.fc, p.res, RATE);
  }
  if (name.startsWith('distort_')) return p.drive === null ? distort(mix, p.kind) : distort(mix, p.kind, p.drive);
  if (name.startsWith('fm_')) {
    const k = p.kw;
    return fm2op(p.freq, p.n, RATE, k.ratio, k.index, k.feedback, k.car_decay, k.mod_decay);
  }
  if (name.startsWith('karplus_')) return karplus(p.freq, p.dur, RATE, p.damp, p.kind, p.seed, p.fractional ?? false);
  throw new Error('unknown case ' + name);
}

const worstByPrimitive: Record<string, number> = {};

describe('bass primitives match the reference', () => {
  Object.entries({ ...(fixture.cases as Record<string, Case>), ...(fixture.patched as Record<string, Case>) }).forEach(([name, c]) => {
    it(name, () => {
      const out = render(name, c.params);
      expect(out.length).toBe(c.signal.length);
      let worst = 0;
      c.signal.kept.forEach((ref, k) => { worst = Math.max(worst, Math.abs(out[k * fixture.keep]! - ref)); });
      const prim = name.split('_')[0]!;
      worstByPrimitive[prim] = Math.max(worstByPrimitive[prim] ?? 0, worst);
      expect(worst).toBeLessThanOrEqual(TOL);
      let s = 0; for (const x of out) s += x * x;
      expect(Math.abs(Math.sqrt(s / out.length) - c.signal.rms)).toBeLessThanOrEqual(TOL);
    });
  });

  afterAll(() => { console.log('MAXDIFF ' + JSON.stringify(worstByPrimitive)); });
});

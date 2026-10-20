/**
 * The melody-voice DSP primitives against the Up Rough reference (synth_dsp noise(white) / bp / hp / _phase / chorus).
 * Fixture: tools/softsynth-fixtures/gen_melody_primitives.py (every 13th sample, + length + RMS). Tolerance 1e-9.
 * bp / hp / phaseOf were already ported (refDsp, synthDsp); this fixture adds their cases.
 */
import { afterAll, describe, expect, it } from 'vitest';
import fixture from './fixtures/melody_primitives.json';
import { bp, hp } from '@/engine/dj/scratch/refDsp';
import { chorus, driftCurve, noise, osc, phaseOf, type ChorusKind } from '../synthDsp';

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

const src = noise('white', N, 9);
const tone = osc('saw', 220.0, N, RATE);

function render(name: string, p: Record<string, any>): Float64Array {  // eslint-disable-line @typescript-eslint/no-explicit-any
  if (name.startsWith('noise_')) return noise('white', p.n, p.seed);
  if (name.startsWith('bp_')) return bp(src, p.lo, p.hi, RATE, p.order);
  if (name.startsWith('hp_')) return hp(src, p.fc, RATE, p.poles);
  if (name.startsWith('phase_')) {
    const freq = p.freqLinspace ? linspace(p.freqLinspace[0], p.freqLinspace[1], p.n) : p.freq;
    const drift = p.drift ? driftCurve(p.drift.n, RATE, p.drift.depthCents, p.drift.hz, p.drift.seed) : null;
    return phaseOf(freq, p.n, RATE, p.phase0 ?? (drift ? 0.1 : 0.0), drift);
  }
  if (name.startsWith('chorus_')) {
    const k = p.kw;
    return chorus(tone, RATE, { kind: k.kind as ChorusKind, mix: k.mix, voices: k.voices, depthMs: k.depth_ms, rateHz: k.rate_hz, delayMs: k.delay_ms ?? null, phaseOffsets: k.phase_offsets ?? null });
  }
  throw new Error('unknown case ' + name);
}

const worstByPrimitive: Record<string, number> = {};

describe('melody primitives match the reference', () => {
  Object.entries(fixture.cases as Record<string, Case>).forEach(([name, c]) => {
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

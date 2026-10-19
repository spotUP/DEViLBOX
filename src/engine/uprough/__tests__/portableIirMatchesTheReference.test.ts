/**
 * portableIir.ts against tools/portable_iir.py, bit for bit: tan, the sin / cos kernels and every butter()
 * coefficient must be the identical float64 (Object.is), or the Python and TypeScript renders drift apart.
 * Fixture: tools/softsynth-fixtures/gen_portable_iir.py.
 */
import { describe, expect, it } from 'vitest';
import { kernelCos, kernelSin, portableButter, portableTan } from '@/engine/dj/scratch/portableIir';
import { pasin, pcos, pexp, pexpm1, psin, ptanh } from '@/engine/dj/scratch/portableMath';
import { besselI0, butter, firwinKaiser, resamplePoly } from '@/engine/dj/scratch/refDsp';
import ref from './fixtures/portable_iir.json';

type Case = { N: number; Wn: number | [number, number]; btype: 'low' | 'high' | 'band'; b: number[]; a: number[] };
const fx = ref as { tan: [number, number][]; sin: [number, number][]; cos: [number, number][]; butter: Case[];
  math: Record<'exp' | 'expm1' | 'tanh' | 'sin' | 'cos' | 'asin', [number, number][]>;
  i0: [number, number][]; resample_in: number[];
  resample: { up: number; down: number; y: number[] }[]; firwin: { numtaps: number; cutoff: number; h: number[] }[] };

const sameBits = (got: ArrayLike<number>, want: number[]) =>
  got.length === want.length && want.every((v, i) => Object.is(got[i], v));

const mismatches = (pairs: [number, number][], f: (x: number) => number) =>
  pairs.filter(([x, y]) => !Object.is(f(x), y)).map(([x, y]) => `${x}: ${f(x)} != ${y}`);

describe('portable_iir mirror is bit-exact', () => {
  it('tan matches musl tan from the Python port', () => {
    expect(fx.tan.length).toBeGreaterThan(400);
    expect(mismatches(fx.tan, portableTan)).toEqual([]);
  });
  it('portable_math exp / expm1 / tanh / sin / cos / asin match bit for bit', () => {
    const F = { exp: pexp, expm1: pexpm1, tanh: ptanh, sin: psin, cos: pcos, asin: pasin };
    for (const [name, f] of Object.entries(F)) {
      const pairs = fx.math[name as keyof typeof F];
      expect(pairs.length, name).toBeGreaterThan(300);
      expect(mismatches(pairs, f), name).toEqual([]);
    }
  });
  it('the sin and cos kernels match', () => {
    expect(mismatches(fx.sin, kernelSin)).toEqual([]);
    expect(mismatches(fx.cos, kernelCos)).toEqual([]);
  });
  it('butter coefficients match for every order, corner and type', () => {
    expect(fx.butter.length).toBeGreaterThan(150);
    for (const c of fx.butter) {
      const got = portableButter(c.N, c.Wn, c.btype);
      const label = `${c.btype} N=${c.N} Wn=${JSON.stringify(c.Wn)}`;
      expect(got.b.length, label).toBe(c.b.length);
      got.b.forEach((v, i) => expect(Object.is(v, c.b[i]), `${label} b[${i}] ${v} != ${c.b[i]}`).toBe(true));
      got.a.forEach((v, i) => expect(Object.is(v, c.a[i]), `${label} a[${i}] ${v} != ${c.a[i]}`).toBe(true));
    }
  });
  it('cephes I0, the Kaiser firwin and resample_poly match portable_resample bit for bit', () => {
    expect(mismatches(fx.i0, besselI0)).toEqual([]);
    for (const c of fx.firwin) expect(sameBits(firwinKaiser(c.numtaps, c.cutoff, 5.0), c.h), `firwin ${c.numtaps}`).toBe(true);
    expect(fx.resample.length).toBe(7);
    for (const c of fx.resample) {
      expect(sameBits(resamplePoly(fx.resample_in, c.up, c.down), c.y), `resample ${c.up}/${c.down}`).toBe(true);
    }
  });
  it('refDsp butter is the portable design (the path every voice and bus filter takes)', () => {
    expect(butter).toBe(portableButter);
  });
});

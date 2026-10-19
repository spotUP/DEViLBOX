/**
 * portableIir.ts against tools/portable_iir.py, bit for bit: tan, the sin / cos kernels and every butter()
 * coefficient must be the identical float64 (Object.is), or the Python and TypeScript renders drift apart.
 * Fixture: tools/softsynth-fixtures/gen_portable_iir.py.
 */
import { describe, expect, it } from 'vitest';
import { kernelCos, kernelSin, portableButter, portableTan } from '@/engine/dj/scratch/portableIir';
import { butter } from '@/engine/dj/scratch/refDsp';
import ref from './fixtures/portable_iir.json';

type Case = { N: number; Wn: number | [number, number]; btype: 'low' | 'high' | 'band'; b: number[]; a: number[] };
const fx = ref as { tan: [number, number][]; sin: [number, number][]; cos: [number, number][]; butter: Case[] };

const mismatches = (pairs: [number, number][], f: (x: number) => number) =>
  pairs.filter(([x, y]) => !Object.is(f(x), y)).map(([x, y]) => `${x}: ${f(x)} != ${y}`);

describe('portable_iir mirror is bit-exact', () => {
  it('tan matches musl tan from the Python port', () => {
    expect(fx.tan.length).toBeGreaterThan(400);
    expect(mismatches(fx.tan, portableTan)).toEqual([]);
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
  it('refDsp butter is the portable design (the path every voice and bus filter takes)', () => {
    expect(butter).toBe(portableButter);
  });
});

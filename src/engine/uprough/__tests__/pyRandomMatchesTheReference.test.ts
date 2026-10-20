/**
 * PyRandom (CPython 3.11 random.Random) and NumpyRandomState.randn against the reference
 * (tools/softsynth-fixtures/gen_py_random.py, plan 2026-10-19 O6d-0). Every value is compared exactly.
 */
import { describe, expect, it } from 'vitest';
import fixture from './fixtures/py_random.json';
import { PyRandom } from '../pyRandom';
import { NumpyRandomState } from '../../turntable/turntableSim';

type Mix = [string, number][];
const ref = fixture as unknown as {
  py: {
    seed: string; random: number[]; bits: number[]; bits_wide: string[]; randrange30: number[];
    randrange_5_17: number[]; randrange_7: number[]; uniform: number[]; mix: Mix;
  }[];
  randn1500_seed2024: number[];
  numpy: { seed: number; mix: Mix; randn64: number[]; randn7: number[] }[];
};

describe('PyRandom matches random.Random', () => {
  for (const e of ref.py) {
    const seed = BigInt(e.seed);
    it(`seed ${e.seed}`, () => {
      let r = new PyRandom(seed);
      expect(Array.from({ length: 20 }, () => r.random())).toStrictEqual(e.random);
      r = new PyRandom(seed);
      expect([1, 13, 30, 31, 32].map((k) => r.getrandbits(k))).toStrictEqual(e.bits);
      r = new PyRandom(seed);
      expect([33, 64, 70].map((k) => String(r.getrandbits(k)))).toStrictEqual(e.bits_wide);
      r = new PyRandom(seed);
      expect(Array.from({ length: 20 }, () => r.randrange(1 << 30))).toStrictEqual(e.randrange30);
      r = new PyRandom(seed);
      expect(Array.from({ length: 12 }, () => r.randrange(5, 17))).toStrictEqual(e.randrange_5_17);
      expect([new PyRandom(seed).randrange(7)]).toStrictEqual(e.randrange_7);
      r = new PyRandom(seed);
      expect(Array.from({ length: 6 }, () => r.uniform(-1.5, 2.0))).toStrictEqual(e.uniform);
      r = new PyRandom(seed);
      const got: Mix = [];
      for (let i = 0; i < 12; i++) {
        got.push(['r', r.random()], ['b', r.getrandbits(13) as number], ['g', r.randrange(1 << 30)],
          ['u', r.uniform(-0.04, 0.04)], ['n', r.randrange(1000)]);
      }
      expect(got).toStrictEqual(e.mix);
    });
  }

  it('accepts a number seed equal to the bigint seed', () => {
    expect(new PyRandom(42).random()).toBe(new PyRandom(42n).random());
  });
});

describe('NumpyRandomState.randn matches RandomState.randn', () => {
  for (const e of ref.numpy) {
    it(`seed ${e.seed}`, () => {
      let r = new NumpyRandomState(e.seed);
      const got: Mix = [];
      for (let i = 0; i < 9; i++) {
        got.push(['n', r.randn()]);
        if (i % 3 === 1) got.push(['r', r.rand()]);
      }
      expect(got).toStrictEqual(e.mix);
      expect(Array.from(new NumpyRandomState(e.seed).randnArray(64))).toStrictEqual(e.randn64);
      r = new NumpyRandomState(e.seed);
      expect(Array.from(r.randnArray(7))).toStrictEqual(e.randn7);
    });
  }

  it('1500 draws of seed 2024 (exercises fma and crLog on many r2 values)', () => {
    expect(Array.from(new NumpyRandomState(2024).randnArray(1500))).toStrictEqual(ref.randn1500_seed2024);
  });
});

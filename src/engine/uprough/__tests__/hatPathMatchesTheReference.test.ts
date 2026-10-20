/**
 * The hat path against tools/hiphop.py (plan 2026-10-19 O6d): ProbabilityMemory / pick_hat_index, draw_hat_vary,
 * build_hat_pool, apply_hat_vary (+ _zone_eq), render_open_hat_choke, and a multi-bar run whose sentinels are the
 * hat stream position (the next random() after the bar) and the ProbabilityMemory state. Float32 arrays compare by
 * sha256 of their bytes (exact); where the fixture carries the bytes the values compare too, for a readable diff.
 * Regenerate with tools/softsynth-fixtures/gen_hat_path.py. Everything is compared exactly (toBe).
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import fixture from './fixtures/hat_path.json';
import {
  ProbabilityMemory, ZONE_EQ_PARAMS, applyHatVary, barHatRng, buildHatPool, drawHatVary, pickHatIndex,
  renderOpenHatChoke, type HatVary,
} from '../hatPath';
import type { HipHopStyle } from '../drumBank';

interface Arr { n: number; sha: string; b64?: string }
interface PoolSrc { style: HipHopStyle; rate: number; seed: number; n: number }
interface Hit { i: number; v: HatVary; out: Arr; sub?: { i: number; v: HatVary; out: Arr } }
const ref = fixture as unknown as {
  zone_gains: Record<string, number>;
  pm: { n: number; seed: number; idx: number[]; w: number[]; last: number; next: number }[];
  vary: { seed: number; zone: string | null; draws: HatVary[]; next: number }[];
  pools: (PoolSrc & { pool: Arr[] })[];
  pool_src: PoolSrc;
  vary_hats: { src: string; rate: number; v: HatVary; out: Arr }[];
  chokes: { dt: number; partial: boolean; rate: number; out: Arr }[];
  runs: { song_seed: number; sub: boolean; pool: PoolSrc; bars: { hits: Hit[]; next: number; w: number[]; last: number }[] }[];
};

function check(got: Float64Array, want: Arr): void {
  const f = Float32Array.from(got);
  expect(got.length).toBe(want.n);
  expect(Float64Array.from(f)).toEqual(got); // every sample is a float32 value
  if (want.b64) {
    const w = new Float32Array(new Uint8Array(Buffer.from(want.b64, 'base64')).buffer);
    expect(Array.from(f)).toEqual(Array.from(w));
  }
  expect(createHash('sha256').update(new Uint8Array(f.buffer)).digest('hex')).toBe(want.sha);
}

describe('zone gains', () => {
  it('hardcoded constants are the host doubles', () => {
    for (const [z, g] of Object.entries(ref.zone_gains)) expect(ZONE_EQ_PARAMS[z]![1]).toBe(g);
  });
});

describe('ProbabilityMemory + pickHatIndex', () => {
  for (const c of ref.pm) {
    it(`n=${c.n} seed ${c.seed}`, () => {
      const rng = barHatRng(c.seed);
      const pm = new ProbabilityMemory(c.n);
      expect(c.idx.map(() => pickHatIndex(pm, rng))).toEqual(c.idx);
      expect(pm.w).toEqual(c.w);
      expect(pm.last).toBe(c.last);
      expect(rng.random()).toBe(c.next);
    });
  }
});

describe('drawHatVary', () => {
  for (const c of ref.vary) {
    it(`seed ${c.seed} zone ${c.zone}`, () => {
      const rng = barHatRng(c.seed);
      expect(c.draws.map(() => drawHatVary(rng, c.zone))).toEqual(c.draws);
      expect(rng.random()).toBe(c.next); // stream position: the randrange rejection count is right
    });
  }
});

const poolCache = new Map<string, Float64Array[]>();
function poolOf(s: PoolSrc): Float64Array[] {
  const key = JSON.stringify(s);
  let p = poolCache.get(key);
  if (!p) { p = buildHatPool(s.style, s.rate, s.seed, s.n); poolCache.set(key, p); }
  return p;
}

describe('buildHatPool', () => {
  for (const c of ref.pools) {
    it(`${c.style} ${c.rate} Hz seed ${c.seed} n=${c.n}`, () => {
      const pool = poolOf(c);
      expect(pool.length).toBe(c.pool.length);
      pool.forEach((h, i) => check(h, c.pool[i]!));
    });
  }
});

describe('applyHatVary', () => {
  const syn = Float64Array.from({ length: 40 }, (_, i) => Math.fround(Math.sin(i * 0.9) * (1 - i / 40.0)));
  ref.vary_hats.forEach((c, k) => {
    it(`${k}: ${c.src} zone ${c.v.zone} ${c.rate} Hz`, () => {
      let src: ArrayLike<number>;
      if (c.src === 'syn') src = syn;
      else if (c.src === 'pool1@44100') src = poolOf({ ...ref.pool_src, rate: 44100 })[1]!;
      else src = poolOf(ref.pool_src)[Number(c.src.slice(4))]!;
      check(applyHatVary(src, c.v, c.rate), c.out);
    });
  });
});

describe('renderOpenHatChoke', () => {
  ref.chokes.forEach((c, k) => {
    it(`${k}: dt ${c.dt} ${c.partial ? 'partial' : 'full'}`, () => {
      check(renderOpenHatChoke(poolOf(ref.pool_src)[2]!, c.dt, c.partial, c.rate), c.out);
    });
  });
});

describe('multi-bar hat stream', () => {
  for (const run of ref.runs) {
    it(`song seed ${run.song_seed}${run.sub ? ' with sub-hits' : ''}`, () => {
      const pool = poolOf(run.pool);
      const pm = new ProbabilityMemory(pool.length); // persists across bars
      run.bars.forEach((bar, b) => {
        const rng = barHatRng(run.song_seed + b); // fresh every bar
        for (const hit of bar.hits) {
          const i = pickHatIndex(pm, rng);
          expect(i).toBe(hit.i);
          const v = drawHatVary(rng);
          expect(v).toEqual(hit.v);
          check(applyHatVary(pool[i]!, v, 22050), hit.out);
          if (hit.sub) {
            const si = pickHatIndex(pm, rng);
            expect(si).toBe(hit.sub.i);
            const sv = drawHatVary(rng);
            expect(sv).toEqual(hit.sub.v);
            check(applyHatVary(pool[si]!, sv, 22050), hit.sub.out);
          }
        }
        expect(rng.random()).toBe(bar.next); // sentinel: draws consumed this bar
        expect(pm.w).toEqual(bar.w);
        expect(pm.last).toBe(bar.last);
      });
    });
  }
});

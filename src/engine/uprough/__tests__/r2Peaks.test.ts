/** The R2a peaks summary against the shared vector (independent numpy implementation) and the emitter's numbering. */
import { describe, expect, it } from 'vitest';
import fixture from './fixtures/r2_peaks.json';
import { createEmitter, type R2Event } from '../r2Events';
import { envOf, peaks } from '../r2Peaks';

const cases = (fixture as unknown as { cases: { name: string; buf: number[]; peaks: ReturnType<typeof peaks> }[] }).cases;

describe('peaks', () => {
  for (const c of cases) {
    it(`matches the shared vector: ${c.name}`, () => {
      expect(peaks(c.buf)).toEqual(c.peaks);
    });
  }
  it('uses n = len below 256 samples and zeros for silence', () => {
    expect(peaks(new Float64Array(10)).n).toBe(10);
    const s = peaks(new Float64Array(600));
    expect(s.scale).toBe(0);
    expect(s.min.every((v) => v === 0) && s.max.every((v) => v === 0)).toBe(true);
  });
});

describe('envOf', () => {
  it('takes the value at floor(i * len / 64)', () => {
    const arr = Float64Array.from({ length: 1000 }, (_, i) => i);
    const e = envOf(arr);
    expect(e.n).toBe(64);
    expect(e.values[63]).toBe(Math.floor(63 * 1000 / 64));
    expect(e.values[1]).toBe(15);
  });
});

describe('createEmitter', () => {
  it('returns nothing without a listener and numbers events 0, 1, 2 with a listener', () => {
    expect(createEmitter(undefined)).toBeUndefined();
    const got: R2Event[] = [];
    const em = createEmitter((e) => got.push(e))!;
    em.emit({ type: 'join', peaks: peaks([0.5]) });
    em.emit({ type: 'texture', peaks: peaks([0.5]) });
    em.emit({ type: 'master', peaks: peaks([0.5]) });
    expect(got.map((e) => e.seq)).toEqual([0, 1, 2]);
  });
});

import { describe, it, expect } from 'vitest';
import { computeCrossfaderGains } from '../dj/DJMixerEngine';

describe('computeCrossfaderGains — linear curve', () => {
  const pts: Array<[number, number, number]> = [
    // position, gainA, gainB
    [0, 1, 0],
    [0.25, 0.75, 0.25],
    [0.5, 0.5, 0.5],
    [0.75, 0.25, 0.75],
    [1, 0, 1],
  ];
  for (const [p, ea, eb] of pts) {
    it(`pos=${p} → [${ea}, ${eb}]`, () => {
      const [a, b] = computeCrossfaderGains(p, 'linear');
      expect(a).toBeCloseTo(ea, 6);
      expect(b).toBeCloseTo(eb, 6);
    });
  }

  it('gains are complementary: gainA + gainB === 1', () => {
    for (let i = 0; i <= 10; i++) {
      const [a, b] = computeCrossfaderGains(i / 10, 'linear');
      expect(a + b).toBeCloseTo(1, 6);
    }
  });
});

describe('computeCrossfaderGains — cut curve', () => {
  it('pos=0 is full A, silent B', () => {
    expect(computeCrossfaderGains(0, 'cut')).toEqual([1, 0]);
  });
  it('pos=1 is silent A, full B', () => {
    expect(computeCrossfaderGains(1, 'cut')).toEqual([0, 1]);
  });
  it('pos=0.5 is both decks at full volume (battle-style hard cut)', () => {
    expect(computeCrossfaderGains(0.5, 'cut')).toEqual([1, 1]);
  });
  it('cut-in threshold kicks in within 5% of each end', () => {
    // Just past 0 but below 5 % → B starts sounding, A stays full.
    expect(computeCrossfaderGains(0.06, 'cut')).toEqual([1, 1]);
    // Well past 95 % → A cuts off, B stays full.
    expect(computeCrossfaderGains(0.96, 'cut')).toEqual([0, 1]);
  });
});

describe('computeCrossfaderGains — smooth (equal-power) curve', () => {
  it('pos=0.5 is equal-power: both ≈ 0.707', () => {
    const [a, b] = computeCrossfaderGains(0.5, 'smooth');
    expect(a).toBeCloseTo(Math.SQRT1_2, 4);
    expect(b).toBeCloseTo(Math.SQRT1_2, 4);
  });
  it('pos=0 is [1, 0]', () => {
    const [a, b] = computeCrossfaderGains(0, 'smooth');
    expect(a).toBeCloseTo(1, 6);
    expect(b).toBeCloseTo(0, 6);
  });
  it('pos=1 is [0, 1]', () => {
    const [a, b] = computeCrossfaderGains(1, 'smooth');
    expect(a).toBeCloseTo(0, 6);
    expect(b).toBeCloseTo(1, 6);
  });
  it('constant-power invariant: gainA² + gainB² === 1 for every position', () => {
    for (let i = 0; i <= 20; i++) {
      const [a, b] = computeCrossfaderGains(i / 20, 'smooth');
      expect(a * a + b * b).toBeCloseTo(1, 6);
    }
  });
});

describe('computeCrossfaderGains — monotonicity', () => {
  it('linear: gainA decreases monotonically as position increases', () => {
    let prev = Infinity;
    for (let i = 0; i <= 10; i++) {
      const [a] = computeCrossfaderGains(i / 10, 'linear');
      expect(a).toBeLessThanOrEqual(prev);
      prev = a;
    }
  });
  it('smooth: gainB increases monotonically as position increases', () => {
    let prev = -Infinity;
    for (let i = 0; i <= 10; i++) {
      const [, b] = computeCrossfaderGains(i / 10, 'smooth');
      expect(b).toBeGreaterThanOrEqual(prev);
      prev = b;
    }
  });
});

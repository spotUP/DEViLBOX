import { describe, it, expect } from 'vitest';
import { ayEnvelopePoints } from '../ayEnvelope';

const levelAt = (shape: number, t: number) => {
  const pts = ayEnvelopePoints(shape);
  // last point at or before t: a jump is two points at one time, the later one is the level after; a hold has no point until the end
  return pts.filter(([x]) => x <= t).at(-1)![1];
};

describe('AY envelope shapes', () => {
  it('drops to zero after one ramp without continue (shapes 0-7)', () => {
    for (let s = 0; s < 8; s++) expect(levelAt(s, 3), `shape ${s}`).toBe(0);
  });
  it('matches the datasheet for shapes 8-15', () => {
    // [level at start, level after period 1, level at period 2]
    const want: Record<number, [number, number, number]> = {
      8: [1, 1, 1], 9: [1, 0, 0], 10: [1, 0, 1], 11: [1, 1, 1],
      12: [0, 0, 0], 13: [0, 1, 1], 14: [0, 1, 0], 15: [0, 0, 0],
    };
    for (const [s, [a, b, c]] of Object.entries(want)) {
      const n = Number(s);
      expect(ayEnvelopePoints(n)[0][1], `shape ${s} start`).toBe(a);
      expect(levelAt(n, 1), `shape ${s} period 1`).toBe(b);
      expect(levelAt(n, 2), `shape ${s} period 2`).toBe(c);
    }
  });
});

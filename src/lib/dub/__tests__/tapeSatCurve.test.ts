/**
 * The dub bus's tape saturation colours without adding level.
 *
 * The curve used to be tanh(k·x)/tanh(k), whose small-signal gain k/tanh(k)
 * was +4 dB at the tape stage's drive and +9 dB in "tape 15 ips" - a large
 * share of an echo return 11.5 dB over its input (2026-09-30).
 */
import { describe, it, expect } from 'vitest';
import { makeTapeSatCurve } from '../tapeSatCurve';

/** The curve's output for input x (the WaveShaper maps -1..1 across the table). */
const at = (curve: Float32Array, x: number) => curve[Math.round(((x + 1) / 2) * (curve.length - 1))];

describe('tape saturation curve', () => {
  for (const drive of [0.2, 0.35, 0.7]) {
    it(`is unity for small signals at drive ${drive}, both halves`, () => {
      const c = makeTapeSatCurve(drive);
      const dx = 2 / (c.length - 1) * 8;
      expect((at(c, dx) - at(c, 0)) / dx).toBeCloseTo(1, 1);
      expect((at(c, 0) - at(c, -dx)) / dx).toBeCloseTo(1, 1);
    });
    it(`rounds the peaks down, never up, at drive ${drive}`, () => {
      const c = makeTapeSatCurve(drive);
      expect(at(c, 1)).toBeLessThanOrEqual(1);
      expect(at(c, 1)).toBeGreaterThan(0);
      expect(at(c, -1)).toBeGreaterThanOrEqual(-1);
    });
  }
  it('keeps the asymmetry: the negative half bends harder', () => {
    const c = makeTapeSatCurve(0.35);
    expect(Math.abs(at(c, -0.9))).toBeLessThan(at(c, 0.9));
  });
});

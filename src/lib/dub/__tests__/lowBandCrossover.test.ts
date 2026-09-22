import { describe, it, expect } from 'vitest';
import { lowBandGainsFor, LOW_CEILING_AT_REST, LOW_CEILING_AT_TOP, LOW_CEILING_SETTLE_DB, LOW_SAT_KNEE } from '../lowBandCrossover';
import { makeSoftClipCurve } from '../softClipCurve';

/** The graph: x -> lowDrive -> curve -> lowOut, i.e. y = ceiling · sat(x · drive). */
function lowBand(x: number, bassDb: number): number {
  const { drive, ceiling } = lowBandGainsFor(bassDb);
  const curve = makeSoftClipCurve(8192, LOW_SAT_KNEE);
  const u = Math.max(-1, Math.min(1, x * drive));
  const i = Math.round(((u + 1) / 2) * (curve.length - 1));
  return ceiling * curve[i];
}

describe('lowBandGainsFor', () => {
  it('is transparent at rest', () => {
    const g = lowBandGainsFor(0);
    expect(g.drive).toBeCloseTo(1, 6);
    expect(g.ceiling).toBe(LOW_CEILING_AT_REST);
    expect(lowBand(0.3, 0)).toBeCloseTo(0.3, 2);
  });

  it('lifts small signals by exactly the requested dB', () => {
    for (const db of [3, 6, 9, 12]) {
      const g = lowBandGainsFor(db);
      expect(g.drive * g.ceiling).toBeCloseTo(Math.pow(10, db / 20), 6);
      // Well inside the curve's linear region: x * drive < knee.
      expect(lowBand(0.02, db)).toBeCloseTo(0.02 * Math.pow(10, db / 20), 2);
    }
  });

  it('bounds the band\'s peak by the ceiling, however hard it is driven', () => {
    for (const x of [0.5, 0.8, 1.0, 3.0]) {
      expect(Math.abs(lowBand(x, 12))).toBeLessThanOrEqual(LOW_CEILING_AT_TOP + 1e-6);
    }
    expect(Math.abs(lowBand(3.0, 6))).toBeLessThanOrEqual(lowBandGainsFor(6).ceiling + 1e-6);
  });

  it('leaves room for the high band on the same peak at the top', () => {
    expect(LOW_CEILING_AT_TOP).toBeLessThan(0.9);   // the master clipper's knee
    expect(LOW_CEILING_AT_TOP).toBeGreaterThanOrEqual(0.5); // still heavy
  });

  it('gets heavier the whole way up — output at a real bass level never falls', () => {
    let prev = 0;
    for (let db = 0; db <= 12; db += 1) {
      const y = lowBand(0.3, db);
      expect(y, `at ${db}`).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = y;
    }
  });

  it('holds its ceiling once the control is up, so the top is not lighter than the middle', () => {
    expect(lowBandGainsFor(LOW_CEILING_SETTLE_DB).ceiling).toBeCloseTo(LOW_CEILING_AT_TOP, 6);
    expect(lowBandGainsFor(12).ceiling).toBeCloseTo(LOW_CEILING_AT_TOP, 6);
  });

  it('cuts cleanly below rest', () => {
    const g = lowBandGainsFor(-6);
    expect(g.ceiling).toBe(LOW_CEILING_AT_REST);
    expect(g.drive).toBeCloseTo(Math.pow(10, -6 / 20), 6);
  });
});

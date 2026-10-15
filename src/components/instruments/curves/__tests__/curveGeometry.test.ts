import { describe, it, expect } from 'vitest';
import { toPixel, xFraction, xGridValues } from '../curveGeometry';

const log = { xScale: 'log' as const, xDomain: [20, 20000] as const, yDomain: [-60, 12] as const };
const lin = { xScale: 'linear' as const, xDomain: [0, 2] as const, yDomain: [0, 1] as const };
const box = { width: 108, height: 58, padLeft: 4, padRight: 4, padTop: 4, padBottom: 4 };

describe('curve geometry', () => {
  it('a log frequency axis puts each decade the same distance apart', () => {
    const a = xFraction(log, 200) - xFraction(log, 20);
    const b = xFraction(log, 2000) - xFraction(log, 200);
    expect(a).toBeCloseTo(b, 10);
    expect(xFraction(log, 20)).toBe(0);
    expect(xFraction(log, 20000)).toBe(1);
  });

  it('maps the corners of the domain to the corners of the plot', () => {
    expect(toPixel(lin, box, 0, 0)).toEqual([4, 54]);
    expect(toPixel(lin, box, 2, 1)).toEqual([104, 4]);
  });

  it('clamps a value outside the domain onto the plot edge instead of drawing outside it', () => {
    expect(toPixel(lin, box, 5, -3)).toEqual([104, 54]);
  });

  it('grid lines are the decades of a log axis and the quarters of a linear one', () => {
    expect(xGridValues(log)).toEqual([100, 1000, 10000]);
    expect(xGridValues(lin)).toEqual([0.5, 1, 1.5]);
  });
});

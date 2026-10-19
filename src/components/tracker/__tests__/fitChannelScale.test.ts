import { describe, it, expect } from 'vitest';
import { fitChannelScale, fitAndStretchChannelWidths } from '../channelLayout';

const LEFT = 40;
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

describe('fitChannelScale', () => {
  it('12 channels that overflow the canvas shrink until they fit', () => {
    const mins = Array.from({ length: 12 }, () => 200);
    const s = fitChannelScale(mins, LEFT, 2000);
    expect(s).toBeLessThan(1);
    expect(s).toBeCloseTo(2000 / (LEFT + 2400), 6);
  });
  it('channels that already fit keep scale 1 (never enlarge)', () => {
    expect(fitChannelScale([200, 200, 200, 200], LEFT, 3000)).toBe(1);
    expect(fitChannelScale([200, 200], LEFT, LEFT + 400)).toBe(1);
  });
  it('has no font floor: 64 channels still fit, however small the text', () => {
    const mins = Array.from({ length: 64 }, () => 200);
    expect(fitChannelScale(mins, LEFT, 1000)).toBeCloseTo(1000 / (LEFT + 64 * 200), 9);
  });
  it('an unknown width or no channels returns 1', () => {
    expect(fitChannelScale([200], LEFT, 0)).toBe(1);
    expect(fitChannelScale([], LEFT, 500)).toBe(1);
  });
});

describe('fitAndStretchChannelWidths', () => {
  // Owner 2026-10-20: "the fit button in the pattern view half works, the last channel is not fully visible".
  // Measured in the app: 7 channels of 266 px plus a 96 px left edge in a 1125 px editor need scale ~0.58;
  // the old 10 px font floor (scale 0.714) stopped short and the last channel hung off the right edge.
  it('the measured 7-channel song ends inside the 1125 px editor', () => {
    const mins = Array.from({ length: 7 }, () => 266);
    const out = fitAndStretchChannelWidths(mins, 96, 1125, true);
    expect(out.scale).toBeLessThan(10 / 14);
    expect(out.leftEdge + sum(out.widths)).toBeLessThanOrEqual(1125);
  });
  it('shrunk channels end inside the canvas (no horizontal scroll)', () => {
    const mins = Array.from({ length: 10 }, (_, i) => 180 + i);
    const out = fitAndStretchChannelWidths(mins, LEFT, 1500, true);
    expect(out.scale).toBeLessThan(1);
    expect(out.leftEdge + sum(out.widths)).toBeLessThanOrEqual(1500);
    expect(out.leftEdge + sum(out.widths)).toBeGreaterThan(1500 - 20);
  });
  it('fit off keeps minimum widths and scrolls, as before', () => {
    const mins = Array.from({ length: 16 }, () => 200);
    const out = fitAndStretchChannelWidths(mins, LEFT, 1500, false);
    expect(out.scale).toBe(1);
    expect(out.widths).toEqual(mins);
  });
  it('few channels keep scale 1 and the spare width is stretched', () => {
    const out = fitAndStretchChannelWidths([200, 200, 200, 200], LEFT, 1200, true);
    expect(out.scale).toBe(1);
    expect(out.leftEdge + sum(out.widths)).toBe(1200);
  });
});

describe('fit off draws at the zoom slider scale', () => {
  const mins = [200, 200, 200];
  it('the manual scale sets scale and widths (zoom in grows, zoom out shrinks)', () => {
    const big = fitAndStretchChannelWidths(mins, LEFT, 0, false, 1.5);
    expect(big.scale).toBe(1.5);
    expect(big.widths.slice(0, 2)).toEqual([300, 300]);
    const small = fitAndStretchChannelWidths(mins, LEFT, 0, false, 0.5);
    expect(small.scale).toBe(0.5);
  });
  it('fit on ignores the manual scale', () => {
    const many = Array.from({ length: 12 }, () => 200);
    const fitted = fitAndStretchChannelWidths(many, LEFT, 2000, true, 1.5);
    expect(fitted.scale).toBeCloseTo(2000 / (LEFT + 2400), 6);
  });
});

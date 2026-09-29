/**
 * The dub bus's compressors must not add level.
 *
 * A DynamicsCompressorNode raises its output by the spec's automatic make-up
 * gain; at the dub defaults the sidechain and glue added ~+4 dB each
 * (measured 2026-09-30), most of an echo return 11.5 dB over its input.
 */
import { describe, it, expect } from 'vitest';
import { compressorMakeupGain, compressorMakeupTrim } from '../compressorMakeup';

const db = (x: number) => 20 * Math.log10(x);

describe('DynamicsCompressor make-up gain', () => {
  it('is zero at 1:1 (the glue bypassed)', () => {
    expect(compressorMakeupGain(0, 0, 1)).toBe(1);
    expect(compressorMakeupGain(-14, 8, 1)).toBe(1);
  });
  it('grows as the threshold drops and the ratio rises', () => {
    const light = db(compressorMakeupGain(-6, 6, 6));
    const heavy = db(compressorMakeupGain(-36, 6, 6));
    expect(light).toBeGreaterThan(0);
    expect(heavy).toBeGreaterThan(light);
  });
  it('matches the spec at a hard knee: (1 / curve(0 dBFS))^0.6', () => {
    // Hard knee: curve(0 dBFS) = T + (0 - T)/R dB, so make-up = 0.6 * -(T - T/R) dB.
    const T = -24, R = 4;
    const expected = 0.6 * -(T + (0 - T) / R);
    expect(db(compressorMakeupGain(T, 0, R))).toBeCloseTo(expected, 1);
  });
  it('the dub glue default (-14 dB, knee 8, 3:1) makes up a few dB, and the trim cancels it', () => {
    const g = compressorMakeupGain(-14, 8, 3);
    expect(db(g)).toBeGreaterThan(2);
    expect(db(g)).toBeLessThan(8);
    expect(g * compressorMakeupTrim(-14, 8, 3)).toBeCloseTo(1, 12);
  });
});

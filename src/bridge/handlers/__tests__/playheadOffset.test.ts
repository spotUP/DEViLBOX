import { describe, it, expect } from 'vitest';
import { heardAtMs, offsetOfChange, offsetStats } from '../playheadOffset';

const stamp = { contextTime: 10, performanceTime: 5000 };

describe('get_playhead_offset math', () => {
  it('maps a render time to the wall time it is heard', () => {
    expect(heardAtMs(10, stamp)).toBe(5000);
    expect(heardAtMs(10.5, stamp)).toBe(5500);
    expect(heardAtMs(9.9, stamp)).toBeCloseTo(4900, 6);
  });

  it('measures a grid change against the start of the latest run of that row', () => {
    const log = [
      { sec: 10.00, songPos: 0, row: 0 },
      { sec: 10.02, songPos: 0, row: 0 },
      { sec: 10.04, songPos: 0, row: 1 },
      { sec: 10.06, songPos: 0, row: 1 },
    ];
    // row 1 is heard at 5040 ms; the grid showed it at 5007 ms: 33 ms early
    expect(offsetOfChange(log, 0, 1, 5007, stamp)).toBeCloseTo(-33, 6);
    // the grid showed it 16 ms after it was heard
    expect(offsetOfChange(log, 0, 1, 5056, stamp)).toBeCloseTo(16, 6);
    expect(offsetOfChange(log, 3, 9, 5000, stamp)).toBeNull();
  });

  it('uses the latest run when a row repeats after a loop', () => {
    const log = [
      { sec: 10.0, songPos: 0, row: 0 }, { sec: 10.1, songPos: 0, row: 1 },
      { sec: 11.0, songPos: 0, row: 0 }, { sec: 11.1, songPos: 0, row: 1 },
    ];
    expect(offsetOfChange(log, 0, 0, 6000, stamp)).toBeCloseTo(0, 6);
  });

  it('summarises offsets', () => {
    expect(offsetStats([])).toBeNull();
    expect(offsetStats([-30, -34, -32])).toEqual({ count: 3, meanMs: -32, medianMs: -32, minMs: -34, maxMs: -30, stdMs: 1.6 });
  });
});

import { describe, it, expect } from 'vitest';
import {
  boundaryForIntention,
  rowsUntilBoundary,
  msUntilBoundary,
  msUntilMusicalReturn,
} from '../musicalReturn';

const SPEED = 6;              // 4 rows/beat, 16 rows/bar, 256 rows/phrase
const BPM = 120;              // one row = 125 ms at speed 6

describe('boundaryForIntention', () => {
  it('resolves big gestures on big seams and small ones on small', () => {
    expect(boundaryForIntention('DROP')).toBe('phrase');
    expect(boundaryForIntention('TRANSITION')).toBe('phrase');
    expect(boundaryForIntention('BUILD')).toBe('bar');
    expect(boundaryForIntention('ACCENT')).toBe('beat');
    expect(boundaryForIntention('ANSWER')).toBe('beat');
  });
});

describe('rowsUntilBoundary', () => {
  it('measures to the next beat, bar and phrase', () => {
    expect(rowsUntilBoundary(0, SPEED, 'beat')).toBe(4);
    expect(rowsUntilBoundary(0, SPEED, 'bar')).toBe(16);
    expect(rowsUntilBoundary(0, SPEED, 'phrase')).toBe(256);
  });

  it('never returns zero on a boundary — a gesture does not return the instant it starts', () => {
    for (const boundary of ['beat', 'bar', 'phrase', 'half-bar', '1/8'] as const) {
      expect(rowsUntilBoundary(0, SPEED, boundary), boundary).toBeGreaterThan(0);
      expect(rowsUntilBoundary(16, SPEED, boundary), boundary).toBeGreaterThan(0);
    }
  });

  it('measures half-bars and eighths from the grid, not from constants', () => {
    expect(rowsUntilBoundary(0, SPEED, 'half-bar')).toBe(8);
    expect(rowsUntilBoundary(9, SPEED, 'half-bar')).toBe(7);
    expect(rowsUntilBoundary(0, SPEED, '1/8')).toBe(2);
  });

  it('follows the speed rather than assuming one', () => {
    // Speed 3: 8 rows per beat, 32 per bar.
    expect(rowsUntilBoundary(0, 3, 'beat')).toBe(8);
    expect(rowsUntilBoundary(0, 3, 'bar')).toBe(32);
  });
});

describe('msUntilBoundary', () => {
  it('converts rows to ms through the tick rate, not a guessed row length', () => {
    // speed 6 at 120 BPM: 500 ms per beat, 4 rows per beat → 125 ms per row.
    expect(msUntilBoundary(0, SPEED, BPM, 'beat')).toBeCloseTo(500, 6);
    expect(msUntilBoundary(0, SPEED, BPM, 'bar')).toBeCloseTo(2000, 6);
  });

  it('halves when the tempo doubles', () => {
    expect(msUntilBoundary(0, SPEED, 240, 'bar')).toBeCloseTo(1000, 6);
  });

  it('clamps a nonsense tempo instead of producing nonsense timing', () => {
    expect(msUntilBoundary(0, SPEED, 0, 'beat')).toBeCloseTo(500, 6);
    expect(Number.isFinite(msUntilBoundary(0, SPEED, NaN, 'beat'))).toBe(true);
  });
});

describe('msUntilMusicalReturn', () => {
  it('gives a DROP the phrase edge when there is time for it', () => {
    const r = msUntilMusicalReturn(0, SPEED, BPM, 'DROP', 60_000);
    expect(r.boundary).toBe('phrase');
    expect(r.ms).toBeCloseTo(32_000, 6);          // 256 rows at 125 ms
  });

  it('falls back to the largest seam that fits, rather than holding for ever', () => {
    // A phrase away is 32 s; with a 5 s ceiling the bar is the honest answer.
    const r = msUntilMusicalReturn(0, SPEED, BPM, 'DROP', 5_000);
    expect(r.boundary).toBe('bar');
    expect(r.ms).toBeCloseTo(2_000, 6);
  });

  it('gives an ACCENT the next beat, not the next phrase', () => {
    const r = msUntilMusicalReturn(0, SPEED, BPM, 'ACCENT', 60_000);
    expect(r.boundary).toBe('beat');
    expect(r.ms).toBeCloseTo(500, 6);
  });

  it('still returns something musical when even a beat exceeds the ceiling', () => {
    const r = msUntilMusicalReturn(0, SPEED, BPM, 'ACCENT', 1);
    expect(r.boundary).toBe('beat');
    expect(r.ms).toBeGreaterThan(0);
  });

  it('is tempo-correct: the same intention returns sooner at a faster tempo', () => {
    const slow = msUntilMusicalReturn(0, SPEED, 80, 'BUILD', 60_000);
    const fast = msUntilMusicalReturn(0, SPEED, 160, 'BUILD', 60_000);
    expect(fast.ms).toBeLessThan(slow.ms);
    expect(fast.boundary).toBe(slow.boundary);    // same seam, different clock
  });
});

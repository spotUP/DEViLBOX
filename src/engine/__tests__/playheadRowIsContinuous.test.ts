import { describe, it, expect } from 'vitest';
import { continuousRow } from '../playheadRow';

describe('playhead row moves between rows, not in row steps', () => {
  const state = { row: 8, time: 10, duration: 0.2 };

  it('is a fraction part-way through a row', () => {
    expect(continuousRow(state, 10.05, 0)).toBeCloseTo(8.25, 6);
    expect(continuousRow(state, 10.15, 0)).toBeCloseTo(8.75, 6);
  });

  it('never leaves its row: clamps before the row starts and after it should have ended', () => {
    expect(continuousRow(state, 9.9, 0)).toBe(8);
    expect(continuousRow(state, 11, 0)).toBe(9);
  });

  it('falls back to the integer row when no state is known or the duration is 0', () => {
    expect(continuousRow(null, 10, 5)).toBe(5);
    expect(continuousRow({ row: 3, time: 1, duration: 0 }, 1.5, 0)).toBe(3);
  });
});

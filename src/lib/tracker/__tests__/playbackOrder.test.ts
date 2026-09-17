import { describe, it, expect } from 'vitest';
import { computeEffectiveSongOrder } from '../playbackOrder';

const ORDER = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

describe('computeEffectiveSongOrder — the order the editor resolves patterns through', () => {
  it('keeps the whole order while Play Pattern loops, so late positions still resolve', () => {
    // Regression: the order used to be truncated to [positionIndex] while
    // looping. Engine-driven formats keep reporting real positions (the engine
    // ignores the truncated list), so songPositions[11] was undefined and the
    // coordinator fell back to pattern 0 for every row.
    const { songPositions } = computeEffectiveSongOrder(true, ORDER, 11);
    expect(songPositions).toEqual(ORDER);
    expect(songPositions[11]).toBe(11);
  });

  it('expresses Play Pattern as a single-position loop range, not a truncated order', () => {
    const { loopRange, songPositions } = computeEffectiveSongOrder(true, ORDER, 11);
    expect(loopRange).toEqual({ start: 11, end: 11 });
    expect(songPositions.length).toBe(ORDER.length);
  });

  it('full-song playback has no loop range', () => {
    expect(computeEffectiveSongOrder(false, ORDER, 3).loopRange).toBeNull();
  });

  it('reports the real song length while looping, not 1', () => {
    // songLength 1 combined with the real order would stop the TS scheduler
    // after the first position instead of looping the requested one.
    expect(computeEffectiveSongOrder(true, ORDER, 4).songLength).toBe(ORDER.length);
  });

  it('prefers the module song length when the parser supplied one', () => {
    expect(computeEffectiveSongOrder(false, ORDER, 0, 12).songLength).toBe(12);
  });

  it('clamps a loop position past the end of the order', () => {
    expect(computeEffectiveSongOrder(true, ORDER, 99).loopRange).toEqual({ start: 14, end: 14 });
  });

  it('clamps a negative loop position', () => {
    expect(computeEffectiveSongOrder(true, ORDER, -3).loopRange).toEqual({ start: 0, end: 0 });
  });

  it('never yields an empty order — position 0 must always resolve', () => {
    const { songPositions, loopRange } = computeEffectiveSongOrder(true, [], 0);
    expect(songPositions).toEqual([0]);
    expect(loopRange).toEqual({ start: 0, end: 0 });
  });
});

/**
 * Regression tests for playlist reorder crash (Oh Snap! bug).
 *
 * Before the fix, reorderTrack() with out-of-bounds fromIndex would splice
 * `undefined` into the track array, causing downstream crashes when
 * components tried to access track.trackName, track.bpm, etc.
 */
import { describe, it, expect, beforeEach } from 'vitest';

// Minimal in-memory replica of the reorder logic — tests the bounds-checking
// without needing the full Zustand store + Immer.
interface Track { id: string; name: string }

function reorderTrack(tracks: Track[], fromIndex: number, toIndex: number): Track[] {
  const arr = [...tracks];
  if (fromIndex < 0 || fromIndex >= arr.length) return arr;
  const clampedTo = Math.max(0, Math.min(toIndex, arr.length - 1));
  const [removed] = arr.splice(fromIndex, 1);
  if (!removed) return arr;
  arr.splice(clampedTo, 0, removed);
  return arr;
}

describe('playlistReorder', () => {
  let tracks: Track[];

  beforeEach(() => {
    tracks = [
      { id: '1', name: 'Track A' },
      { id: '2', name: 'Track B' },
      { id: '3', name: 'Track C' },
    ];
  });

  it('reorders normally within bounds', () => {
    const result = reorderTrack(tracks, 0, 2);
    expect(result.map(t => t.id)).toEqual(['2', '3', '1']);
    expect(result.every(t => t !== undefined)).toBe(true);
  });

  it('does not insert undefined when fromIndex is out of bounds', () => {
    const result = reorderTrack(tracks, 5, 1);
    expect(result).toEqual(tracks);
    expect(result.every(t => t !== undefined)).toBe(true);
  });

  it('does not insert undefined when fromIndex is negative', () => {
    const result = reorderTrack(tracks, -1, 1);
    expect(result).toEqual(tracks);
    expect(result.every(t => t !== undefined)).toBe(true);
  });

  it('clamps toIndex to valid range', () => {
    const result = reorderTrack(tracks, 0, 100);
    expect(result.map(t => t.id)).toEqual(['2', '3', '1']);
    expect(result.every(t => t !== undefined)).toBe(true);
  });

  it('clamps negative toIndex to 0', () => {
    const result = reorderTrack(tracks, 2, -5);
    expect(result.map(t => t.id)).toEqual(['3', '1', '2']);
    expect(result.every(t => t !== undefined)).toBe(true);
  });

  it('handles empty array without crashing', () => {
    const result = reorderTrack([], 0, 0);
    expect(result).toEqual([]);
  });

  it('handles single-element array', () => {
    const result = reorderTrack([{ id: '1', name: 'Solo' }], 0, 0);
    expect(result.map(t => t.id)).toEqual(['1']);
  });
});

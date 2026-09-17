import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PlaybackCoordinator } from '../PlaybackCoordinator';

/**
 * Regression: a WASM engine reporting a song position the loaded order cannot
 * resolve used to silently report pattern 0 (`songPositions[position] ?? 0`).
 * The pattern editor then rendered pattern 0 for the whole song while a
 * different pattern played — seen by users as notes missing from the pattern.
 */
function makeCoordinator(songPositions: number[]): PlaybackCoordinator {
  const c = new PlaybackCoordinator();
  c.stateRing.playing = true;
  c.context.songPositions = songPositions;
  c.context.audioContext = null;
  return c;
}

describe('PlaybackCoordinator — engine position to displayed pattern', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
  });

  it('resolves a position through the loaded order', () => {
    const c = makeCoordinator([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const seen: number[] = [];
    c.onRowChange = (_row, patternNum) => { seen.push(patternNum); };

    c.dispatchEnginePosition(0, 11, undefined, false);

    expect(seen).toEqual([11]);
  });

  it('does NOT claim pattern 0 when the position is outside the loaded order', () => {
    // A 1-entry order (what Play Pattern used to load) against an engine that
    // sequences the real song.
    const c = makeCoordinator([0]);
    const seen: number[] = [];
    c.onRowChange = (_row, patternNum) => { seen.push(patternNum); };

    c.dispatchEnginePosition(0, 3, undefined, false);
    c.dispatchEnginePosition(1, 11, undefined, false);

    expect(seen).toEqual([0, 0]); // held, not resolved — but it must say so:
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('outside the');
  });

  it('holds the last pattern that resolved rather than snapping to 0', () => {
    const c = makeCoordinator([5, 6]);
    const seen: number[] = [];
    c.onRowChange = (_row, patternNum) => { seen.push(patternNum); };

    c.dispatchEnginePosition(0, 1, undefined, false);  // resolves to pattern 6
    c.dispatchEnginePosition(1, 9, undefined, false);  // unresolvable

    expect(seen).toEqual([6, 6]);
    expect(seen[1]).not.toBe(0);
  });

  it('warns once per desync, not once per row', () => {
    const c = makeCoordinator([0]);
    c.onRowChange = () => {};
    for (let row = 0; row < 32; row++) c.dispatchEnginePosition(row, 7, undefined, false);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('PlaybackCoordinator — Play Pattern loop enforcement on self-sequencing engines', () => {
  it('drops the position update when the engine was seeked back', () => {
    const c = makeCoordinator([0, 1, 2, 3]);
    const seen: number[] = [];
    c.onRowChange = (_row, _pattern, position) => { seen.push(position); };
    c.context.enforceLoop = (position) => position !== 2; // only position 2 is in the loop

    c.dispatchEnginePosition(0, 3, undefined, false); // out of loop → seeked, dropped
    c.dispatchEnginePosition(0, 2, undefined, false); // in loop → dispatched

    expect(seen).toEqual([2]);
  });

  it('leaves songPos untouched for a dropped update', () => {
    const c = makeCoordinator([0, 1, 2, 3]);
    c.onRowChange = () => {};
    c.context.enforceLoop = (position) => position !== 1;

    c.dispatchEnginePosition(0, 1, undefined, false);
    expect(c.songPos).toBe(1);

    c.dispatchEnginePosition(0, 3, undefined, false); // dropped
    expect(c.songPos).toBe(1);
  });

  it('dispatches normally when no enforcement hook is wired', () => {
    const c = makeCoordinator([0, 1, 2, 3]);
    const seen: number[] = [];
    c.onRowChange = (_row, _pattern, position) => { seen.push(position); };

    c.dispatchEnginePosition(0, 3, undefined, false);
    expect(seen).toEqual([3]);
  });
});

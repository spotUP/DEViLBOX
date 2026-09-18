/**
 * A drop needs something to drop against.
 *
 * Dub works because something REMAINS — the bass holds the riddim while the
 * top is pulled, and the return tells you what left. Take everything away and
 * you have silence, which is not a version of the tune; it is the tune
 * stopping.
 *
 * Scene G ("sparse arrangement, one channel") has always asserted this, and it
 * had been passing VACUOUSLY: the simulator's move selection was a
 * deterministic argmax that never picked a removing move at all. Once
 * selection matched the live weighted roll, `masterDrop` fired a DROP on the
 * one-channel scene at bar 32 and the assertion finally did its job.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  barredByArrangement,
  isRemovingMove,
  REMOVING_MOVES,
  MIN_PARTS_TO_REMOVE,
} from '../arrangementFloor';

describe('which moves take something away', () => {
  it('counts the ones that remove a part or the mix', () => {
    for (const id of ['versionDrop', 'riddimSection', 'masterDrop', 'channelMute']) {
      expect(isRemovingMove(id), id).toBe(true);
    }
  });

  it('does NOT count a filter sweep', () => {
    // A filter drop is a drop in FEEL and takes nothing away permanently, so
    // it stays available on the sparsest arrangement — which is exactly what a
    // performer with one part should be reaching for.
    expect(isRemovingMove('filterDrop')).toBe(false);
    expect(isRemovingMove('echoThrow')).toBe(false);
    expect(isRemovingMove('dubSiren')).toBe(false);
  });
});

describe('the floor', () => {
  it('bars removal when only one part is playing', () => {
    expect(barredByArrangement('masterDrop', 1)).toBe(true);
    expect(barredByArrangement('versionDrop', 1)).toBe(true);
    expect(barredByArrangement('channelMute', 1)).toBe(true);
  });

  it('bars it on an empty arrangement too', () => {
    expect(barredByArrangement('masterDrop', 0)).toBe(true);
  });

  it('allows removal once there is something to drop against', () => {
    expect(barredByArrangement('masterDrop', 2)).toBe(false);
    expect(barredByArrangement('versionDrop', 4)).toBe(false);
  });

  it('never bars a move that takes nothing away, however sparse', () => {
    for (const parts of [0, 1, 2, 16]) {
      expect(barredByArrangement('filterDrop', parts), `parts=${parts}`).toBe(false);
      expect(barredByArrangement('echoThrow', parts), `parts=${parts}`).toBe(false);
    }
  });

  it('needs two parts, which is the smallest arrangement with a remainder', () => {
    expect(MIN_PARTS_TO_REMOVE).toBe(2);
    expect(REMOVING_MOVES.size).toBeGreaterThan(0);
  });
});

describe('wiring contract — the floor applies to the LIVE performer too', () => {
  const cycle = readFileSync(join(__dirname, '..', 'performanceCycle.ts'), 'utf8');

  it('is applied in the shared cycle, not in the simulator', () => {
    // The simulator and the live tick both run `runPerformanceCycle`. Putting
    // the guard anywhere else would fix one performer and leave the other.
    expect(cycle).toContain('barredByArrangement(moveId, soundingParts)');
  });

  it('counts parts that PLAY, not channels that exist', () => {
    // A sixteen-channel module with one active part is a one-part arrangement.
    expect(cycle).toContain('source.onsets.length > 0');
  });

  it('combines with the repetition bar rather than replacing it', () => {
    const both = /barredForRepetition\([\s\S]*?\|\|[\s\S]*?barredByArrangement\(/;
    expect(both.test(cycle)).toBe(true);
  });
});

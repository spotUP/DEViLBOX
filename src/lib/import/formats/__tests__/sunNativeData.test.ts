/**
 * sunNativeData.test.ts — SunTronicNativeData model + pool-decode helper
 *
 * Verifies:
 *   - positions.length matches subsong[0].entries.length
 *   - positions[0].transpose carries verbatim from the score
 *   - positions[0].blockIndex[0] maps trackPtrs via blockIndexByOffset
 *   - nd.blocks.length matches score.blocks.length
 */
import { describe, it, expect } from 'vitest';
import { buildSunTronicNativeData, decodeSunBlockPool } from '../sunNativeData';
import { parseSunTronicV13Score } from '../SunTronicV13';
import { readFixture } from './sunTestUtil';

describe('buildSunTronicNativeData', () => {
  it('positions map trackPtrs to pool blockIndex; transposes carried verbatim', () => {
    const buf = new Uint8Array(readFixture('ready'));
    const score = parseSunTronicV13Score(buf);
    // rebuild the pool the same way parseSunTronicV13File does (transpose 0)
    const blockRows = decodeSunBlockPool(score);
    const nd = buildSunTronicNativeData(score, blockRows);
    expect(nd.positions.length).toBe(score.subsongs[0].entries.length);
    const e0 = score.subsongs[0].entries[0];
    expect(nd.positions[0].transpose).toEqual([...e0.transposes]);
    expect(nd.positions[0].blockIndex[0]).toBe(score.blockIndexByOffset.get(e0.trackPtrs[0]) ?? -1);
    expect(nd.blocks.length).toBe(score.blocks.length);
  });
});

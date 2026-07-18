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
import { readFixture, parseSunTronicFile } from './sunTestUtil';

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

  it('grid cells carry (blockIndex,rowInBlock) provenance resolving to the pool', () => {
    const song = parseSunTronicFile(readFixture('ready'), 'ready');
    // sunTronicNative must be attached to the song
    expect(song.sunTronicNative).toBeDefined();
    const nd = song.sunTronicNative!;
    let provenancedCells = 0;
    for (const p of song.patterns) {
      for (let ch = 0; ch < 4; ch++) {
        for (const cell of p.channels[ch].rows) {
          if (cell.note === 0 && (cell.effTyp ?? 0) === 0) continue; // skip empty
          if (cell.sunBlockIndex === undefined || cell.sunBlockIndex < 0) continue;
          const poolCell = nd.blocks[cell.sunBlockIndex][cell.sunRowInBlock!];
          expect(poolCell).toBeDefined();
          // display note = pool raw note + this position's transpose
          // (asserted precisely in Task 7's reprojection test)
          expect(typeof poolCell.note).toBe('number');
          provenancedCells++;
        }
      }
    }
    // At least some non-empty cells must carry provenance
    expect(provenancedCells).toBeGreaterThan(0);
  });
});

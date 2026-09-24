import { describe, it, expect } from 'vitest';
import {
  looksLikeRealPatternData, describeRejection, MAX_OUT_OF_RANGE_SHARE,
} from '../chipRamReadPlausibility';

/**
 * `populatePatternsFromChipRAM` runs a block of Amiga memory through a
 * ProTracker cell decoder. ANY four bytes decode to something, and most of
 * them set an instrument — so the old `nonEmptyCells > 0` test passed on pure
 * noise and published it as the song.
 *
 * Measured 2026-09-24:
 *   ashley-hogg/ash.nobby the aardvark — 5 instruments, came back with 237
 *     note cells at 92.6 % density naming 56 distinct instruments up to 252
 *   mark-cooksey/mighty bombjack.mc — 8 instruments, 57 distinct up to 253
 *
 * Both were reported as broken pattern data. Both were this.
 */
describe('a chip RAM read must be able to BE this song', () => {
  it('accepts a read whose instruments all exist', () => {
    expect(looksLikeRealPatternData(
      { cellsDecoded: 256, nonEmptyCells: 64, outOfRangeInstrumentCells: 0 }, 15,
    )).toBe(true);
  });

  it('rejects the Ashley Hogg shape', () => {
    // 237 populated cells, the great majority naming instruments 6..252 in a
    // song that has five.
    const stats = { cellsDecoded: 256, nonEmptyCells: 237, outOfRangeInstrumentCells: 180 };
    expect(looksLikeRealPatternData(stats, 5)).toBe(false);
    expect(describeRejection(stats, 5)).toContain('outside 1..5');
  });

  it('tolerates a single bad byte in an otherwise good read', () => {
    // One corrupt cell must not discard a real score.
    expect(looksLikeRealPatternData(
      { cellsDecoded: 256, nonEmptyCells: 200, outOfRangeInstrumentCells: 1 }, 20,
    )).toBe(true);
  });

  it('draws the line where the constant says', () => {
    const at = Math.floor(100 * MAX_OUT_OF_RANGE_SHARE);
    expect(looksLikeRealPatternData(
      { cellsDecoded: 256, nonEmptyCells: 100, outOfRangeInstrumentCells: at }, 10,
    )).toBe(true);
    expect(looksLikeRealPatternData(
      { cellsDecoded: 256, nonEmptyCells: 100, outOfRangeInstrumentCells: at + 1 }, 10,
    )).toBe(false);
  });

  it('rejects a read with nothing in it', () => {
    const stats = { cellsDecoded: 256, nonEmptyCells: 0, outOfRangeInstrumentCells: 0 };
    expect(looksLikeRealPatternData(stats, 15)).toBe(false);
    expect(describeRejection(stats, 15)).toContain('every decoded cell was empty');
  });

  /**
   * The check needs the song's instrument count to mean anything. Without it
   * this function must not invent a reason to throw a good read away.
   */
  it('accepts on the old terms when the instrument count is unknown', () => {
    expect(looksLikeRealPatternData(
      { cellsDecoded: 256, nonEmptyCells: 237, outOfRangeInstrumentCells: 180 }, 0,
    )).toBe(true);
  });

  it('says nothing when there is nothing to complain about', () => {
    expect(describeRejection(
      { cellsDecoded: 256, nonEmptyCells: 64, outOfRangeInstrumentCells: 0 }, 15,
    )).toBe('');
  });
});

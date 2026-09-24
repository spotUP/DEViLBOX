/**
 * Is what we just decoded out of chip RAM actually a pattern?
 *
 * `populatePatternsFromChipRAM` reads a block of the Amiga's memory and runs
 * it through a ProTracker cell decoder. When the layout is right that recovers
 * the real score of a packed format, which is the whole point of it. When the
 * layout is wrong — or when the format keeps no such block at all, as every
 * compiled 68k replayer does — it decodes whatever bytes happen to be there.
 *
 * ANY four bytes decode to something. Most of them set an instrument, so the
 * old `nonEmptyCells > 0` test passed on pure noise and published it.
 *
 * Measured on `ashley-hogg/ash.nobby the aardvark` (2026-09-24): a 5-instrument
 * song came back with 237 note cells at 92.6 % density naming 56 distinct
 * instruments, up to 252. `mark-cooksey/mighty bombjack.mc` produced the same
 * shape — 57 instruments up to 253 for an 8-instrument song. Both were
 * reported as broken pattern data, and both were this.
 *
 * A wrong grid is worse than no grid. Empty says "nobody has done this yet";
 * confidently wrong sends the next reader into the wrong half of the code.
 */

export interface ChipRamReadStats {
  /** Cells the decoder produced. */
  cellsDecoded: number;
  /** Cells carrying a note, instrument or effect. */
  nonEmptyCells: number;
  /** Cells naming an instrument index the song does not have. */
  outOfRangeInstrumentCells: number;
}

/**
 * The share of populated cells that may name an instrument the song lacks
 * before the whole read is judged noise.
 *
 * Not zero: one corrupt byte in a genuine block should not discard a good
 * read, and a packed format can legitimately carry a stale high nibble. Well
 * below anything a wrong layout produces — the measured failures ran far
 * past half.
 */
export const MAX_OUT_OF_RANGE_SHARE = 0.05;

/**
 * True when the decoded block is worth publishing.
 *
 * `instrumentCount` is how many instruments the song actually has. When it is
 * unknown (0), the instrument test cannot run and the read is accepted on the
 * old terms — this function never invents a reason to reject.
 */
export function looksLikeRealPatternData(
  stats: ChipRamReadStats,
  instrumentCount: number,
): boolean {
  if (stats.nonEmptyCells <= 0) return false;
  if (instrumentCount <= 0) return true;
  return stats.outOfRangeInstrumentCells / stats.nonEmptyCells <= MAX_OUT_OF_RANGE_SHARE;
}

/** Why a read was refused, for the log. Empty string when it was accepted. */
export function describeRejection(
  stats: ChipRamReadStats,
  instrumentCount: number,
): string {
  if (looksLikeRealPatternData(stats, instrumentCount)) return '';
  if (stats.nonEmptyCells <= 0) return 'every decoded cell was empty';
  const pct = ((stats.outOfRangeInstrumentCells / stats.nonEmptyCells) * 100).toFixed(0);
  return `${pct}% of ${stats.nonEmptyCells} populated cells name an instrument outside 1..${instrumentCount}`
    + ' — this is not the format\'s pattern block';
}

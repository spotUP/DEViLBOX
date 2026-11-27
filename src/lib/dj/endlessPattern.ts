/**
 * endlessPattern - the DJ deck pattern view as one long pattern: the rows of
 * the order positions around the current one, joined in order, so the view
 * scrolls straight across a pattern boundary instead of jumping to row 0.
 *
 * Rows past the last order position and before order 0 are blank: a deck plays
 * a track through once.
 */

import type { ChannelData, Pattern, TrackerCell } from '@/types/tracker';

export interface EndlessRow {
  /** Order position (index into songPositions). */
  pos: number;
  /** Row inside that position's pattern. */
  row: number;
}

export interface EndlessSpan {
  rows: EndlessRow[];
  /** Index in `rows` of row 0 of the current order position. */
  currentStart: number;
}

/**
 * The rows to show for order position `songPos`: every row of it, plus up to
 * `margin` rows of the positions before and after (fewer at the song's ends).
 * `lengths[pos]` is the row count of the pattern at order position `pos`.
 */
export function endlessRowSpan(lengths: readonly number[], songPos: number, margin: number): EndlessSpan {
  const before: EndlessRow[] = [];
  for (let pos = songPos - 1; pos >= 0 && before.length < margin; pos--) {
    for (let row = (lengths[pos] ?? 0) - 1; row >= 0 && before.length < margin; row--) before.push({ pos, row });
  }
  before.reverse();
  const rows = before.slice();
  for (let row = 0; row < (lengths[songPos] ?? 0); row++) rows.push({ pos: songPos, row });
  let after = 0;
  for (let pos = songPos + 1; pos < lengths.length && after < margin; pos++) {
    for (let row = 0; row < (lengths[pos] ?? 0) && after < margin; row++, after++) rows.push({ pos, row });
  }
  return { rows, currentStart: before.length };
}

const EMPTY_CELL: TrackerCell = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };

export interface EndlessPattern {
  /** The joined rows as one pattern (channel settings from the current position's pattern). */
  pattern: Pattern;
  /** Each joined row's row number inside its own pattern (line numbers, beat highlights). */
  rowNumbers: number[];
  /** Row of `pattern` that is row 0 of the current order position. */
  currentStart: number;
}

/** The current order position's pattern with `margin` rows of its neighbours on each side; null when it has no pattern. */
export function buildEndlessPattern(
  patterns: readonly Pattern[],
  songPositions: readonly number[],
  songPos: number,
  margin: number,
): EndlessPattern | null {
  const current = patterns[songPositions[songPos] ?? -1];
  if (!current) return null;
  const lengths = songPositions.map((idx) => patterns[idx]?.length ?? 0);
  const { rows, currentStart } = endlessRowSpan(lengths, songPos, margin);
  const channels: ChannelData[] = current.channels.map((ch, c) => ({
    ...ch,
    rows: rows.map(({ pos, row }) => patterns[songPositions[pos]]?.channels[c]?.rows[row] ?? EMPTY_CELL),
  }));
  return {
    pattern: { ...current, length: rows.length, channels },
    rowNumbers: rows.map((r) => r.row),
    currentStart,
  };
}

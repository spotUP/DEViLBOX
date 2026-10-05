/**
 * Note cells per pattern (notes 1-96; note-offs and empty cells do not count).
 * get_pattern_stats uses it with wholeSong: a song whose first pattern is a
 * silent intro is not an empty song.
 */
export interface NoteCellPattern {
  channels: ReadonlyArray<{ rows: ReadonlyArray<{ note: number } | undefined> }>;
}

export function noteCellsPerPattern(patterns: ReadonlyArray<NoteCellPattern>): number[] {
  return patterns.map((p) => p.channels.reduce(
    (n, ch) => n + ch.rows.reduce((m, cell) => m + (cell && cell.note > 0 && cell.note < 97 ? 1 : 0), 0), 0));
}

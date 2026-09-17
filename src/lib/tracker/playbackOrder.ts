/**
 * Decide the song order the replayer is loaded with, and how Play Pattern's
 * loop is expressed.
 *
 * The song order is the SINGLE SOURCE OF TRUTH for position -> pattern. Every
 * engine-driven format (libopenmpt, Hively/AHX, UADE, AdPlug, Furnace) reports
 * its position as an index into the real order and the coordinator resolves the
 * displayed pattern through `context.songPositions[position]`.
 *
 * Play Pattern therefore must NOT truncate the order to the single looped
 * pattern. Doing so made every reported position beyond 0 unresolvable, so the
 * pattern editor and the pos/pattern counters sat on pattern 0 for the whole
 * song while a different pattern played — read by users as "notes are missing
 * from the pattern". Looping is a RANGE over the real order instead, applied
 * via TrackerReplayer.setPatternLoop().
 */
export interface EffectiveSongOrder {
  /** Pattern order handed to loadSong — always the song's real order. */
  songPositions: number[];
  /** Number of song positions to play. */
  songLength: number;
  /** Inclusive song-position range to loop, or null for full-song playback. */
  loopRange: { start: number; end: number } | null;
}

export function computeEffectiveSongOrder(
  isLooping: boolean,
  patternOrder: number[],
  positionIndex: number,
  songLengthFromModule?: number,
): EffectiveSongOrder {
  // An empty order would make every position unresolvable — fall back to a
  // single entry so position 0 always maps to a real pattern.
  const songPositions = patternOrder.length > 0 ? patternOrder : [0];
  const songLength = songLengthFromModule ?? songPositions.length;

  if (!isLooping) {
    return { songPositions, songLength, loopRange: null };
  }

  const pos = Math.max(0, Math.min(positionIndex, songPositions.length - 1));
  return { songPositions, songLength, loopRange: { start: pos, end: pos } };
}

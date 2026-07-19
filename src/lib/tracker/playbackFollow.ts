/**
 * Decide which tracker-store cursors the pattern editor should follow when the
 * replayer advances during playback.
 *
 * In pattern-loop mode (Play Pattern) the replayer is loaded with a 1-entry song
 * list — just the looped pattern — so the position it reports is ALWAYS 0.
 * Writing that back via setCurrentPosition(0) rewrites currentPatternIndex to
 * patternOrder[0] (setCurrentPosition keeps the pattern in sync with the order),
 * which yanks the editor off the looped pattern back to song position 000 and,
 * because loopTargetKey then changes, makes the loop itself restart on pattern 0.
 *
 * So Play Pattern must follow the PATTERN only and leave the song position
 * untouched. Full-song playback follows both.
 */
export interface PlaybackFollowUpdate {
  /** Pattern index the editor should display. */
  pattern: number;
  /** Song-order position to update, or null to leave the position store alone. */
  position: number | null;
}

export function computePlaybackFollow(
  isLooping: boolean,
  patternNum: number,
  position: number,
): PlaybackFollowUpdate {
  return { pattern: patternNum, position: isLooping ? null : position };
}

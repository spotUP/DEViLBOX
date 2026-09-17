/**
 * Decide which tracker-store cursors the pattern editor should follow when the
 * replayer advances during playback.
 *
 * History: Play Pattern used to load the replayer with a 1-entry song list, so
 * the position it reported was always 0 and writing that back yanked the editor
 * to song position 000. The fix for that was to skip the position write while
 * looping — which left the pos counter frozen at 000 for the whole song.
 *
 * The order is no longer truncated (see `computeEffectiveSongOrder`): the
 * replayer always holds the song's real order and Play Pattern is a loop RANGE
 * over it. Reported positions are therefore real in both modes, and both
 * cursors follow them.
 */
export interface PlaybackFollowUpdate {
  /** Pattern index the editor should display. */
  pattern: number;
  /** Song-order position to update, or null to leave the position store alone. */
  position: number | null;
}

export function computePlaybackFollow(
  _isLooping: boolean,
  patternNum: number,
  position: number,
): PlaybackFollowUpdate {
  return { pattern: patternNum, position };
}

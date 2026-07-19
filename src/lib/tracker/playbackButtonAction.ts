export type PlaybackMode = 'song' | 'pattern';
export type PlayButtonAction = 'start' | 'stop' | 'switch';

/**
 * Decide what a Play Song / Play Pattern button click should do.
 *
 * - Stopped: the button STARTs playback in its mode.
 * - Playing in the SAME mode the button represents: the button STOPs (it reads
 *   "Stop Song" / "Stop Pattern").
 * - Playing in the OTHER mode: the button SWITCHes to its mode live, without
 *   stopping. Pressing Play Pattern mid-song must loop the current pattern, and
 *   pressing Play Song mid-pattern-loop must resume the full song — neither
 *   should brake playback to a halt first.
 */
export function computePlayButtonAction(
  mode: PlaybackMode,
  isPlaying: boolean,
  isLooping: boolean,
): PlayButtonAction {
  if (!isPlaying) return 'start';
  const activeMode: PlaybackMode = isLooping ? 'pattern' : 'song';
  return mode === activeMode ? 'stop' : 'switch';
}

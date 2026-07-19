export type PlaybackMode = 'song' | 'pattern';
export type PlayButtonAction = 'start' | 'stop' | 'switch' | 'restart';

/**
 * Decide what a Play Song / Play Pattern button click should do.
 *
 * - Stopped: the button STARTs playback in its mode.
 * - Playing in the OTHER mode: the button SWITCHes to its mode live, without
 *   stopping. Pressing Play Pattern mid-song loops the current pattern; pressing
 *   Play Song mid-pattern-loop resumes the full song — neither brakes to a halt.
 * - Playing in the SAME mode:
 *   - Play Pattern NEVER stops. It RESTARTs the current pattern from the top.
 *     Play Pattern always plays the current pattern, full stop.
 *   - Play Song STOPs (it reads "Stop Song").
 */
export function computePlayButtonAction(
  mode: PlaybackMode,
  isPlaying: boolean,
  isLooping: boolean,
): PlayButtonAction {
  if (!isPlaying) return 'start';
  const activeMode: PlaybackMode = isLooping ? 'pattern' : 'song';
  if (mode !== activeMode) return 'switch';
  return mode === 'pattern' ? 'restart' : 'stop';
}

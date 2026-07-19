export type PlaybackMode = 'song' | 'pattern';
export type PlayButtonAction = 'start' | 'stop' | 'switch' | 'restart';

/**
 * Decide what a Play Song / Play Pattern button click should do.
 *
 * - Stopped: the button STARTs playback in its mode.
 * - Play Song is the master Stop: while ANYTHING plays (full song OR pattern
 *   loop) it STOPs. It reads "Stop Song" whenever playback is active.
 * - Play Pattern NEVER stops:
 *   - Playing the full song → SWITCH to loop the current pattern, live.
 *   - Already looping a pattern → RESTART the current pattern from the top.
 *   Play Pattern always plays the current pattern, full stop.
 */
export function computePlayButtonAction(
  mode: PlaybackMode,
  isPlaying: boolean,
  isLooping: boolean,
): PlayButtonAction {
  if (!isPlaying) return 'start';
  if (mode === 'song') return 'stop';
  return isLooping ? 'restart' : 'switch';
}

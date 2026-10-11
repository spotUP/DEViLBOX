import * as Tone from 'tone';

/** De-click fade on every deck player start and stop, in seconds. */
export const PLAYER_FADE_S = 0.01;

/** The AudioContext's current time - when a sound actually happens. */
export function contextNow(): number {
  return (Tone.getContext().rawContext as AudioContext).currentTime;
}

/**
 * Stop a Tone.Player now, with the de-click fade. Returns the context time by
 * which its output is silent.
 *
 * A bare `player.stop()` is scheduled at Tone.now(), which is the context's
 * currentTime PLUS its lookAhead (100 ms): a paused deck kept sounding for a
 * tenth of a second, and a caller that held the deck muted around a pause
 * (scratch-buffer priming on load) unmuted while it was still sounding.
 */
export function stopPlayerNow(player: Tone.Player): number {
  const now = contextNow();
  player.fadeOut = PLAYER_FADE_S;
  player.stop(now);
  return now + PLAYER_FADE_S;
}

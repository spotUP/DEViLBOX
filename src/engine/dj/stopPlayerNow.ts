import * as Tone from 'tone';

/** De-click fade on every deck player start and stop, in seconds. */
export const PLAYER_FADE_S = 0.01;

/** The AudioContext's current time - when a sound actually happens. */
export function contextNow(): number {
  return (Tone.getContext().rawContext as AudioContext).currentTime;
}

/**
 * When the last crossfader move lands, in context time (DJMixerEngine reports
 * each move). A crossfader move is a Tone ramp: it starts at Tone.now(), one
 * lookAhead (100 ms) after currentTime. A deck action that acts at currentTime
 * (a stop, a send change) right after a move would land before the fader has
 * closed or opened that deck: the deck goes silent (or changes) while the
 * crowd still hears it (JUGGLE-LAST-CUT-LATE: a 100 ms hole before the
 * master's downbeat at a juggle's hand-back).
 */
let mixMoveLandsAt = 0;

/** DJMixerEngine: a crossfader move scheduled now lands at context time `t`. */
export function noteMixMoveLands(t: number): void { mixMoveLandsAt = Math.max(mixMoveLandsAt, t); }

/**
 * The one time rule for deck actions: at `t` (default currentTime), never
 * before a pending crossfader move has landed. Every deck stop, send change
 * and seek takes its time from here, so none outruns the fader.
 */
export function afterPendingMix(t: number = contextNow()): number { return Math.max(t, mixMoveLandsAt); }

/**
 * Stop a Tone.Player now (or when a pending crossfader move lands), with the de-click fade. Returns the context time by
 * which its output is silent.
 *
 * A bare `player.stop()` is scheduled at Tone.now(), which is the context's
 * currentTime PLUS its lookAhead (100 ms): a paused deck kept sounding for a
 * tenth of a second, and a caller that held the deck muted around a pause
 * (scratch-buffer priming on load) unmuted while it was still sounding.
 */
export function stopPlayerNow(player: Tone.Player): number {
  const now = afterPendingMix();
  player.fadeOut = PLAYER_FADE_S;
  player.stop(now);
  return now + PLAYER_FADE_S;
}

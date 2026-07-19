/**
 * Playback-vs-cursor navigation policy — the single source of truth shared by
 * the pattern canvas (which row to centre the view on) and the keyboard
 * navigation guards (whether a manual row move is allowed while the song plays).
 *
 * FT2 model: during playback the pattern view can either FOLLOW the play head
 * (classic auto-scroll — the cursor rides along with playback) or lock to the
 * edit cursor (scroll-lock live edit — the play head keeps running, but the
 * view freezes at the cursor so you can reposition and edit specific rows while
 * the song plays). `followPlayback` selects between the two.
 *
 * Both deciders are pure so they can be unit-tested without a canvas or a live
 * audio engine (jsdom has neither).
 */

/**
 * Row the pattern view should centre on.
 *
 * While playing AND following, the view rides the play head; otherwise it stays
 * on the edit cursor. This is what makes scroll-lock (follow off) usable: the
 * view no longer scrolls away from a cursor the user just moved.
 */
export function resolveScrollRow(
  isPlaying: boolean,
  followPlayback: boolean,
  playbackRow: number,
  cursorRow: number,
): number {
  return isPlaying && followPlayback ? playbackRow : cursorRow;
}

/**
 * Whether a manual cursor row move (arrows up/down, Page Up/Down, Home/End,
 * F9-F12 jumps) is allowed.
 *
 * Always allowed when stopped. During playback it is allowed only when NOT
 * following the play head — while following, the play head owns the cursor row
 * and a manual move would immediately be overwritten (and scroll away).
 */
export function isManualRowNavAllowed(isPlaying: boolean, followPlayback: boolean): boolean {
  return !isPlaying || !followPlayback;
}

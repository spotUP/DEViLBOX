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

/**
 * Inputs for {@link resolveFormatViewRow}. A format editor (PatternEditorCanvas
 * with formatColumns) gets its play row from its host (`hostRow`) and, for
 * pattern grids, from the format playback clock (`clockRow`).
 */
export interface FormatViewRowInput {
  /** The editor's rows are SONG POSITIONS (an order/position/track matrix), not pattern rows. */
  rowsArePositions: boolean;
  /** The host says its song is playing (the `formatIsPlaying` prop). */
  hostPlaying: boolean;
  /** The host's play row: the playing position for a matrix, the pattern row for a grid. */
  hostRow: number;
  /** The format playback clock is running (FormatPlaybackState.isPlaying). */
  clockPlaying: boolean;
  /** The format playback clock's row - always a PATTERN row. */
  clockRow: number;
  /** The edit cursor's row. */
  cursorRow: number;
  followPlayback: boolean;
}

/**
 * Which row a format editor centres on, and whether it rides the pattern-row
 * clock (row clock + smooth offset).
 *
 * A position matrix (Hively/AHX positions, MusicLine track table, TFMX
 * tracksteps, SunTronic positions, Klystrack positions, GoatTracker orders)
 * moves ONE STEP PER PATTERN PLAYED: while playing and following it rides the
 * host's playing position and never the clock, which counts pattern rows. The
 * shared edit cursor is no substitute either: follow-playback writes the PATTERN
 * row into it every row (useTransportStore.setCurrentRow), so a matrix that
 * showed its cursor while the song played stepped once per pattern row
 * (PATTERN-MATRIX-SCROLL, owner 2026-10-14).
 */
export function resolveFormatViewRow(i: FormatViewRowInput): { row: number; rideClock: boolean } {
  const rideClock = !i.rowsArePositions && i.hostPlaying && i.clockPlaying;
  const playRow = rideClock ? i.clockRow : i.hostRow;
  return { row: resolveScrollRow(i.hostPlaying, i.followPlayback, playRow, i.cursorRow), rideClock };
}

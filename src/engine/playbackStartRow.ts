/**
 * A one-shot start row for the next playback start.
 *
 * In song mode playback starts at the transport's current row; in pattern
 * (loop) mode it starts at row 0 of the looped position, so Play Pattern
 * always begins at the top. A command that must start at a row whatever the
 * mode (row preview) leaves the row here; usePatternPlayback takes it when it
 * starts the replayer.
 */

let pending: number | null = null;

export function requestPlaybackStartRow(row: number): void {
  pending = Math.max(0, Math.floor(row));
}

/** The requested row, once; null when none was requested. */
export function takePlaybackStartRow(): number | null {
  const row = pending;
  pending = null;
  return row;
}

/**
 * get_playhead_offset: how far the row the grid SHOWS is from the row the listener HEARS.
 *
 * An engine that reports its position stamps each report with the context time its tick rendered at. The audio output
 * timestamp (contextTime heard at performanceTime) maps that render time to the wall time the tick reaches the ear. The
 * grid changing to a row at wall time `obsMs` is then early (negative) or late (positive) by obsMs - heardMs.
 */

export interface PlayheadLogEntry { sec: number; songPos: number; row: number }
export interface OutputStamp { contextTime: number; performanceTime: number }

export interface OffsetStats { count: number; meanMs: number; medianMs: number; minMs: number; maxMs: number; stdMs: number }

/** Wall time (performance.now clock) at which a tick rendered at context time `sec` is heard. */
export function heardAtMs(sec: number, stamp: OutputStamp): number {
  return stamp.performanceTime + (sec - stamp.contextTime) * 1000;
}

/**
 * Offset of one display change: the grid went to (songPos,row) at obsMs. The row's start in the log is the earliest entry
 * of the latest run of entries at that position; null when the log has no such run.
 */
export function offsetOfChange(
  log: readonly PlayheadLogEntry[], songPos: number, row: number, obsMs: number, stamp: OutputStamp,
): number | null {
  let i = log.length - 1;
  while (i >= 0 && !(log[i].songPos === songPos && log[i].row === row)) i--;
  if (i < 0) return null;
  while (i > 0 && log[i - 1].songPos === songPos && log[i - 1].row === row) i--;
  return obsMs - heardAtMs(log[i].sec, stamp);
}

export function offsetStats(offsetsMs: readonly number[]): OffsetStats | null {
  if (offsetsMs.length === 0) return null;
  const sorted = [...offsetsMs].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const r = (v: number) => Math.round(v * 10) / 10;
  return { count: n, meanMs: r(mean), medianMs: r(sorted[Math.floor(n / 2)]), minMs: r(sorted[0]), maxMs: r(sorted[n - 1]), stdMs: r(std) };
}

/**
 * The time of every played row of a tracker song, from the one order walk
 * (timeOrderPositions: Fxx speed / tempo per row, Dxx, Bxx, E6x pattern
 * loops, EEx pattern delay). A DJ deck maps the audio it plays (a render of
 * the song) to the pattern row heard at each moment with it, and a tracker
 * deck maps a row back to its song time.
 *
 * Before this the deck kept its own walk, one row length per order position
 * (the speed at the pattern's end) and no loops or breaks: a song that
 * changes speed inside a pattern (a swing, F0B / F05 every row) ran its rows
 * at the wrong rate and sat on the last row of each pattern for seconds.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { timeOrderPositions } from './autodj/trackerMixAnalysis';

export interface SongRowTimeline {
  /** Start of each played row, ms, ascending. */
  timesMs: Float64Array;
  /** Order position of each played row. */
  songPos: Int32Array;
  /** Pattern row of each played row. */
  pattPos: Int32Array;
  /** End of the last played row, ms. */
  endMs: number;
}

export const EMPTY_ROW_TIMELINE: SongRowTimeline = {
  timesMs: new Float64Array(0), songPos: new Int32Array(0), pattPos: new Int32Array(0), endMs: 0,
};

export function songRowTimeline(song: TrackerSong): SongRowTimeline {
  const { positions, rowTimes } = timeOrderPositions(song);
  const n = rowTimes.reduce((sum, times) => sum + times.length, 0);
  const timesMs = new Float64Array(n);
  const songPos = new Int32Array(n);
  const pattPos = new Int32Array(n);
  let k = 0;
  positions.forEach((p, i) => {
    rowTimes[i].forEach((t, r) => {
      timesMs[k] = t * 1000;
      songPos[k] = p.index;
      pattPos[k] = p.startRow + r;
      k++;
    });
  });
  return { timesMs, songPos, pattPos, endMs: (positions[positions.length - 1]?.end ?? 0) * 1000 };
}

/** Index of the played row sounding at `ms` (the last row past the end), or -1 for an empty timeline. */
function rowIndexAt(tl: SongRowTimeline, ms: number): number {
  const n = tl.timesMs.length;
  if (n === 0) return -1;
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tl.timesMs[mid] <= ms) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/** The row playing at `ms` into the song, or null for a song with no played rows. */
export function rowAtTime(tl: SongRowTimeline, ms: number): { songPos: number; pattPos: number } | null {
  const i = rowIndexAt(tl, ms);
  return i < 0 ? null : { songPos: tl.songPos[i], pattPos: tl.pattPos[i] };
}

/**
 * Song time (ms) at a row, `into` (0..1) of the way through it: its first
 * play (a row a pattern loop repeats is first met on its first pass). Null
 * when the walk never plays that row.
 */
export function timeAtRow(tl: SongRowTimeline, songPos: number, pattPos: number, into = 0): number | null {
  for (let i = 0; i < tl.timesMs.length; i++) {
    if (tl.songPos[i] !== songPos || tl.pattPos[i] !== pattPos) continue;
    const next = i + 1 < tl.timesMs.length ? tl.timesMs[i + 1] : tl.endMs;
    return tl.timesMs[i] + Math.max(0, Math.min(1, into)) * (next - tl.timesMs[i]);
  }
  return null;
}

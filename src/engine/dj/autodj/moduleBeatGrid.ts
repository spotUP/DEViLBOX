/**
 * The module's own beat grid (dj-juggling plan P1.1): a tracker song carries
 * its timing (rows, speed, tick tempo, pattern breaks), so its beats and bars
 * are read from the order-list walk, not guessed from the rendered audio.
 * One tempo source per track: the deck grid, the deck BPM, the DJTrackAnalysis
 * and the playlist BPM all come from here when the walk matches the render.
 *
 * Pure over a TrackerSong.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { timeOrderPositions, rowSeconds } from './trackerMixAnalysis';

/** Tracker convention: 4 rows a beat, 4 beats a bar (also used by trackerMixAnalysis). */
export const TRACKER_ROWS_PER_BEAT = 4;
export const TRACKER_BEATS_PER_BAR = 4;
/**
 * Walk-vs-render agreement needed before the song's timing is trusted. Plan
 * default (2 %); probe P0.4 (walk / render ratio over the owner's recent
 * tracker tracks) has not run yet and may move it.
 */
export const MODULE_GRID_TOLERANCE = 0.02;

export interface ModuleBeatGrid {
  /** Seconds, on the rendered audio. */
  beats: number[];
  /** Seconds; bar 1 = row 0 of every order position, then every 16 rows. */
  downbeats: number[];
  /** Musical BPM, time-weighted over the song (4 rows a beat). */
  bpm: number;
  beatsPerBar: number;
  confidence: 1;
  source: 'module';
}

/** Musical BPM of a speed and tick tempo (4 rows a beat): 6 * tickBpm / speed. */
export function musicalBpm(speed: number, tickBpm: number): number {
  return 60 / (TRACKER_ROWS_PER_BEAT * rowSeconds(speed, tickBpm));
}

export interface ModuleBeatGridOptions {
  /**
   * The render was capped at this many seconds (the playlist analyser renders
   * a 90 s preview). A capped render cannot confirm the song's length, so the
   * agreement check is skipped and the grid covers the rendered part.
   */
  renderCapSec?: number;
}

/**
 * The song's own grid, or null when the timing walk does not match the
 * rendered audio. Beats sit at the walk's times: the replayer plays the
 * song's timing exactly, and a render longer than the walk is its tail (a
 * decay, a fade), not a slower song, so the grid is never stretched onto it.
 */
export function moduleBeatGrid(song: TrackerSong, renderedDurationSec: number, opts: ModuleBeatGridOptions = {}): ModuleBeatGrid | null {
  const { positions, rowTimes } = timeOrderPositions(song);
  const walkEnd = positions[positions.length - 1]?.end ?? 0;
  if (walkEnd <= 0 || !(renderedDurationSec > 0)) return null;
  const capped = opts.renderCapSec !== undefined && renderedDurationSec >= opts.renderCapSec - 0.5 && walkEnd > renderedDurationSec;
  if (!capped && Math.abs(renderedDurationSec / walkEnd - 1) > MODULE_GRID_TOLERANCE) return null;
  const beats: number[] = [];
  const downbeats: number[] = [];
  const rowsPerBar = TRACKER_ROWS_PER_BEAT * TRACKER_BEATS_PER_BAR;
  rowTimes.forEach((times, p) => {
    const startRow = positions[p].startRow;
    for (let i = 0; i < times.length; i++) {
      const row = startRow + i;
      // A beat every 4th pattern row, a bar every 16th; each position starts a bar (bar 1 = its first row).
      if (i !== 0 && row % TRACKER_ROWS_PER_BEAT !== 0) continue;
      const t = times[i];
      if (t >= renderedDurationSec) return; // past the rendered audio
      beats.push(t);
      if (i === 0 || row % rowsPerBar === 0) downbeats.push(t);
    }
  });
  // Time-weighted musical BPM = beats per minute over the whole walk.
  const playedRows = positions.reduce((n, p) => n + p.rows, 0);
  const bpm = (60 * playedRows / TRACKER_ROWS_PER_BEAT) / walkEnd;
  return {
    beats, downbeats, bpm: Math.round(bpm * 100) / 100,
    beatsPerBar: TRACKER_BEATS_PER_BAR, confidence: 1, source: 'module',
  };
}

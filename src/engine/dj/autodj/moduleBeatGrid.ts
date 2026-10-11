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
import { timeOrderPositions, rowSeconds, type OrderWalk } from './trackerMixAnalysis';
import { resolveSongChannelRoles } from '@/engine/dub/songChannelIdentity';
import { rowsPerBeat as speedRowsPerBeat } from '@/lib/dub/musicalClock';

export const TRACKER_BEATS_PER_BAR = 4;
/**
 * Walk-vs-render agreement needed before the song's timing is trusted. Plan
 * default (2 %); probe P0.4 (walk / render ratio over the owner's recent
 * tracker tracks) has not run yet and may move it.
 */
export const MODULE_GRID_TOLERANCE = 0.02;
/** A beat level whose tempo falls outside this range is not the song's beat (a half or double reading). */
export const PLAUSIBLE_BPM_MIN = 60;
export const PLAUSIBLE_BPM_MAX = 200;
/** How much better the drums must fit another beat level before it replaces the speed convention. */
const DRUM_EVIDENCE_MARGIN = 0.15;

export interface ModuleBeatGrid {
  /** Seconds, on the rendered audio. */
  beats: number[];
  /** Seconds; bar 1 = row 0 of every order position, then every beatsPerBar beats. */
  downbeats: number[];
  /** Musical BPM at the speed / tempo the song plays longest (the same number detectBPM reports). */
  bpm: number;
  beatsPerBar: number;
  /** Rows per beat the grid uses (see songRowsPerBeat). */
  rowsPerBeat: number;
  confidence: 1;
  source: 'module';
}

/** Musical BPM of a speed, tick tempo and rows per beat. */
export function musicalBpm(speed: number, tickBpm: number, rowsPerBeat: number): number {
  return 60 / (rowsPerBeat * rowSeconds(speed, tickBpm));
}

/** The speed / tick tempo pair the walk spends the most time at. */
export function dominantTempo(song: TrackerSong, walk: OrderWalk): { speed: number; bpm: number } {
  let best: { speed: number; bpm: number; seconds: number } | null = null;
  for (const e of walk.tempoSeconds) if (!best || e.seconds > best.seconds) best = e;
  return {
    speed: best?.speed ?? (song.initialSpeed > 0 ? song.initialSpeed : 6),
    bpm: best?.bpm ?? (song.initialBPM > 0 ? song.initialBPM : 125),
  };
}

/**
 * Backbeat fit of a beat level: for each drum sound (instrument on a
 * percussion channel, dense hat-like sounds left out), the share of its hits
 * that land on a beat, times the share of those on beats 2 and 4. A snare on
 * the backbeat scores 1 at the right level and 0 at half of it.
 */
function backbeatScore(song: TrackerSong, walk: OrderWalk, drumChannels: number[], rowsPerBeat: number): number {
  const sounds = new Map<string, { hits: number; onBeat: number; odd: number }>();
  walk.positions.forEach((pos) => {
    const pattern = song.patterns[pos.patternIndex];
    if (!pattern) return;
    for (const ch of drumChannels) {
      const rows = pattern.channels[ch]?.rows ?? [];
      for (let r = pos.startRow; r < pos.startRow + pos.rows; r++) {
        const cell = rows[r];
        const key = `${ch}:${cell?.instrument ?? 0}`;
        if (!sounds.has(key)) sounds.set(key, { hits: 0, onBeat: 0, odd: 0 });
        if (!cell || cell.note < 1 || cell.note > 96) continue;
        const s = sounds.get(key)!;
        s.hits++;
        if (r % rowsPerBeat !== 0) continue;
        s.onBeat++;
        if ((r / rowsPerBeat) % 2 === 1) s.odd++;
      }
    }
  });
  const played = walk.positions.reduce((n, p) => n + p.rows, 0) || 1;
  let best = 0;
  for (const s of sounds.values()) {
    if (s.hits < 4 || s.hits / played > 0.4) continue; // too few to judge, or a hat / roll
    best = Math.max(best, (s.onBeat / s.hits) * (s.onBeat > 0 ? s.odd / s.onBeat : 0));
  }
  return best;
}

/**
 * Rows per beat of a song, from the song itself. The tracker convention (a
 * beat is 24 ticks: 4 rows at speed 6, 8 at speed 3; the same rule as the
 * Auto Dub MusicalClock) is the default; the drums replace it with half
 * that when their backbeat fits that level clearly better and its tempo is
 * plausible. Speed alone does not give the beat.
 */
export function songRowsPerBeat(song: TrackerSong, walk: OrderWalk = timeOrderPositions(song)): { rowsPerBeat: number; source: 'drums' | 'speed' } {
  const { speed, bpm } = dominantTempo(song, walk);
  const conventional = Math.max(1, Math.round(speedRowsPerBeat(speed)));
  let drumChannels: number[] = [];
  try {
    const identity = resolveSongChannelRoles({
      patterns: song.patterns, patternOrder: walk.positions.map((p) => p.patternIndex),
      instruments: Array.isArray(song.instruments) ? song.instruments : [],
    });
    drumChannels = identity.roles.map((r, i) => (r === 'percussion' ? i : -1)).filter((i) => i >= 0);
  } catch { drumChannels = []; }
  if (drumChannels.length === 0) return { rowsPerBeat: conventional, source: 'speed' };
  const plausible = (rpb: number) => {
    const b = musicalBpm(speed, bpm, rpb);
    return b >= PLAUSIBLE_BPM_MIN && b < PLAUSIBLE_BPM_MAX;
  };
  const base = backbeatScore(song, walk, drumChannels, conventional);
  let pick = { rowsPerBeat: conventional, source: 'speed' as 'drums' | 'speed', score: base };
  // Only a finer beat can replace the convention: a composer at speed 3 may
  // write 4 rows a beat, but a beat coarser than 24 ticks is not a tracker
  // idiom, and a half-time drum pattern (kick on 1, snare on 3) must not
  // halve a song (the corpus tracker track, 125 BPM at speed 6).
  for (const rpb of [conventional / 2]) {
    if (!Number.isInteger(rpb) || rpb < 1 || !plausible(rpb)) continue;
    const score = backbeatScore(song, walk, drumChannels, rpb);
    if (score >= base + DRUM_EVIDENCE_MARGIN && score > pick.score) pick = { rowsPerBeat: rpb, source: 'drums', score };
  }
  return { rowsPerBeat: pick.rowsPerBeat, source: pick.source };
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
  const walk = timeOrderPositions(song);
  const { positions, rowTimes } = walk;
  const walkEnd = positions[positions.length - 1]?.end ?? 0;
  if (walkEnd <= 0 || !(renderedDurationSec > 0)) return null;
  const capped = opts.renderCapSec !== undefined && renderedDurationSec >= opts.renderCapSec - 0.5 && walkEnd > renderedDurationSec;
  if (!capped && Math.abs(renderedDurationSec / walkEnd - 1) > MODULE_GRID_TOLERANCE) return null;
  const beats: number[] = [];
  const downbeats: number[] = [];
  const { rowsPerBeat } = songRowsPerBeat(song, walk);
  const rowsPerBar = rowsPerBeat * TRACKER_BEATS_PER_BAR;
  rowTimes.forEach((times, p) => {
    const startRow = positions[p].startRow;
    for (let i = 0; i < times.length; i++) {
      const row = startRow + i;
      // A beat every rowsPerBeat pattern rows, a bar every 4 beats; each position starts a bar (bar 1 = its first row).
      if (i !== 0 && row % rowsPerBeat !== 0) continue;
      const t = times[i];
      if (t >= renderedDurationSec) return; // past the rendered audio
      beats.push(t);
      if (i === 0 || row % rowsPerBar === 0) downbeats.push(t);
    }
  });
  // The BPM the song plays longest (an intro or a closing slow-down does not drag it); the beats carry every change.
  const { speed, bpm: tickBpm } = dominantTempo(song, walk);
  const bpm = musicalBpm(speed, tickBpm, rowsPerBeat);
  return {
    beats, downbeats, bpm: Math.round(bpm * 100) / 100,
    beatsPerBar: TRACKER_BEATS_PER_BAR, rowsPerBeat, confidence: 1, source: 'module',
  };
}

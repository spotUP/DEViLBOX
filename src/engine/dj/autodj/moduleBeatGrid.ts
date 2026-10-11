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
import { getRoleAtPosition } from '@/bridge/analysis/SongRoleTimeline';
import { rowsPerBeat as speedRowsPerBeat, DEFAULT_BEATS_PER_BAR } from '@/lib/dub/musicalClock';

/**
 * Confidence of a beat level the song's own drums confirm, and of one that
 * rests on the speed convention alone (owner juggling plan section 31: every
 * decision carries the confidence of its evidence). The convention sits below
 * the juggle layer's beat-level minimum (POLICY_MIN.beat.beat, 0.8) and at or
 * above its phrase-level one (0.6): a module whose beat no drum confirms gets
 * phrase trading, never 1-bar or beat cuts.
 */
export const BEAT_CONFIRMED_CONFIDENCE = 1;
export const BEAT_CONVENTION_CONFIDENCE = 0.7;
/** The drums' backbeat fit at the conventional level that counts as confirming it. */
const BACKBEAT_CONFIRMS = 0.5;
/** Meter confidence with no drum repetition to read (owner plan section 56: the default meter is assumed, not known). */
export const METER_ASSUMED_CONFIDENCE = 0.5;
/** Meter confidence when only the pattern lengths say it (each pattern a whole number of bars). */
export const METER_LENGTH_CONFIDENCE = 0.65;
/** How much better the drums must repeat at one bar length than the other before it counts. */
const METER_EVIDENCE_MARGIN = 0.1;
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
  /** The song's meter (see songMeter): from its drums and pattern lengths, the musical-clock default only without evidence. */
  beatsPerBar: number;
  /** Rows per beat the grid uses (see songRowsPerBeat). */
  rowsPerBeat: number;
  /** Beat-level confidence: the beat positions are exact, the level is as sure as its evidence (songRowsPerBeat). */
  confidence: number;
  /** Meter confidence (songMeter). */
  meterConfidence: number;
  source: 'module';
}

/**
 * Whether a channel plays percussion at an order position and row: the
 * per-song identity's role timeline (owner plan section 38: a channel's role
 * changes over the song), the song-wide role where the timeline says nothing.
 */
export type PercussionAt = (channel: number, positionIndex: number, row: number) => boolean;

export function percussionAtFor(song: TrackerSong, walk: OrderWalk): { at: PercussionAt; channels: number } {
  try {
    const identity = resolveSongChannelRoles({
      patterns: song.patterns, patternOrder: walk.positions.map((p) => p.patternIndex),
      instruments: Array.isArray(song.instruments) ? song.instruments : [],
    });
    const tl = identity.timeline;
    const base = identity.baseRoles;
    const at: PercussionAt = (ch, p, row) => (tl ? getRoleAtPosition(tl, ch, p, row, 0.3) ?? base[ch] : identity.roles[ch]) === 'percussion';
    const channels = Math.max(base.length, identity.roles.length);
    return { at, channels };
  } catch {
    return { at: () => false, channels: 0 };
  }
}

/** The drum hits of the walk: per order position, per row, the drum sounds that start there (hat-like sounds left out). */
function drumHits(song: TrackerSong, walk: OrderWalk, perc: { at: PercussionAt; channels: number }): Array<Array<string[]>> {
  const counts = new Map<string, number>();
  const raw: Array<Array<string[]>> = walk.positions.map((pos, p) => {
    const pattern = song.patterns[pos.patternIndex];
    const rows: string[][] = [];
    for (let i = 0; i < pos.rows; i++) {
      const r = pos.startRow + i;
      const hits: string[] = [];
      for (let ch = 0; ch < perc.channels; ch++) {
        const cell = pattern?.channels[ch]?.rows?.[r];
        if (!cell || cell.note < 1 || cell.note > 96 || !perc.at(ch, p, r)) continue;
        const key = `${ch}:${cell.instrument ?? 0}`;
        hits.push(key);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      rows.push(hits);
    }
    return rows;
  });
  const played = walk.positions.reduce((n, p) => n + p.rows, 0) || 1;
  const keep = (k: string) => (counts.get(k) ?? 0) >= 4 && (counts.get(k) ?? 0) / played <= 0.4;
  return raw.map((rows) => rows.map((hits) => hits.filter(keep).sort()));
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
 * Backbeat fit of a beat level: for each drum sound, the share of its hits
 * that land on a beat, times the share of those on beats 2 and 4. A snare on
 * the backbeat scores 1 at the right level and 0 at half of it.
 */
function backbeatScore(walk: OrderWalk, hits: Array<Array<string[]>>, rowsPerBeat: number): number {
  const sounds = new Map<string, { hits: number; onBeat: number; odd: number }>();
  walk.positions.forEach((pos, p) => {
    hits[p].forEach((rowHits, i) => {
      const r = pos.startRow + i;
      for (const key of rowHits) {
        if (!sounds.has(key)) sounds.set(key, { hits: 0, onBeat: 0, odd: 0 });
        const s = sounds.get(key)!;
        s.hits++;
        if (r % rowsPerBeat !== 0) continue;
        s.onBeat++;
        if ((r / rowsPerBeat) % 2 === 1) s.odd++;
      }
    });
  });
  let best = 0;
  for (const s of sounds.values()) best = Math.max(best, (s.onBeat / s.hits) * (s.onBeat > 0 ? s.odd / s.onBeat : 0));
  return best;
}

/**
 * Rows per beat of a song, from the song itself. The tracker convention (a
 * beat is 24 ticks: 4 rows at speed 6, 8 at speed 3; the same rule as the
 * Auto Dub MusicalClock) is the default; the drums replace it with half
 * that when their backbeat fits that level clearly better and its tempo is
 * plausible. Speed alone does not give the beat, so its confidence says
 * whether the drums confirmed the level (owner plan section 31).
 */
export function songRowsPerBeat(song: TrackerSong, walk: OrderWalk = timeOrderPositions(song), perc = percussionAtFor(song, walk)): { rowsPerBeat: number; source: 'drums' | 'speed'; confidence: number } {
  const { speed, bpm } = dominantTempo(song, walk);
  const conventional = Math.max(1, Math.round(speedRowsPerBeat(speed)));
  const hits = drumHits(song, walk, perc);
  const anyDrums = hits.some((rows) => rows.some((h) => h.length > 0));
  if (!anyDrums) return { rowsPerBeat: conventional, source: 'speed', confidence: BEAT_CONVENTION_CONFIDENCE };
  const plausible = (rpb: number) => {
    const b = musicalBpm(speed, bpm, rpb);
    return b >= PLAUSIBLE_BPM_MIN && b < PLAUSIBLE_BPM_MAX;
  };
  const base = backbeatScore(walk, hits, conventional);
  let pick = { rowsPerBeat: conventional, source: 'speed' as 'drums' | 'speed', score: base };
  let rival = 0;
  // Only a finer beat can replace the convention: a composer at speed 3 may
  // write 4 rows a beat, but a beat coarser than 24 ticks is not a tracker
  // idiom, and a half-time drum pattern (kick on 1, snare on 3) must not
  // halve a song (the corpus tracker track, 125 BPM at speed 6).
  for (const rpb of [conventional / 2]) {
    if (!Number.isInteger(rpb) || rpb < 1 || !plausible(rpb)) continue;
    const score = backbeatScore(walk, hits, rpb);
    rival = Math.max(rival, score);
    if (score >= base + DRUM_EVIDENCE_MARGIN && score > pick.score) pick = { rowsPerBeat: rpb, source: 'drums', score };
  }
  // Confirmed: the drums chose the finer level, or they keep a backbeat on the conventional one with no close rival.
  const confirmed = pick.source === 'drums' || (base >= BACKBEAT_CONFIRMS && rival < base + DRUM_EVIDENCE_MARGIN / 3);
  return { rowsPerBeat: pick.rowsPerBeat, source: pick.source, confidence: confirmed ? BEAT_CONFIRMED_CONFIDENCE : BEAT_CONVENTION_CONFIDENCE };
}

/**
 * The song's meter, read from the song (owner plan section 56: never assume
 * 4/4 without consulting the music). Each order position starts a bar, so a
 * drum pattern that repeats every 3 beats is 3/4 and one that repeats every 4
 * is 4/4; the pattern lengths (a pattern is a whole number of bars) add their
 * weight. With nothing to read, the musical clock's default meter, at the
 * confidence of an assumption.
 */
export function songMeter(song: TrackerSong, walk: OrderWalk, rowsPerBeat: number, perc = percussionAtFor(song, walk)): { beatsPerBar: number; confidence: number; source: 'drums' | 'lengths' | 'default' } {
  const hits = drumHits(song, walk, perc);
  const candidates = [4, 3];
  const repeat = (beats: number): { same: number; pairs: number } => {
    const lag = beats * rowsPerBeat;
    let same = 0, pairs = 0;
    for (const rows of hits) {
      for (let i = 0; i + lag < rows.length; i++) {
        const a = rows[i], b = rows[i + lag];
        if (a.length === 0 && b.length === 0) continue;
        pairs++;
        if (a.length === b.length && a.every((k, j) => k === b[j])) same++;
      }
    }
    return { same, pairs };
  };
  const lengthFit = (beats: number) => {
    const ps = walk.positions.filter((p) => p.rows % rowsPerBeat === 0);
    return ps.length ? ps.filter((p) => (p.rows / rowsPerBeat) % beats === 0).length / ps.length : 0;
  };
  const rep = candidates.map((c) => repeat(c));
  if (rep.every((r) => r.pairs >= 8)) {
    const score = candidates.map((c, i) => 0.7 * (rep[i].same / rep[i].pairs) + 0.3 * lengthFit(c));
    const best = score[0] >= score[1] ? 0 : 1;
    const margin = Math.abs(score[0] - score[1]);
    if (margin >= METER_EVIDENCE_MARGIN) return { beatsPerBar: candidates[best], confidence: Math.min(1, 0.6 + margin), source: 'drums' };
  }
  const l4 = lengthFit(4), l3 = lengthFit(3);
  if (l4 === 1 && l3 < 1) return { beatsPerBar: 4, confidence: METER_LENGTH_CONFIDENCE, source: 'lengths' };
  if (l3 === 1 && l4 < 1) return { beatsPerBar: 3, confidence: METER_LENGTH_CONFIDENCE, source: 'lengths' };
  return { beatsPerBar: DEFAULT_BEATS_PER_BAR, confidence: METER_ASSUMED_CONFIDENCE, source: 'default' };
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
  const perc = percussionAtFor(song, walk);
  const level = songRowsPerBeat(song, walk, perc);
  const rowsPerBeat = level.rowsPerBeat;
  const meter = songMeter(song, walk, rowsPerBeat, perc);
  const rowsPerBar = rowsPerBeat * meter.beatsPerBar;
  rowTimes.forEach((times, p) => {
    const startRow = positions[p].startRow;
    for (let i = 0; i < times.length; i++) {
      const row = startRow + i;
      // A beat every rowsPerBeat pattern rows, a bar every beatsPerBar beats; each position starts a bar (bar 1 = its first row).
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
    beatsPerBar: meter.beatsPerBar, rowsPerBeat, confidence: level.confidence, meterConfidence: meter.confidence, source: 'module',
  };
}

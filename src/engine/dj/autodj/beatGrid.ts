/**
 * Real beat grid (plan section 5): beats with strengths, a downbeat grid
 * found by a phase search (never "first detected beat = bar 1"), the meter,
 * and the five landmarks the planner must tell apart.
 *
 * Pure functions over the beat list and the extended timelines.
 */
import type {
  AnalysisConfidence, Bar, Beat, BeatGrid, DownbeatGrid, ExtendedAnalysis, GridLandmarks, Meter, MeterAnalysis,
} from './types';

/**
 * A beat level whose tempo falls outside this range is not the song's beat (a
 * half or double reading). Kept in this pure module so the SID player clock in
 * the DJ render worker can use it without moduleBeatGrid's store imports.
 */
export const PLAUSIBLE_BPM_MIN = 60;
export const PLAUSIBLE_BPM_MAX = 200;

/**
 * A track's beat confidence (owner juggling plan section 31): its beats AND
 * its bars - the beat grid and the downbeat grid with the meter (an assumed
 * meter lowers the downbeat confidence). A cut on the beat of a wrong bar is
 * as wrong as one off the beat. The one definition: the transition planner
 * (juggle transitions) and the juggle controller (in-mix and stand-alone
 * juggles, their abort checks) both read it.
 */
export function trackBeatConfidence(a: { analysisConfidence: Pick<AnalysisConfidence, 'beatGrid' | 'downbeat'> }): number {
  return Math.min(a.analysisConfidence.beatGrid, a.analysisConfidence.downbeat);
}

export interface BeatGridInput {
  beats: number[];
  /** The legacy downbeats, used only when no timelines exist. */
  downbeats: number[];
  bpm: number;
  bpmConfidence: number;
  timeSignature: number;
  extended: ExtendedAnalysis | null;
  durationSec: number;
  /**
   * Known meter (module timing): skips the phase search; the bars are the
   * given `downbeats` (each must be one of `beats`). `confidence` is the
   * beat grid's, `meterConfidence` the meter's (default: `confidence`); the
   * downbeat grid is as sure as the lesser of the two.
   */
  fixed?: { beatsPerBar: number; confidence: number; meterConfidence?: number };
}

export interface BeatGridResult {
  beatGrid: BeatGrid;
  downbeats: DownbeatGrid;
  meter: MeterAnalysis;
  landmarks: GridLandmarks;
}

/** Read a timeline at a time in seconds (0 outside). */
export function timelineAt(values: number[], hopSec: number, t: number): number {
  if (values.length === 0) return 0;
  const i = Math.floor(t / hopSec);
  if (i < 0 || i >= values.length) return 0;
  return values[i];
}

/** The strongest reading in the 300 ms after the beat: a hit at the end of a hop lands in the next one. */
function windowMax(values: number[], hopSec: number, t: number, windowSec = 0.3): number {
  let m = 0;
  for (let u = t; u <= t + windowSec; u += hopSec) m = Math.max(m, timelineAt(values, hopSec, u));
  return m;
}

function beatStrengths(beats: number[], ext: ExtendedAnalysis | null): number[] {
  if (!ext) return beats.map(() => 0.5);
  return beats.map((t) => {
    const b = windowMax(ext.bass, ext.hopSec, t);
    const d = windowMax(ext.drums, ext.hopSec, t);
    return Math.min(1, 0.6 * b + 0.6 * d);
  });
}

/**
 * Phase search: for every meter and every phase, how much louder are the
 * candidate downbeats than the other beats. The best pair wins, and the
 * margin to the runner-up is the confidence.
 */
export function searchMeterAndPhase(strengths: number[], candidates: number[] = [4, 3]): {
  beatsPerBar: number; phase: number; confidence: number; alternatives: Array<{ beatsPerBar: number; score: number }>;
} {
  const scores: Array<{ beatsPerBar: number; phase: number; score: number }> = [];
  for (const P of candidates) {
    if (strengths.length < P * 2) continue;
    for (let p = 0; p < P; p++) {
      let on = 0, onN = 0, off = 0, offN = 0;
      for (let i = 0; i < strengths.length; i++) {
        if (i % P === p) { on += strengths[i]; onN++; } else { off += strengths[i]; offN++; }
      }
      const score = (onN ? on / onN : 0) - (offN ? off / offN : 0);
      scores.push({ beatsPerBar: P, phase: p, score });
    }
  }
  if (scores.length === 0) {
    return { beatsPerBar: 4, phase: 0, confidence: 0, alternatives: [] };
  }
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];
  const second = scores[1];
  const spread = Math.max(1e-6, Math.abs(best.score) + (second ? Math.abs(second.score) : 0));
  const confidence = second ? Math.min(1, Math.max(0, (best.score - second.score) / spread + 0.3)) : 0.5;
  const altMap = new Map<number, number>();
  for (const s of scores) altMap.set(s.beatsPerBar, Math.max(altMap.get(s.beatsPerBar) ?? -Infinity, s.score));
  const alternatives = [...altMap.entries()].map(([beatsPerBar, score]) => ({ beatsPerBar, score }));
  return { beatsPerBar: best.beatsPerBar, phase: best.phase, confidence, alternatives };
}

/** 1 for perfectly regular inter-beat intervals, 0 for chaos. */
export function beatRegularity(beats: number[]): number {
  if (beats.length < 3) return 0;
  const ivs: number[] = [];
  for (let i = 1; i < beats.length; i++) ivs.push(beats[i] - beats[i - 1]);
  const m = ivs.reduce((a, b) => a + b, 0) / ivs.length;
  if (m <= 0) return 0;
  const v = ivs.reduce((a, b) => a + (b - m) * (b - m), 0) / ivs.length;
  const cv = Math.sqrt(v) / m;
  return Math.max(0, Math.min(1, 1 - cv * 5));
}

export function buildBeatGrids(input: BeatGridInput): BeatGridResult {
  const { beats, extended, bpmConfidence, durationSec } = input;
  const strengths = beatStrengths(beats, extended);

  let beatsPerBar = input.timeSignature || 4;
  let phase = 0;
  let meterConfidence = 0.3;
  let alternatives: Array<{ beatsPerBar: number; score: number }> = [];
  if (input.fixed) {
    beatsPerBar = input.fixed.beatsPerBar;
    meterConfidence = input.fixed.meterConfidence ?? input.fixed.confidence;
  } else if (extended && beats.length >= 8) {
    const found = searchMeterAndPhase(strengths);
    beatsPerBar = found.beatsPerBar;
    phase = found.phase;
    meterConfidence = found.confidence;
    alternatives = found.alternatives;
  } else if (beats.length > 0 && input.downbeats.length > 0) {
    // Legacy grid: downbeats were every N-th beat from beat 0.
    const idx = beats.indexOf(input.downbeats[0]);
    phase = idx >= 0 ? idx % beatsPerBar : 0;
  }

  // First musical beat: the first beat whose neighbourhood carries rhythm.
  let firstMusicalIdx = 0;
  if (extended && beats.length > 0) {
    const p95 = [...strengths].sort((a, b) => a - b)[Math.floor(strengths.length * 0.95)] || 1;
    for (let i = 0; i < beats.length; i++) {
      let s = 0, n = 0;
      for (let j = i; j < Math.min(beats.length, i + 4); j++) { s += strengths[j]; n++; }
      if (strengths[i] >= 0.3 * p95 && n && s / n >= 0.3 * p95) { firstMusicalIdx = i; break; }
    }
  }

  // Downbeat beat indices: the given bars (fixed meter) or every beatsPerBar-th beat from the phase.
  const downbeatIdx: number[] = [];
  if (input.fixed) {
    const at = new Set(input.downbeats);
    beats.forEach((t, i) => { if (at.has(t)) downbeatIdx.push(i); });
  } else {
    for (let i = phase; i < beats.length; i += beatsPerBar) downbeatIdx.push(i);
  }
  if (input.fixed) phase = downbeatIdx[0] ?? 0;
  const isDownbeatIdx = new Set(downbeatIdx);

  const beatObjs: Beat[] = beats.map((time, index) => ({
    time,
    index,
    strength: strengths[index],
    isDownbeat: isDownbeatIdx.has(index),
  }));

  // Bars from downbeat to downbeat.
  const bars: Bar[] = [];
  downbeatIdx.forEach((i, k) => {
    const nextIdx = k + 1 < downbeatIdx.length ? downbeatIdx[k + 1] : Math.min(beats.length, i + beatsPerBar);
    const beatIdx: number[] = [];
    for (let j = i; j < nextIdx; j++) beatIdx.push(j);
    const start = beats[i];
    const end = nextIdx < beats.length
      ? beats[nextIdx]
      : start + (beatIdx.length) * (input.bpm > 0 ? 60 / input.bpm : 0.5);
    bars.push({ index: k, start, end, downbeat: start, beats: beatIdx, full: beatIdx.length === beatsPerBar });
  });

  const firstDownbeatIdx = (() => {
    for (const i of downbeatIdx) if (i >= firstMusicalIdx) return i;
    return Math.min(beats.length - 1, Math.max(0, phase));
  })();
  const firstFullBar = bars.find((b) => b.full && b.beats[0] >= firstDownbeatIdx);
  const firstFullBarTime = firstFullBar ? firstFullBar.start : (beats[firstDownbeatIdx] ?? 0);

  // First usable mixing point: a full bar with drums under it.
  let firstUsableMixPoint = firstFullBarTime;
  if (extended) {
    for (const bar of bars) {
      if (!bar.full || bar.start < firstFullBarTime) continue;
      let s = 0, n = 0;
      for (let t = bar.start; t < bar.end; t += extended.hopSec) { s += timelineAt(extended.drums, extended.hopSec, t); n++; }
      if (n && s / n >= 0.3) { firstUsableMixPoint = bar.start; break; }
    }
  }

  const regularity = beatRegularity(beats);
  const gridConfidence = input.fixed ? input.fixed.confidence
    : beats.length === 0 ? 0 : Math.min(1, 0.5 * bpmConfidence + 0.5 * regularity);

  const beatGrid: BeatGrid = {
    bpm: input.bpm,
    firstBeat: beats[firstMusicalIdx] ?? 0,
    beats: beatObjs,
    confidence: gridConfidence,
  };
  const downbeats: DownbeatGrid = {
    bars,
    meter: { beatsPerBar, confidence: meterConfidence },
    confidence: input.fixed ? Math.min(input.fixed.confidence, meterConfidence) : Math.min(1, gridConfidence * (0.5 + 0.5 * meterConfidence)),
    phaseOffset: phase,
  };
  const meter: MeterAnalysis = { beatsPerBar, confidence: meterConfidence, alternatives };
  const landmarks: GridLandmarks = {
    firstTransient: extended ? extended.firstTransient : (beats[0] ?? 0),
    firstMusicalBeat: beats[firstMusicalIdx] ?? 0,
    firstDownbeat: beats[firstDownbeatIdx] ?? 0,
    firstFullBar: firstFullBarTime,
    firstUsableMixPoint: Math.min(durationSec, firstUsableMixPoint),
  };
  return { beatGrid, downbeats, meter, landmarks };
}

/** Index of the bar containing `t` (last bar when past the end, 0 before). */
export function barIndexAt(grid: DownbeatGrid, t: number): number {
  const bars = grid.bars;
  if (bars.length === 0) return 0;
  let lo = 0, hi = bars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (bars[mid].start <= t) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/**
 * The beat (raw beat index, the clock of `fractionalBeatAt`) where bar `bar` of a downbeat grid
 * starts: the bar's first beat, so a grid whose first downbeat is not the first detected beat
 * (`phaseOffset`) puts bar 0 on that downbeat, not on beat 0. Past either end of the bar list the
 * bars continue at the meter. The one bar -> beat mapping for planners that speak bars (scratch
 * audit SA-M1).
 */
export function barStartBeat(grid: { bars: readonly Pick<Bar, 'beats'>[]; meter?: Pick<Meter, 'beatsPerBar'>; phaseOffset?: number }, bar: number): number {
  const bpb = grid.meter?.beatsPerBar || 4;
  const bars = grid.bars;
  const known = bars[bar]?.beats[0];
  if (known !== undefined) return known;
  if (bars.length === 0) return (grid.phaseOffset ?? 0) + bar * bpb;
  if (bar < 0) return (bars[0]!.beats[0] ?? grid.phaseOffset ?? 0) + bar * bpb;
  const last = bars.length - 1;
  return (bars[last]!.beats[0] ?? 0) + (bar - last) * bpb;
}

/**
 * How far into its bar the fractional beat `beat` is (0 = on the downbeat, up to 1), on the grid's own
 * bars (barStartBeat): a grid whose first downbeat is not beat 0 (`phaseOffset`) has its downbeats there,
 * not on multiples of the meter. Before the first bar and past the last the bars continue at the meter.
 */
export function barPhaseAtBeat(grid: { bars: readonly Pick<Bar, 'beats'>[]; meter?: Pick<Meter, 'beatsPerBar'>; phaseOffset?: number }, beat: number): number {
  const bpb = grid.meter?.beatsPerBar || 4;
  const wrap = (from: number) => ((((beat - from) % bpb) + bpb) % bpb) / bpb;
  const bars = grid.bars;
  if (bars.length === 0) return wrap(grid.phaseOffset ?? 0);
  const first = barStartBeat(grid, 0);
  if (beat < first) return wrap(first);
  let lo = 0, hi = bars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (barStartBeat(grid, mid) <= beat) lo = mid; else hi = mid - 1;
  }
  const start = barStartBeat(grid, lo);
  if (lo === bars.length - 1) return wrap(start);
  const len = barStartBeat(grid, lo + 1) - start;
  return len > 0 ? Math.min(1 - 1e-9, (beat - start) / len) : 0;
}

/**
 * Fractional beat index at time `t` on a beat grid: 3.25 = a quarter past
 * beat 3. Before the first beat / after the last the local period extends
 * the grid. The one mapping from a deck position to musical time.
 */
export function fractionalBeatAt(grid: BeatGrid, t: number): number {
  const beats = grid.beats;
  if (beats.length === 0) return t * grid.bpm / 60;
  const period = grid.bpm > 0 ? 60 / grid.bpm : (beats.length > 1 ? beats[1].time - beats[0].time : 0.5);
  if (t < beats[0].time) return (t - beats[0].time) / period;
  let lo = 0, hi = beats.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (beats[mid].time <= t) lo = mid; else hi = mid - 1;
  }
  const next = lo + 1 < beats.length ? beats[lo + 1].time : beats[lo].time + period;
  const span = Math.max(1e-6, next - beats[lo].time);
  return lo + (t - beats[lo].time) / span;
}

/** Seconds of fractional beat `b` on the grid (inverse of fractionalBeatAt). */
export function timeAtBeat(grid: BeatGrid, b: number): number {
  const beats = grid.beats;
  const period = grid.bpm > 0 ? 60 / grid.bpm : 0.5;
  if (beats.length === 0) return b * period;
  if (b < 0) return beats[0].time + b * period;
  const i = Math.floor(b);
  const frac = b - i;
  if (i >= beats.length - 1) return beats[beats.length - 1].time + (b - (beats.length - 1)) * period;
  return beats[i].time + frac * (beats[i + 1].time - beats[i].time);
}

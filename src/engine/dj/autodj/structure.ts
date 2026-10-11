/**
 * Musical structure (plan section 6): per-bar features, segment boundaries
 * from novelty, probabilistic section labels, phrase length detected per
 * song (4/8/16 bars), phrases and arrangement events.
 *
 * Pure functions over the bar grid and the extended timelines.
 */
import type {
  ArrangementEvent, DJPhrase, DJSection, DownbeatGrid, ExtendedAnalysis, SectionKind,
} from './types';
import { timelineAt } from './beatGrid';

export interface BarFeatures {
  bar: number;
  start: number;
  end: number;
  bass: number;
  drums: number;
  harmonic: number;
  vocal: number;
  brightness: number;
  loudnessDb: number;
  intensity: number;
}

const SILENCE_DB = -60;

/** Perceived intensity 0..1 from the band activities and loudness (not RMS alone). */
export function perceivedIntensity(f: { bass: number; drums: number; harmonic: number; brightness: number; loudnessDb: number }): number {
  // The band activities are shares (what is playing); the short-term
  // loudness scales them (how hard it plays): a build that only gets louder
  // still rises, silence is zero, and RMS alone never decides.
  const loud = Math.max(0, Math.min(1, (f.loudnessDb + 45) / 35));
  const texture = 0.4 * f.drums + 0.3 * f.bass + 0.2 * f.harmonic + 0.1 * f.brightness;
  return Math.min(1, loud * (0.1 + 0.9 * texture));
}

export function barFeatures(grid: DownbeatGrid, ext: ExtendedAnalysis): BarFeatures[] {
  return grid.bars.map((bar) => {
    const acc = { bass: 0, drums: 0, harmonic: 0, vocal: 0, brightness: 0, loudnessDb: 0 };
    let n = 0;
    for (let t = bar.start; t < bar.end; t += ext.hopSec) {
      acc.bass += timelineAt(ext.bass, ext.hopSec, t);
      acc.drums += timelineAt(ext.drums, ext.hopSec, t);
      acc.harmonic += timelineAt(ext.harmonic, ext.hopSec, t);
      acc.vocal += timelineAt(ext.vocal, ext.hopSec, t);
      acc.brightness += timelineAt(ext.brightness, ext.hopSec, t);
      const i = Math.floor(t / ext.hopSec);
      acc.loudnessDb += ext.loudnessShortTermDb[i] ?? -100;
      n++;
    }
    if (n === 0) n = 1;
    const f = {
      bass: acc.bass / n, drums: acc.drums / n, harmonic: acc.harmonic / n, vocal: acc.vocal / n,
      brightness: acc.brightness / n, loudnessDb: acc.loudnessDb / n,
    };
    return { bar: bar.index, start: bar.start, end: bar.end, ...f, intensity: perceivedIntensity(f) };
  });
}

function distance(a: BarFeatures, b: BarFeatures): number {
  const dl = Math.min(1, Math.abs(a.loudnessDb - b.loudnessDb) / 20);
  return Math.sqrt(
    (a.bass - b.bass) ** 2 + (a.drums - b.drums) ** 2 + (a.harmonic - b.harmonic) ** 2 +
    (a.vocal - b.vocal) ** 2 + 0.5 * (a.brightness - b.brightness) ** 2 + dl * dl,
  );
}

/** The phrase lengths a song is counted in, longest first. */
export const PHRASE_LENGTHS = [16, 8, 4] as const;
/** Share of the arrangement boundaries that must sit on a phrase length before the song counts in it. */
export const PHRASE_BOUNDARY_SUPPORT = 0.6;
/** Phrase confidence when the boundaries sit on no phrase length (counted in 4s, alignment unknown). */
export const PHRASE_UNALIGNED_CONFIDENCE = 0.3;

/**
 * Phrase length per song (4, 8 or 16 bars): the spacing of the strong
 * arrangement boundaries decides (a song that changes every 8 bars counts in
 * 8s); with fewer than two strong boundaries, the lag at which bars resemble
 * each other most decides, longer preferred on a tie.
 */
export function detectPhraseLength(features: BarFeatures[], boundaries: number[] = []): { lengthBars: number; confidence: number } {
  const lags = [4, 8, 16];
  const weighted = boundaries
    .filter((bar) => bar > 0 && bar < features.length)
    .map((bar) => ({ bar, w: distance(features[bar - 1], features[bar]) }));
  const totalW = weighted.reduce((acc, x) => acc + x.w, 0);
  if (weighted.length >= 2 && totalW > 0) {
    // The largest phrase length that most of the arrangement boundaries sit
    // on (weighted by how much the music changes there): a boundary on bar 16
    // supports 16, 8 and 4; one on bar 12 supports only 4.
    for (const lag of PHRASE_LENGTHS) {
      const support = weighted.filter((x) => x.bar % lag === 0).reduce((acc, x) => acc + x.w, 0) / totalW;
      if (support >= PHRASE_BOUNDARY_SUPPORT) return { lengthBars: lag, confidence: Math.min(1, support) };
    }
    return { lengthBars: 4, confidence: PHRASE_UNALIGNED_CONFIDENCE };
  }
  const scores: Array<{ lag: number; score: number }> = [];
  for (const lag of lags) {
    if (features.length < lag * 2) continue;
    let sum = 0, n = 0;
    for (let i = 0; i + lag < features.length; i++) { sum += 1 - Math.min(1, distance(features[i], features[i + lag])); n++; }
    scores.push({ lag, score: n ? sum / n : 0 });
  }
  if (scores.length === 0) return { lengthBars: 8, confidence: 0.2 };
  let best = scores[0];
  for (const sc of scores) if (sc.score >= best.score - 0.02) best = sc; // longer wins ties
  const others = scores.filter((sc) => sc !== best).map((sc) => sc.score);
  const margin = others.length ? best.score - Math.max(...others) : 0.2;
  return { lengthBars: best.lag, confidence: Math.max(0.2, Math.min(1, 0.5 + margin * 5)) };
}

/** Boundaries where consecutive bars differ more than usual (plus silence edges). */
export function segmentBoundaries(features: BarFeatures[], minBars = 4): number[] {
  if (features.length === 0) return [];
  const nov: number[] = [0];
  for (let i = 1; i < features.length; i++) nov.push(distance(features[i - 1], features[i]));
  const m = nov.reduce((a, b) => a + b, 0) / nov.length;
  const sd = Math.sqrt(nov.reduce((a, b) => a + (b - m) ** 2, 0) / nov.length);
  // Statistics alone over-segment a steady groove (a bass note change is
  // novel when nothing else moves): a boundary must also be a real change.
  const threshold = Math.max(m + sd, 0.55);
  const crosses = (key: 'drums' | 'vocal' | 'bass', on: number, off: number) => (i: number) => {
    const a = features[i - 1][key], b = features[i][key];
    return (a < off && b >= on) || (a >= on && b < off);
  };
  const drumCross = crosses('drums', 0.35, 0.2);
  const vocalCross = crosses('vocal', 0.35, 0.2);
  const bassCross = crosses('bass', 0.35, 0.2);
  const bounds = [0];
  const firm = new Set<number>([0]);
  let last = 0;
  for (let i = 1; i < features.length; i++) {
    const silentEdge = (features[i].loudnessDb < SILENCE_DB) !== (features[i - 1].loudnessDb < SILENCE_DB);
    // An instrument entering or leaving is an arrangement change whatever the
    // novelty statistics say; two bars is the shortest section that keeps.
    const crossing = drumCross(i) || vocalCross(i) || bassCross(i);
    if (silentEdge || crossing) {
      // A hit at the very end of the previous bar leaks a little onset into it
      // and makes a weak novelty boundary one bar early: the crossing wins.
      if (i - last === 1 && !firm.has(last)) { bounds.pop(); last = bounds[bounds.length - 1]; }
      if (i - last >= 2 || silentEdge) { bounds.push(i); firm.add(i); last = i; }
    } else if (nov[i] > threshold && i - last >= minBars) { bounds.push(i); last = i; }
  }
  return bounds;
}

interface SegmentStats {
  startBar: number; endBar: number; bass: number; drums: number; harmonic: number; vocal: number;
  brightness: number; loudnessDb: number; intensity: number; slope: number;
}

function stats(features: BarFeatures[], s: number, e: number): SegmentStats {
  const slice = features.slice(s, e);
  const n = slice.length || 1;
  const avg = (k: keyof BarFeatures) => slice.reduce((a, f) => a + (f[k] as number), 0) / n;
  const first = slice[0]?.intensity ?? 0;
  const last = slice[slice.length - 1]?.intensity ?? 0;
  return {
    startBar: s, endBar: e, bass: avg('bass'), drums: avg('drums'), harmonic: avg('harmonic'),
    vocal: avg('vocal'), brightness: avg('brightness'), loudnessDb: avg('loudnessDb'),
    intensity: avg('intensity'), slope: slice.length > 1 ? (last - first) / slice.length : 0,
  };
}

function p90(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
}

/**
 * Probabilistic section labels. Each rule adds evidence for a kind; the top
 * kind is the label, the next two are the alternatives (plan: names can be
 * probabilistic, the planner reads musical function). Features are read
 * relative to the track's own 90th percentile, so a quiet master and a loud
 * one label the same way.
 */
export function labelSections(features: BarFeatures[], bounds: number[], trackVocal: number): DJSection[] {
  if (features.length === 0) return [];
  const segs: SegmentStats[] = [];
  for (let i = 0; i < bounds.length; i++) {
    const s = bounds[i];
    const e = i + 1 < bounds.length ? bounds[i + 1] : features.length;
    if (e > s) segs.push(stats(features, s, e));
  }
  const ref = {
    drums: Math.max(0.1, p90(features.map((f) => f.drums))),
    bass: Math.max(0.1, p90(features.map((f) => f.bass))),
    harmonic: Math.max(0.1, p90(features.map((f) => f.harmonic))),
    vocal: Math.max(0.1, p90(features.map((f) => f.vocal))),
    intensity: Math.max(0.1, p90(features.map((f) => f.intensity))),
  };
  const rel = (seg: SegmentStats) => ({
    drums: seg.drums / ref.drums, bass: seg.bass / ref.bass, harmonic: seg.harmonic / ref.harmonic,
    vocal: seg.vocal / ref.vocal, intensity: seg.intensity / ref.intensity,
  });
  const trackDrums = segs.reduce((a, x) => a + x.drums * (x.endBar - x.startBar), 0) / features.length;
  const hasVocals = trackVocal > 0.15 || ref.vocal > 0.35;

  return segs.map((seg, i) => {
    const prev = segs[i - 1];
    const next = segs[i + 1];
    const bars = seg.endBar - seg.startBar;
    const r = rel(seg);
    const rp = prev ? rel(prev) : null;
    const score: Partial<Record<SectionKind, number>> = {};
    const add = (k: SectionKind, v: number) => { if (v > 0) score[k] = (score[k] ?? 0) + v; };

    if (seg.loudnessDb < SILENCE_DB) add('silence', 2);
    if (i === 0 && (r.drums < 0.6 || r.intensity < 0.7)) add('intro', 1.2);
    if (i === 0 && r.intensity < 0.9) add('intro', 0.4);
    if (i === segs.length - 1 && (r.drums < 0.6 || r.intensity < 0.7 || seg.slope < -0.01)) add('outro', 1.2);
    if (i === segs.length - 1 && r.intensity < 0.9) add('outro', 0.4);
    if (i > 0 && i < segs.length - 1 && r.drums < 0.5 && r.harmonic > 0.3 && bars >= 4 && seg.slope < 0.02) add('breakdown', 1.1);
    if (seg.slope > 0.012 && next && next.intensity > seg.intensity + 0.1) add('build', 1.0 + (seg.slope > 0.03 ? 0.5 : 0));
    if (bars <= 4 && next && next.intensity > seg.intensity + 0.15 && rp && r.drums < rp.drums * 0.7) add('pre-drop', 1.0);
    if (prev && seg.intensity > prev.intensity + 0.15 && r.bass > 0.7 && r.drums > 0.6) add('drop', 1.0 + (r.intensity > 0.9 ? 0.3 : 0));
    if (r.drums > 0.7 && r.harmonic < 0.3 && r.bass < 0.5 && r.vocal < 0.4) add('drum-only', 1.0);
    if (r.bass > 0.7 && r.drums < 0.4 && r.harmonic < 0.35) add('bass-only', 1.0);
    if (hasVocals && r.vocal > 0.75) add('vocal-heavy', 1.0 + (seg.vocal > 0.4 ? 0.2 : 0));
    if (hasVocals && r.vocal > 0.6 && r.intensity > 0.85) add('chorus', 0.8);
    if (hasVocals && r.vocal > 0.5 && r.intensity <= 0.85) add('verse', 0.8);
    if (bars <= 1 && prev && seg.drums > prev.drums + 0.2) add('fill', 1.0);
    if (i > 0 && i < segs.length - 1 && bars >= 4 && r.intensity > 0.4 && r.intensity < 0.85) {
      const sim = segs.filter((o, j) => j !== i && Math.abs(o.intensity - seg.intensity) < 0.1 && Math.abs(o.harmonic - seg.harmonic) < 0.15).length;
      if (sim === 0) add('bridge', 0.6);
    }
    if (r.drums >= 0.5 && seg.loudnessDb >= SILENCE_DB) {
      if (hasVocals && r.vocal < 0.4) add('instrumental', 0.7);
      add('groove', 0.5 + (Math.abs(seg.slope) < 0.01 ? 0.2 : 0) + (seg.drums >= trackDrums ? 0.1 : 0));
    } else if (seg.loudnessDb >= SILENCE_DB) {
      add('groove', 0.2);
    }

    const ranked = (Object.entries(score) as Array<[SectionKind, number]>).sort((x, y) => y[1] - x[1]);
    const total = ranked.reduce((acc, [, v]) => acc + v, 0) || 1;
    const [kind, top] = ranked[0] ?? ['groove', 0.2];
    const startBar = seg.startBar;
    const endBar = seg.endBar;
    return {
      kind,
      start: features[startBar].start,
      end: features[endBar - 1].end,
      startBar,
      endBar,
      confidence: Math.min(1, top / total + 0.15),
      energy: seg.intensity,
      alternatives: ranked.slice(1, 3).map(([k, v]) => ({ kind: k, confidence: v / total })),
    };
  });
}

/**
 * Phrases of the detected length, aligned to the first full bar and the
 * section starts. `startBars` (a tracker module's phrase starts, read from
 * its order list) replaces that guess: each phrase runs to the next start.
 */
export function buildPhrases(features: BarFeatures[], sections: DJSection[], lengthBars: number, confidence: number, startBars?: number[]): DJPhrase[] {
  const phrases: DJPhrase[] = [];
  if (features.length === 0) return phrases;
  if (startBars) {
    const starts = startBars.filter((b) => b >= 0 && b < features.length);
    starts.forEach((b, index) => {
      const e = Math.min(features.length, starts[index + 1] ?? features.length);
      const sectionIndex = Math.max(0, sections.findIndex((s) => s.startBar <= b && b < s.endBar));
      phrases.push({ index, start: features[b].start, end: features[e - 1].end, startBar: b, lengthBars: e - b, confidence, sectionIndex });
    });
    return phrases;
  }
  // Phrase origin: the section boundary that most other boundaries agree with (mod length).
  const boundaries = sections.map((s) => s.startBar);
  let bestOrigin = 0;
  let bestAgree = -1;
  for (let o = 0; o < lengthBars; o++) {
    const agree = boundaries.filter((b) => (b - o) % lengthBars === 0).length;
    if (agree > bestAgree) { bestAgree = agree; bestOrigin = o; }
  }
  let index = 0;
  for (let b = bestOrigin; b < features.length; b += lengthBars) {
    const e = Math.min(features.length, b + lengthBars);
    const sectionIndex = Math.max(0, sections.findIndex((s) => s.startBar <= b && b < s.endBar));
    phrases.push({
      index: index++, start: features[b].start, end: features[e - 1].end, startBar: b,
      lengthBars: e - b, confidence, sectionIndex,
    });
  }
  return phrases;
}

/** Arrangement events: timeline crossings at bar resolution, with hysteresis. */
export function arrangementEvents(features: BarFeatures[], sections: DJSection[]): ArrangementEvent[] {
  const events: ArrangementEvent[] = [];
  const track = (key: 'drums' | 'bass' | 'vocal', inKind: ArrangementEvent['kind'], outKind: ArrangementEvent['kind'], on: number, off: number, conf: number) => {
    let active = false;
    for (const f of features) {
      const v = f[key];
      if (!active && v >= on) { active = true; events.push({ kind: inKind, time: f.start, bar: f.bar, confidence: conf }); }
      else if (active && v < off) { active = false; events.push({ kind: outKind, time: f.start, bar: f.bar, confidence: conf }); }
    }
  };
  track('drums', 'drums-in', 'drums-out', 0.35, 0.2, 0.8);
  track('bass', 'bass-in', 'bass-out', 0.35, 0.2, 0.8);
  track('vocal', 'vocal-in', 'vocal-out', 0.45, 0.25, 0.45);
  for (let i = 1; i < features.length; i++) {
    const d = features[i].intensity - features[i - 1].intensity;
    if (d > 0.2) events.push({ kind: 'energy-up', time: features[i].start, bar: features[i].bar, confidence: 0.7 });
    if (d < -0.2) events.push({ kind: 'energy-down', time: features[i].start, bar: features[i].bar, confidence: 0.7 });
  }
  for (const f of features) if (f.loudnessDb < SILENCE_DB) events.push({ kind: 'silence', time: f.start, bar: f.bar, confidence: 0.9 });
  for (const s of sections.slice(1)) events.push({ kind: 'section-change', time: s.start, bar: s.startBar, confidence: s.confidence });
  return events.sort((a, b) => a.time - b.time);
}

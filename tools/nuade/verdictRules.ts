/**
 * The pass rules of the nuade comparison (plan D8 + DN-1), as pure functions: the batch records measurements, these
 * decide. Nothing here reads a file or renders audio, so the rules are tested alone (nuadeVerdictRules.test.ts) and
 * the render test (nuadePlaysFormats.test.ts) applies the same functions to a live measurement.
 */
import type { FormatEngineChoice } from '../../src/types/formatEngine';

/** What one (format, song) render recorded. */
export interface SongMeasure {
  song: string;
  error?: string;
  peak: number;
  rms: number;
  correlation: number;
  lagMs: number;
  /** Seconds, -1 = plays on to the end of the render. */
  uadeEndAt: number;
  nuadeEndAt: number;
  /** Our own engine against UADE for dual rows (same song, same metric). */
  own?: number | null;
  /** Our engine REFUSES this song by design (its parser rejects the variant; the route sends it to nuade): not scored for ours. */
  ownRefused?: boolean;
}

export const THRESHOLDS = {
  peak: 0.05,
  rms: 0.02,
  meanCorrelation: 0.95,
  songCorrelation: 0.90,
  endToleranceSecs: 1.0,
  maxLagMs: 100,
  swapMs: 100,
  dualMargin: 0.01,
} as const;

/** (c) end agreement: UADE ends -> nuade ends within +-1.0 s; UADE runs on -> nuade runs on. */
export function endAgrees(uadeEndAt: number, nuadeEndAt: number): boolean {
  if (uadeEndAt > 0) return nuadeEndAt > 0 && Math.abs(nuadeEndAt - uadeEndAt) <= THRESHOLDS.endToleranceSecs;
  return nuadeEndAt <= 0;
}

/** The reasons one song fails the per-song part of the rule ((a), the per-song floor of (b), (c) and the lag bound). */
export function songFailures(m: SongMeasure): string[] {
  const why: string[] = [];
  const name = m.song.slice(m.song.lastIndexOf('/') + 1);
  if (m.error) return [`${name}: ${m.error}`];
  if (!(m.peak > THRESHOLDS.peak)) why.push(`${name}: peak ${m.peak.toFixed(3)} <= ${THRESHOLDS.peak}`);
  if (!(m.rms > THRESHOLDS.rms)) why.push(`${name}: RMS ${m.rms.toFixed(3)} <= ${THRESHOLDS.rms}`);
  if (!Number.isFinite(m.correlation)) why.push(`${name}: no correlation (less than 1 s of music to compare before a song end)`);
  else if (!(m.correlation >= THRESHOLDS.songCorrelation)) why.push(`${name}: correlation ${m.correlation.toFixed(3)} < ${THRESHOLDS.songCorrelation}`);
  if (Math.abs(m.lagMs) > THRESHOLDS.maxLagMs) why.push(`${name}: lag ${m.lagMs} ms > ${THRESHOLDS.maxLagMs}`);
  if (!endAgrees(m.uadeEndAt, m.nuadeEndAt)) {
    why.push(`${name}: ${m.uadeEndAt > 0 ? `UADE ends at ${m.uadeEndAt.toFixed(1)} s` : 'UADE plays on'}, nuade ${m.nuadeEndAt > 0 ? `ends at ${m.nuadeEndAt.toFixed(1)} s` : 'plays on'}`);
  }
  return why;
}

export const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

export interface ReplaceInput {
  songs: SongMeasure[];
}

export interface ReplaceVerdict {
  pass: boolean;
  meanCorrelation: number | null;
  endAgrees: boolean | null;
  /** The failing measurements, joined; empty on a pass. */
  heldBecause: string;
}

/** D8 replace rule over one format's corpus songs. Gate (e), the default-load route, is proven by the render test. */
export function replaceVerdict(i: ReplaceInput): ReplaceVerdict {
  if (i.songs.length === 0) return { pass: false, meanCorrelation: null, endAgrees: null, heldBecause: 'no corpus song measured' };
  const why = i.songs.flatMap(songFailures);
  const good = i.songs.filter((s) => !s.error && Number.isFinite(s.correlation));
  const m = good.length ? mean(good.map((s) => s.correlation)) : null;
  if (m === null || m < THRESHOLDS.meanCorrelation) why.push(`mean correlation ${m === null ? 'n/a' : m.toFixed(3)} < ${THRESHOLDS.meanCorrelation}`);
  const ends = i.songs.every((s) => endAgrees(s.uadeEndAt, s.nuadeEndAt));
  return { pass: why.length === 0, meanCorrelation: m, endAgrees: ends, heldBecause: why.join('; ') };
}

/**
 * DN-1 (owner decision b): nuade is the default of a dual row only if its mean correlation beats ours by >= 0.01 AND no
 * song is worse than ours by more than 0.01; otherwise ours stays. Needs `own` on every song.
 * Added floor (not in the decision, on the safe side): nuade must itself pass the replace rule's per-song checks (audible,
 * correlation, lag, song end) with a mean of 0.95. Two engines that both sit far from UADE (instereo2: nuade 0.31, ours
 * 0.03) say nothing about which one is right, and an end that differs from UADE's (deltamusic2, futurecomposer) changes
 * what a song-end does. The owner can drop the floor by deleting the two clauses.
 */
export function dualDefault(songs: SongMeasure[]): { defaultEngine: FormatEngineChoice; nuadeMean: number; ownMean: number } | null {
  const both = songs.filter((s) => !s.error && s.own != null && Number.isFinite(s.correlation));
  // A song our engine refuses by design is not one it can lose or win; nuade still has to pass it (the floor below).
  if (both.length === 0 || both.length !== songs.filter((s) => !s.ownRefused).length) return null;
  const nuadeMean = mean(both.map((s) => s.correlation)), ownMean = mean(both.map((s) => s.own as number));
  const valid = nuadeMean >= THRESHOLDS.meanCorrelation && songs.every((s) => songFailures(s).length === 0);
  const beats = nuadeMean - ownMean >= THRESHOLDS.dualMargin - 1e-12 && valid;
  const noneWorse = both.every((s) => (s.own as number) - s.correlation <= THRESHOLDS.dualMargin + 1e-12);
  // 'native' here means ours stays: the caller maps it to the row's legacy engine.
  // Owner decision 2026-10-13: playback quality decides; editability is ported to nuade rows later (plan NUADE-EDIT-PATH).
  const wins = beats && noneWorse;
  return { defaultEngine: wins ? 'nuade' : 'native', nuadeMean, ownMean };
}

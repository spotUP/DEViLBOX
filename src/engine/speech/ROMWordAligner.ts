/**
 * ROM Word Aligner for TMS5220 phoneme mining.
 *
 * Forced alignment of a known phoneme sequence (from the Reciter G2P) onto a ROM
 * recording's LPC frame sequence. This replaces the reverted proportional splitter
 * (d3beb83f9): segmentation here is driven by frame-domain evidence — voicing,
 * energy and K-coefficient distance — with the phoneme sequence as a constraint,
 * not a ruler. Wrong assignments are dropped via a cost ceiling instead of mined.
 *
 * Design invariants:
 * - Silent frames (energy=0) may only be consumed by stop/affricate segments
 *   (closure silence is part of plosive articulation) or by pause tokens.
 * - Voicing expectation comes from the hand-authored static table's `unvoiced`
 *   flag — the one linguistically unambiguous field it carries.
 * - Pause tokens consume zero or more silent frames (phrases), nothing else.
 *
 * This module also hosts the shared frame-preparation helpers
 * (resolveRepeatFrames / trimSilence) and the phoneme-class table, so that
 * ROMPhonemeExtractor can depend on this module without a circular import.
 */

import type { LPCFrame } from './VSMROMParser';
import type { PhonemeToken } from './Reciter';
import { samToTMS5220 } from './tms5220PhonemeMap';

// ============================================================================
// Phoneme Classification (moved from ROMPhonemeExtractor — re-exported there)
// ============================================================================

export type PhonemeClass = 'vowel' | 'diphthong' | 'stop' | 'fricative' | 'affricate' | 'nasal' | 'liquid' | 'glide' | 'pause' | 'other';

export const PHONEME_CLASS: Record<string, PhonemeClass> = {
  // Vowels
  'IY': 'vowel', 'IH': 'vowel', 'EH': 'vowel', 'AE': 'vowel',
  'AA': 'vowel', 'AH': 'vowel', 'AO': 'vowel', 'UH': 'vowel',
  'AX': 'vowel', 'IX': 'vowel', 'ER': 'vowel', 'UX': 'vowel', 'OH': 'vowel',
  // Diphthongs
  'EY': 'diphthong', 'AY': 'diphthong', 'OY': 'diphthong',
  'AW': 'diphthong', 'OW': 'diphthong', 'UW': 'diphthong',
  // Liquids
  'R*': 'liquid', 'RX': 'liquid', 'L*': 'liquid', 'LX': 'liquid',
  // Glides
  'W*': 'glide', 'WX': 'glide', 'WH': 'glide', 'Y*': 'glide', 'YX': 'glide',
  // Nasals
  'M*': 'nasal', 'N*': 'nasal', 'NX': 'nasal',
  // Fricatives (unvoiced)
  'S*': 'fricative', 'SH': 'fricative', 'F*': 'fricative', 'TH': 'fricative',
  '/H': 'fricative', '/X': 'fricative',
  // Fricatives (voiced)
  'Z*': 'fricative', 'ZH': 'fricative', 'V*': 'fricative', 'DH': 'fricative',
  // Affricates
  'CH': 'affricate', 'J*': 'affricate',
  // Stops (unvoiced)
  'P*': 'stop', 'T*': 'stop', 'K*': 'stop', 'KX': 'stop',
  // Stops (voiced)
  'B*': 'stop', 'D*': 'stop', 'G*': 'stop', 'GX': 'stop',
  // Flap
  'DX': 'stop',
  // Glottal stop
  'Q*': 'stop',
  // Pause
  ' ': 'pause',
};

export function getPhonemeClass(code: string): PhonemeClass {
  return PHONEME_CLASS[code] ?? 'other';
}

// ============================================================================
// Frame Preparation (moved from ROMPhonemeExtractor — re-exported there)
// ============================================================================

/**
 * Resolve repeat frames by carrying forward K coefficients from the previous
 * non-repeat frame. This makes every frame self-contained for extraction.
 */
export function resolveRepeatFrames(frames: LPCFrame[]): LPCFrame[] {
  const resolved: LPCFrame[] = [];
  let lastK: number[] = [8, 8, 8, 8, 8, 8, 8, 4, 4, 4]; // Default middle values
  let lastUnvoiced = false;

  for (const frame of frames) {
    if (frame.energy === 0) {
      // Silent frame — pass through as-is
      resolved.push({ ...frame });
      continue;
    }

    if (frame.repeat) {
      // Repeat frame — carry forward K values from last non-repeat frame
      resolved.push({
        energy: frame.energy,
        repeat: false,
        pitch: frame.pitch,
        k: [...lastK],
        unvoiced: lastUnvoiced,
      });
    } else {
      // Full frame — update last K values
      lastK = [...frame.k];
      lastUnvoiced = frame.unvoiced;
      resolved.push({ ...frame, k: [...frame.k] });
    }
  }

  return resolved;
}

/**
 * Trim leading/trailing silent frames (energy=0) from a frame array.
 */
export function trimSilence(frames: LPCFrame[]): LPCFrame[] {
  let start = 0;
  while (start < frames.length && frames[start].energy === 0) start++;
  let end = frames.length - 1;
  while (end >= start && frames[end].energy === 0) end--;
  return frames.slice(start, end + 1);
}

// ============================================================================
// Distance Metric
// ============================================================================

/** K index clamping ranges: K1-K2 (0-31), K3-K7 (0-15), K8-K10 (0-7) */
export const K_MAX = [31, 31, 15, 15, 15, 15, 15, 7, 7, 7];

/**
 * Per-coefficient weights. K1/K2 carry F1/F2 — the perceptually dominant
 * formants — so they count double; K8-K10 are fine spectral detail.
 */
const K_WEIGHT = [2, 2, 1, 1, 1, 1, 1, 0.5, 0.5, 0.5];
const K_WEIGHT_SUM = K_WEIGHT.reduce((a, b) => a + b, 0);

/**
 * Normalized weighted L1 distance between two K-index vectors, ~0 (identical)
 * to ~1 (maximally different). Ordinal metric: used for comparisons and
 * clustering, never interpreted as an absolute perceptual scale.
 */
export function kIndexDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += K_WEIGHT[i] * Math.abs((a[i] ?? 0) - (b[i] ?? 0)) / K_MAX[i];
  }
  return sum / K_WEIGHT_SUM;
}

/** Minimal structural view both LPCFrame and TMS5220Frame satisfy. */
export interface FrameLike {
  k: number[];
  energy: number;
  unvoiced: boolean;
}

function paddedK(k: number[]): number[] {
  if (k.length >= 10) return k;
  // Ten defaults for ten slots — this array was 9 long, so every default
  // landed one K-slot early for short vectors.
  return [...k, ...[8, 8, 8, 8, 8, 8, 8, 4, 4, 4].slice(k.length)];
}

function frameLikeDistance(a: FrameLike, b: FrameLike): number {
  return kIndexDistance(paddedK(a.k), paddedK(b.k))
    + 0.5 * Math.abs(a.energy - b.energy) / 14
    + (a.unvoiced !== b.unvoiced ? 0.5 : 0);
}

/**
 * DTW distance between two frame sequences, normalized by path length.
 * Used to score a library reconstruction against the recording it imitates —
 * the reconstruction-vs-static-baseline discriminator.
 */
export function dtwFrameDistance(a: FrameLike[], b: FrameLike[]): number {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return Infinity;

  const prev = new Array<number>(m + 1).fill(Infinity);
  const curr = new Array<number>(m + 1).fill(Infinity);
  prev[0] = 0;

  for (let i = 1; i <= n; i++) {
    curr[0] = Infinity;
    for (let j = 1; j <= m; j++) {
      const cost = frameLikeDistance(a[i - 1], b[j - 1]);
      curr[j] = cost + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    for (let j = 0; j <= m; j++) prev[j] = curr[j];
  }
  return prev[m] / (n + m);
}

// ============================================================================
// Alignment Cost Model
// ============================================================================

/** Duration priors per phoneme class, in 25 ms frames. */
interface DurationPrior { min: number; max: number; expected: number; tolerance: number }

const DURATION_PRIOR: Record<PhonemeClass, DurationPrior> = {
  vowel:     { min: 2, max: 20, expected: 7, tolerance: 4 },
  diphthong: { min: 3, max: 28, expected: 9, tolerance: 5 },
  stop:      { min: 1, max: 10, expected: 4, tolerance: 2 },
  fricative: { min: 2, max: 18, expected: 6, tolerance: 3 },
  affricate: { min: 2, max: 14, expected: 5, tolerance: 2 },
  nasal:     { min: 2, max: 16, expected: 6, tolerance: 3 },
  liquid:    { min: 2, max: 16, expected: 5, tolerance: 3 },
  glide:     { min: 1, max: 12, expected: 4, tolerance: 2 },
  pause:     { min: 0, max: 20, expected: 2, tolerance: 2 },
  other:     { min: 1, max: 14, expected: 4, tolerance: 3 },
};

const W_VOICING = 1.6;
const W_COMPACT = 1.5;
const W_DURATION = 0.15;
const W_BOUNDARY = 0.25;

/**
 * Stop/affricate voicing expectations are soft: a voiced stop's burst is noise
 * (unvoiced), so only a fraction of the segment is expected to follow the flag.
 */
const STOP_VOICING_WEIGHT = 0.35;

/** A word whose best alignment costs more than this per phoneme is dropped. */
export const ALIGN_COST_CEILING = 0.45;

function expectedVoiced(code: string): boolean {
  const frame = samToTMS5220(code);
  return frame ? !frame.unvoiced : true;
}

/** Mean K vector over the given frames (silent frames excluded by caller). */
function centroidOf(frames: LPCFrame[]): number[] {
  const acc = new Array<number>(10).fill(0);
  for (const f of frames) {
    for (let i = 0; i < 10; i++) acc[i] += f.k[i] ?? 0;
  }
  const n = Math.max(1, frames.length);
  return acc.map(v => v / n);
}

/**
 * Boundary evidence at a segment start: a voicing switch, a marked energy drop
 * or a large spectral jump between the previous frame and this one.
 */
function boundaryEvidence(prev: LPCFrame | undefined, first: LPCFrame): number {
  if (!prev) return 0;
  if (prev.energy === 0 || first.energy === 0) return 1; // silence edge is a strong cue
  if (prev.unvoiced !== first.unvoiced) return 1;
  if (prev.energy - first.energy >= 4) return 0.7;
  if (kIndexDistance(prev.k, first.k) > 0.25) return 0.6;
  return 0;
}

/**
 * Cost of assigning frames[start..end) to one phoneme. Infinity = illegal.
 */
export function segmentCost(code: string, frames: LPCFrame[], start: number, end: number): number {
  const cls = getPhonemeClass(code);
  const prior = DURATION_PRIOR[cls];
  const n = end - start;

  if (n === 0) {
    // Only pauses may consume zero frames.
    return cls === 'pause' ? 0.02 : Infinity;
  }
  if (n < prior.min || n > prior.max) return Infinity;

  const seg = frames.slice(start, end);

  if (cls === 'pause') {
    // Pauses own silence and nothing else.
    return seg.every(f => f.energy === 0) ? 0.02 * n : Infinity;
  }

  const silent = seg.filter(f => f.energy === 0);
  if (silent.length > 0 && cls !== 'stop' && cls !== 'affricate') return Infinity;

  const sounding = seg.filter(f => f.energy > 0);
  if (sounding.length === 0) {
    // A stop that is pure closure silence is legitimate.
    return cls === 'stop' ? 0.05 : Infinity;
  }

  // Voicing agreement
  const voiced = expectedVoiced(code);
  let mismatch = 0;
  for (const f of sounding) {
    if (f.unvoiced === voiced) mismatch++;
  }
  let voiceCost = mismatch / sounding.length;
  if (cls === 'stop' || cls === 'affricate') voiceCost *= STOP_VOICING_WEIGHT;

  // Compactness around the segment centroid
  const centroid = centroidOf(sounding);
  let compact = 0;
  for (const f of sounding) compact += kIndexDistance(f.k, centroid);
  compact /= sounding.length;

  // Duration prior
  const durCost = ((n - prior.expected) / prior.tolerance) ** 2;

  const bonus = W_BOUNDARY * boundaryEvidence(start > 0 ? frames[start - 1] : undefined, seg[0]);

  return W_VOICING * voiceCost + W_COMPACT * compact + W_DURATION * durCost - bonus;
}

// ============================================================================
// Forced Alignment (DP)
// ============================================================================

export interface AlignedSegment {
  code: string;
  /** Inclusive start frame index (into the prepared frame array). */
  start: number;
  /** Exclusive end frame index. */
  end: number;
}

export interface AlignmentResult {
  segments: AlignedSegment[];
  totalCost: number;
  /** totalCost / number of phonemes — the ceiling metric. */
  perPhonemeCost: number;
  /** The prepared (repeat-resolved, silence-trimmed) frames that were aligned. */
  frames: LPCFrame[];
}

/**
 * Align a phoneme token sequence onto a recording's frames by dynamic
 * programming: every frame is consumed by exactly one segment, segments follow
 * the token order, and the total segment cost is minimized.
 *
 * Returns null when the best alignment exceeds the cost ceiling — the G2P
 * sequence does not match what the recording actually says, so mining it would
 * put real frames in wrong phoneme slots (the d3beb83f9 failure mode).
 */
export function alignPhonemesToFrames(
  tokens: PhonemeToken[],
  rawFrames: LPCFrame[],
): AlignmentResult | null {
  const frames = trimSilence(resolveRepeatFrames(rawFrames));
  // Zero-stress tokens are fine; only codes matter here.
  const seq = tokens.map(t => t.code).filter(c => c.length > 0);
  const M = seq.length;
  const N = frames.length;
  if (M === 0 || N === 0) return null;

  // D[i][j] = min cost aligning first i phonemes to first j frames
  const INF = Infinity;
  const D: number[][] = Array.from({ length: M + 1 }, () => new Array<number>(N + 1).fill(INF));
  const back: number[][] = Array.from({ length: M + 1 }, () => new Array<number>(N + 1).fill(-1));
  D[0][0] = 0;

  for (let i = 1; i <= M; i++) {
    const code = seq[i - 1];
    const prior = DURATION_PRIOR[getPhonemeClass(code)];
    for (let j = 0; j <= N; j++) {
      // Segment covering frames[k..j)
      const kMin = Math.max(0, j - prior.max);
      const kMax = j - prior.min;
      for (let k = kMin; k <= kMax; k++) {
        const prev = D[i - 1][k];
        if (prev === INF) continue;
        const c = segmentCost(code, frames, k, j);
        if (c === INF) continue;
        const total = prev + c;
        if (total < D[i][j]) {
          D[i][j] = total;
          back[i][j] = k;
        }
      }
    }
  }

  const totalCost = D[M][N];
  if (totalCost === INF) return null;

  const perPhonemeCost = totalCost / M;
  if (perPhonemeCost > ALIGN_COST_CEILING) return null;

  // Walk back
  const segments: AlignedSegment[] = [];
  let j = N;
  for (let i = M; i >= 1; i--) {
    const k = back[i][j];
    segments.unshift({ code: seq[i - 1], start: k, end: j });
    j = k;
  }

  return { segments, totalCost, perPhonemeCost, frames };
}

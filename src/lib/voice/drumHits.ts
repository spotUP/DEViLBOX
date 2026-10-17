/**
 * drumHits.ts - beatbox audio to classified drum hits. Pure functions.
 *
 *   samples -> detectOnsets (spectral flux, adaptive threshold)
 *           -> hitFeatures (60 ms window: band energy ratios, decay, zero-crossing rate, bursts)
 *           -> a HitClassifier (kick / snare / hat / clap): the k-NN over the user's
 *              samples and the AVP prior in drumModel.ts
 *
 * The FFT is the one in lib/audio/BeatSliceAnalyzer.
 */
import { applyHannWindow, fft } from '@/lib/audio/BeatSliceAnalyzer';
import { PITCH_SAMPLE_RATE } from './pitchNotes';

export const DRUM_CLASSES = ['kick', 'snare', 'hat', 'clap'] as const;
export type DrumClass = (typeof DRUM_CLASSES)[number];

export const DRUM_CLASS_LABELS: Record<DrumClass, string> = {
  kick: 'Kick',
  snare: 'Snare',
  hat: 'Hi-hat',
  clap: 'Clap',
};

export interface HitFeatures {
  /** Energy ratios of the three bands (sum to 1) */
  low: number;
  mid: number;
  high: number;
  /** RMS at 40-60 ms over RMS at 0-15 ms, 0..1 */
  decay: number;
  /** Zero crossings per sample over the window */
  zcr: number;
  /** Separate amplitude bursts in the first 50 ms */
  bursts: number;
  /** Energy ratios of BAND_COUNT log-spaced bands from 60 Hz to 10 kHz (sum to 1) */
  bands: number[];
  /** Spectral centroid over the Nyquist frequency, 0..1 */
  centroid: number;
  /** Spectral flatness (geometric over arithmetic mean of the power), 0..1 */
  flatness: number;
  /** Time from the onset to the loudest 2 ms block, over the 60 ms window, 0..1 */
  attack: number;
}

export interface DrumHit {
  timeSeconds: number;
  drum: DrumClass;
  /** 0..1 relative to the loudest hit of the take */
  strength: number;
  features: HitFeatures;
}

/** Classifies a feature set. Rules by default; drumModel.ts supplies the trained one. */
export type HitClassifier = (f: HitFeatures) => DrumClass;

/**
 * A hit must be louder than the take's own noise floor by this factor. The gate
 * is relative because a laptop mic at the browser's default gain records mouth
 * drums at -30 to -40 dBFS; an absolute floor dropped every hit but the loudest.
 */
const NOISE_FLOOR_RATIO = 2.5;
/** Below this RMS nothing is a hit, whatever the noise floor (digital silence). */
const ABSOLUTE_FLOOR_RMS = 0.0005;
/** RMS block for the noise floor and the attack-level checks: 256 samples = 11.6 ms at 22050 Hz. */
const LEVEL_BLOCK = 256;
const FFT_SIZE = 1024;
const WINDOW_SECONDS = 0.06;
/** Keeps the flatness log finite on all-zero bins. */
const FLATNESS_EPS = 1e-12;
const LOW_BAND: [number, number] = [40, 250];
const MID_BAND: [number, number] = [250, 4000];
const HIGH_BAND: [number, number] = [4000, 11025];
export const BAND_COUNT = 8;
/** Edges of the log-spaced feature bands: 60 Hz to 10 kHz. */
const BAND_EDGES = Array.from({ length: BAND_COUNT + 1 }, (_, i) => 60 * (10000 / 60) ** (i / BAND_COUNT));

export interface OnsetSettings {
  frame: number;
  hop: number;
  /**
   * Flux threshold = median flux * this. Only the take's own background sets
   * the bar: scaling it by the loudest flux peak (an earlier floor term) let
   * one crisp hit hide every slow-attack kick a few dB quieter (owner report
   * 2026-10-17: a real take's threshold rose to 1.01 while the kicks' flux
   * was 0.6 to 0.95, so none of them came through).
   */
  sensitivity: number;
  /** A hit this many dB under the take's loudest hit is background, not a hit. */
  maxDropDb: number;
  minGapSeconds: number;
}

export const DEFAULT_ONSET_SETTINGS: OnsetSettings = {
  frame: 512,
  hop: 128,
  sensitivity: 3,
  maxDropDb: 30,
  minGapSeconds: 0.07,
};

function magnitudes(frame: Float32Array, size: number): Float32Array {
  const re = new Float32Array(size);
  const im = new Float32Array(size);
  re.set(applyHannWindow(frame.subarray(0, Math.min(size, frame.length))));
  fft(re, im);
  const mag = new Float32Array(size / 2);
  for (let i = 0; i < mag.length; i++) mag[i] = Math.hypot(re[i], im[i]);
  return mag;
}

/** Onset times in seconds: spectral flux peaks above an adaptive threshold. */
export function detectOnsets(
  samples: Float32Array,
  sampleRate = PITCH_SAMPLE_RATE,
  s: OnsetSettings = DEFAULT_ONSET_SETTINGS,
): number[] {
  const frames = Math.floor((samples.length - s.frame) / s.hop);
  if (frames < 3) return [];
  // Onset function: per band (low / mid / high) the mean positive change of the
  // log magnitude, then the strongest band. Bands keep a narrow kick (a few bins)
  // from being drowned by broadband noise hits.
  const binHz = sampleRate / s.frame;
  const edges = [0, Math.ceil(LOW_BAND[1] / binHz), Math.ceil(MID_BAND[1] / binHz), s.frame / 2];
  const flux = new Float32Array(frames);
  let prev = magnitudes(samples.subarray(0, s.frame), s.frame);
  for (let f = 1; f < frames; f++) {
    const cur = magnitudes(samples.subarray(f * s.hop, f * s.hop + s.frame), s.frame);
    let best = 0;
    for (let b = 0; b < 3; b++) {
      let sum = 0;
      for (let k = edges[b]; k < edges[b + 1]; k++) {
        const d = Math.log1p(10 * cur[k]) - Math.log1p(10 * prev[k]);
        if (d > 0) sum += d;
      }
      best = Math.max(best, sum / (edges[b + 1] - edges[b]));
    }
    flux[f] = best;
    prev = cur;
  }
  const sorted = [...flux].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const threshold = median * s.sensitivity;
  const silenceGate = Math.max(ABSOLUTE_FLOOR_RMS, NOISE_FLOOR_RATIO * noiseFloor(samples));

  const candidates: { at: number; level: number }[] = [];
  let lastSample = -Infinity;
  const minGap = s.minGapSeconds * sampleRate;
  for (let f = 1; f < frames - 1; f++) {
    // Strictly above the bar: in digital silence the median is 0 and a flat
    // zero run would otherwise count as a local maximum.
    if (flux[f] <= threshold || flux[f] < flux[f - 1] || flux[f] < flux[f + 1]) continue;
    // Locate the attack: first sample near the frame that reaches 25% of the local peak
    const from = Math.max(0, f * s.hop - s.frame);
    const to = Math.min(samples.length, f * s.hop + s.frame * 2);
    let peak = 0;
    for (let i = from; i < to; i++) peak = Math.max(peak, Math.abs(samples[i]));
    let at = f * s.hop;
    for (let i = from; i < to; i++) {
      if (Math.abs(samples[i]) >= peak * 0.25) { at = i; break; }
    }
    if (at - lastSample < minGap) continue;
    // Level of the hit: the loudest short block inside the attack window. A mouth
    // attack takes 20-60 ms to reach its level, so one block right at the 25%
    // point under-reads it by 10 dB or more.
    const level = peakBlockRms(samples, at, to);
    if (level < silenceGate) continue;
    // A real attack is louder than what came just before it (not a decaying tail)
    if (level < 1.5 * rms(samples, at - 2 * LEVEL_BLOCK, at)) continue;
    lastSample = at;
    candidates.push({ at, level });
  }
  // Relative gate: with the flux bar set by the background alone, a breath or
  // a chair creak 30 dB under the take's hits would pass it; the hits' own
  // level is the reference that keeps them out.
  const loudest = Math.max(0, ...candidates.map((c) => c.level));
  const relativeGate = loudest * 10 ** (-s.maxDropDb / 20);
  return candidates.filter((c) => c.level >= relativeGate).map((c) => c.at / sampleRate);
}

/** Loudest LEVEL_BLOCK-sized RMS block that starts inside [from, to). */
function peakBlockRms(x: Float32Array, from: number, to: number): number {
  let peak = 0;
  for (let i = Math.max(0, from); i < Math.min(x.length, to); i += LEVEL_BLOCK / 4) {
    peak = Math.max(peak, rms(x, i, i + LEVEL_BLOCK));
  }
  return peak;
}

/** The take's own noise floor: the 10th percentile of block RMS over the whole take. */
function noiseFloor(x: Float32Array): number {
  const blocks: number[] = [];
  for (let i = 0; i + LEVEL_BLOCK <= x.length; i += LEVEL_BLOCK) blocks.push(rms(x, i, i + LEVEL_BLOCK));
  if (blocks.length === 0) return 0;
  blocks.sort((a, b) => a - b);
  return blocks[Math.floor(blocks.length * 0.1)];
}

function rms(x: Float32Array, from: number, to: number): number {
  const a = Math.max(0, from);
  const b = Math.min(x.length, to);
  if (b <= a) return 0;
  let sum = 0;
  for (let i = a; i < b; i++) sum += x[i] * x[i];
  return Math.sqrt(sum / (b - a));
}

function bandEnergy(power: Float32Array, band: [number, number], sampleRate: number): number {
  const hz = sampleRate / FFT_SIZE;
  let e = 0;
  for (let k = Math.max(1, Math.ceil(band[0] / hz)); k < power.length && k * hz < band[1]; k++) e += power[k];
  return e;
}

/** Features of the 60 ms starting at `onsetSample`. */
export function hitFeatures(samples: Float32Array, onsetSample: number, sampleRate = PITCH_SAMPLE_RATE): HitFeatures {
  const len = Math.round(WINDOW_SECONDS * sampleRate);
  const w = samples.subarray(onsetSample, Math.min(samples.length, onsetSample + len));
  const mag = magnitudes(w, FFT_SIZE);
  const power = mag.map((m) => m * m);
  const low = bandEnergy(power, LOW_BAND, sampleRate);
  const mid = bandEnergy(power, MID_BAND, sampleRate);
  const high = bandEnergy(power, HIGH_BAND, sampleRate);
  const total = low + mid + high || 1;

  const ms = sampleRate / 1000;
  const early = rms(w, 0, 15 * ms);
  const late = rms(w, 40 * ms, 60 * ms);
  const decay = early > 0 ? Math.min(1, late / early) : 0;

  let crossings = 0;
  for (let i = 1; i < w.length; i++) if (w[i - 1] < 0 !== w[i] < 0) crossings++;

  // Bursts: 2 ms RMS envelope over 50 ms; a burst is a peak >= 40% of the max
  // that is separated from the previous burst by a dip below 60% of the smaller.
  const step = Math.round(2 * ms);
  const env: number[] = [];
  for (let i = 0; i + step <= Math.min(w.length, 50 * ms); i += step) env.push(rms(w, i, i + step));
  const envMax = Math.max(0, ...env);
  let bursts = 0;
  let lastPeak = 0;
  let dip = Infinity;
  for (let i = 1; i < env.length - 1; i++) {
    dip = Math.min(dip, env[i]);
    if (env[i] >= envMax * 0.4 && env[i] >= env[i - 1] && env[i] > env[i + 1]) {
      if (bursts === 0 || dip < 0.6 * Math.min(lastPeak, env[i])) {
        bursts++;
        lastPeak = env[i];
        dip = Infinity;
      } else if (env[i] > lastPeak) {
        lastPeak = env[i];
      }
    }
  }

  const bandEnergies = Array.from({ length: BAND_COUNT }, (_, b) =>
    bandEnergy(power, [BAND_EDGES[b], BAND_EDGES[b + 1]], sampleRate),
  );
  const bandTotal = bandEnergies.reduce((a, e) => a + e, 0) || 1;

  // Centroid and flatness over every bin above DC
  const binHz = sampleRate / FFT_SIZE;
  let powerSum = 0;
  let weighted = 0;
  let logSum = 0;
  for (let k = 1; k < power.length; k++) {
    powerSum += power[k];
    weighted += k * binHz * power[k];
    logSum += Math.log(power[k] + FLATNESS_EPS);
  }
  const bins = power.length - 1;
  const centroid = powerSum > 0 ? weighted / powerSum / (sampleRate / 2) : 0;
  const flatness = powerSum > 0 ? Math.min(1, Math.exp(logSum / bins) / (powerSum / bins + FLATNESS_EPS)) : 0;

  // Attack: where the 2 ms envelope peaks inside the whole window
  let attackBlock = 0;
  let attackPeak = -1;
  for (let i = 0; i + step <= w.length; i += step) {
    const r = rms(w, i, i + step);
    if (r > attackPeak) {
      attackPeak = r;
      attackBlock = i;
    }
  }

  return {
    low: low / total,
    mid: mid / total,
    high: high / total,
    decay,
    zcr: w.length > 1 ? crossings / w.length : 0,
    bursts: Math.max(1, bursts),
    bands: bandEnergies.map((e) => e / bandTotal),
    centroid,
    flatness,
    attack: len > 0 ? attackBlock / len : 0,
  };
}

/** Feature vector for the classifier, fixed order: FEATURE_COUNT values. */
export function featureVector(f: HitFeatures): number[] {
  return [f.low, f.mid, f.high, f.decay, f.zcr, Math.min(4, f.bursts) / 4, ...f.bands, f.centroid, f.flatness, f.attack];
}
export const FEATURE_COUNT = 6 + BAND_COUNT + 3;

/** Whole pipeline: audio to classified hits. */
export function detectHits(
  samples: Float32Array,
  classify: HitClassifier,
  sampleRate = PITCH_SAMPLE_RATE,
): DrumHit[] {
  const onsets = detectOnsets(samples, sampleRate);
  const raw = onsets.map((t) => {
    const at = Math.round(t * sampleRate);
    const features = hitFeatures(samples, at, sampleRate);
    const peak = (() => {
      let p = 0;
      for (let i = at; i < Math.min(samples.length, at + 0.06 * sampleRate); i++) p = Math.max(p, Math.abs(samples[i]));
      return p;
    })();
    return { t, features, peak };
  });
  const loudest = Math.max(1e-9, ...raw.map((r) => r.peak));
  return raw.map((r) => ({
    timeSeconds: r.t,
    drum: classify(r.features),
    strength: Math.min(1, r.peak / loudest),
    features: r.features,
  }));
}

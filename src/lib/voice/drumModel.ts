/**
 * Per-user drum classifier (VNR-21): k-nearest-neighbours on z-scored hit
 * features. Per class, the user's own labelled beatbox hits replace the
 * built-in AVP prior (avpPrior.json, see data/AVP_NOTICE.md); a class the
 * user has not trained falls back to the prior, so the classifier always
 * runs. Clap has no prior: it is only ever heard after the user trains it.
 * Pure train/evaluate functions plus versioned localStorage (every access in
 * try/catch). The classifier is rebuilt from the stored samples, so no model
 * state is stored next to them; the onset settings fitted by calibrateOnsets
 * are stored beside them.
 */
import avpPrior from './data/avpPrior.json';
import {
  DEFAULT_ONSET_SETTINGS,
  DRUM_CLASSES,
  detectHits,
  featureVector,
  type DrumClass,
  type HitClassifier,
  type HitFeatures,
  type OnsetSettings,
} from './drumHits';

export interface TrainingSample {
  drum: DrumClass;
  features: HitFeatures;
}

/** One prior hit: its class and its `featureVector`. */
export interface PriorSample {
  drum: DrumClass;
  vector: readonly number[];
}

export const AVP_PRIOR: readonly PriorSample[] = (avpPrior as { samples: PriorSample[] }).samples;

export const KNN_K = 3;
/** Hits the setup wizard asks for in each drum take (its prompts say "eight times"). */
export const HITS_PER_TRAINING_TAKE = 8;
/** A class needs this many hits before one of them is held out to report accuracy. */
export const MIN_SAMPLES_PER_CLASS = 3;
/** Every HOLD_OUT_EVERY-th sample of a class (0-based index % n === n-1) is held out. */
const HOLD_OUT_EVERY = 3;

function zscore(v: readonly number[], mean: readonly number[], std: readonly number[]): number[] {
  return v.map((x, i) => (x - mean[i]) / std[i]);
}

function columnStats(vecs: readonly (readonly number[])[]): { mean: number[]; std: number[] } {
  const dims = vecs[0]?.length ?? 0;
  const mean = new Array<number>(dims).fill(0);
  const std = new Array<number>(dims).fill(1);
  for (let d = 0; d < dims; d++) {
    const m = vecs.reduce((a, v) => a + v[d], 0) / vecs.length;
    const variance = vecs.reduce((a, v) => a + (v[d] - m) ** 2, 0) / vecs.length;
    mean[d] = m;
    std[d] = Math.sqrt(variance) || 1;
  }
  return { mean, std };
}

/**
 * k-NN over the user's samples plus the prior of every class the user did not
 * train. The z-score comes from the union of user and prior samples, so one
 * scale serves both. A vote tie goes to the class of the nearest tied point.
 */
export function knnClassifier(
  samples: readonly TrainingSample[],
  prior: readonly PriorSample[] = AVP_PRIOR,
  k = KNN_K,
): HitClassifier {
  const own = samples.map((s) => ({ drum: s.drum, vector: featureVector(s.features) }));
  const trained = new Set(own.map((s) => s.drum));
  const { mean, std } = columnStats([...own, ...prior].map((p) => p.vector));
  const points = [...own, ...prior.filter((p) => !trained.has(p.drum))].map((p) => ({
    drum: p.drum,
    z: zscore(p.vector, mean, std),
  }));
  if (points.length === 0) throw new Error('knnClassifier needs at least one sample or prior point');
  return (f) => {
    const z = zscore(featureVector(f), mean, std);
    const near = points
      .map((p) => ({ drum: p.drum, d: p.z.reduce((a, x, i) => a + (x - z[i]) ** 2, 0) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, k);
    const votes = new Map<DrumClass, number>();
    for (const n of near) votes.set(n.drum, (votes.get(n.drum) ?? 0) + 1);
    const top = Math.max(...votes.values());
    return near.find((n) => votes.get(n.drum) === top)!.drum;
  };
}

/** The classifier every caller runs: the user's samples over the AVP prior. */
export function activeClassifier(samples: readonly TrainingSample[]): HitClassifier {
  return knnClassifier(samples);
}

/** Deterministic split: every third sample of each class is held out. */
export function splitSamples(samples: readonly TrainingSample[]): { train: TrainingSample[]; test: TrainingSample[] } {
  const seen: Partial<Record<DrumClass, number>> = {};
  const train: TrainingSample[] = [];
  const test: TrainingSample[] = [];
  for (const s of samples) {
    const n = seen[s.drum] ?? 0;
    seen[s.drum] = n + 1;
    (n % HOLD_OUT_EVERY === HOLD_OUT_EVERY - 1 ? test : train).push(s);
  }
  return { train, test };
}

export function accuracy(classify: HitClassifier, samples: readonly TrainingSample[]): number {
  if (samples.length === 0) return 0;
  return samples.filter((s) => classify(s.features) === s.drum).length / samples.length;
}

export function countsByClass(samples: readonly TrainingSample[]): Record<DrumClass, number> {
  const out = { kick: 0, snare: 0, hat: 0, clap: 0 };
  for (const s of samples) out[s.drum]++;
  return out;
}

/** Per true class: how the classifier labelled that class's samples. */
export type Confusion = Partial<Record<DrumClass, Partial<Record<DrumClass, number>>>>;

export function confusion(classify: HitClassifier, samples: readonly TrainingSample[]): Confusion {
  const out: Confusion = {};
  for (const s of samples) {
    const row = (out[s.drum] ??= {});
    const got = classify(s.features);
    row[got] = (row[got] ?? 0) + 1;
  }
  return out;
}

/** The held-out report of the trained classifier, for the result step and get_voice_take. */
export interface TrainingResult {
  accuracy: number;
  heldOut: number;
  confusion: Confusion;
}

/** Null until a class has MIN_SAMPLES_PER_CLASS samples (so one can be held out). */
export function trainAndEvaluate(samples: readonly TrainingSample[]): TrainingResult | null {
  const counts = countsByClass(samples);
  if (!DRUM_CLASSES.some((d) => counts[d] >= MIN_SAMPLES_PER_CLASS)) return null;
  const { train, test } = splitSamples(samples);
  const classify = knnClassifier(train);
  return { accuracy: accuracy(classify, test), heldOut: test.length, confusion: confusion(classify, test) };
}

/** The training outcome as one line for the panel and the setup wizard. */
export function describeTraining(result: TrainingResult | null): string {
  if (!result) return `using the built-in voice samples; record ${MIN_SAMPLES_PER_CLASS} hits of a drum to train it on your voice`;
  return `held out ${result.heldOut}: ${Math.round(result.accuracy * 100)} percent correct`;
}

/* ---- Storage (per user, versioned, try/catch on every access) ---- */

export const DRUM_SAMPLES_KEY = 'devilbox.voice.drumSamples.v2';
export const DRUM_MODEL_KEY = 'devilbox.voice.drumModel.v2';
/** The onset settings calibrateOnsets fitted to the wizard takes. */
export const DRUM_ONSETS_KEY = 'devilbox.voice.drumOnsets.v2';
const STORAGE_VERSION = 2;

export function loadSamples(): TrainingSample[] {
  try {
    const raw = localStorage.getItem(DRUM_SAMPLES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { version?: number; samples?: TrainingSample[] };
    return parsed.version === STORAGE_VERSION && Array.isArray(parsed.samples) ? parsed.samples : [];
  } catch {
    return [];
  }
}

export function saveSamples(samples: readonly TrainingSample[]): void {
  try {
    localStorage.setItem(DRUM_SAMPLES_KEY, JSON.stringify({ version: STORAGE_VERSION, samples }));
  } catch {
    /* storage unavailable: training is session-only */
  }
}

export function loadTrainingResult(): TrainingResult | null {
  try {
    const raw = localStorage.getItem(DRUM_MODEL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version?: number; result?: TrainingResult };
    return parsed.version === STORAGE_VERSION && typeof parsed.result?.accuracy === 'number' ? parsed.result : null;
  } catch {
    return null;
  }
}

export function saveTrainingResult(result: TrainingResult | null): void {
  try {
    if (result) localStorage.setItem(DRUM_MODEL_KEY, JSON.stringify({ version: STORAGE_VERSION, result }));
    else localStorage.removeItem(DRUM_MODEL_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** The fitted onset settings, or the defaults when none are stored or they are unreadable. */
export function loadOnsetSettings(): OnsetSettings {
  try {
    const raw = localStorage.getItem(DRUM_ONSETS_KEY);
    if (!raw) return DEFAULT_ONSET_SETTINGS;
    const parsed = JSON.parse(raw) as { version?: number; onsets?: Partial<OnsetSettings> };
    const o = parsed.onsets;
    const valid =
      parsed.version === STORAGE_VERSION &&
      o !== undefined &&
      (Object.keys(DEFAULT_ONSET_SETTINGS) as (keyof OnsetSettings)[]).every((k) => Number.isFinite(o[k]) && (o[k] as number) > 0);
    return valid ? { ...DEFAULT_ONSET_SETTINGS, ...o } : DEFAULT_ONSET_SETTINGS;
  } catch {
    return DEFAULT_ONSET_SETTINGS;
  }
}

export function saveOnsetSettings(onsets: OnsetSettings | null): void {
  try {
    if (onsets) localStorage.setItem(DRUM_ONSETS_KEY, JSON.stringify({ version: STORAGE_VERSION, onsets }));
    else localStorage.removeItem(DRUM_ONSETS_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function clearTraining(): void {
  saveSamples([]);
  saveTrainingResult(null);
  saveOnsetSettings(null);
}

/** Labelled training samples from one take: every detected hit gets `drum`. */
export function samplesFromTake(take: Float32Array, drum: DrumClass, onsets: OnsetSettings = DEFAULT_ONSET_SETTINGS): TrainingSample[] {
  return detectHits(take, () => drum, onsets).map((h) => ({ drum, features: h.features }));
}

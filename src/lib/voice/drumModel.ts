/**
 * Per-user drum classifier (VN-4.3): nearest centroid on z-scored hit features,
 * trained from the user's own labelled beatbox takes. It replaces the rules only
 * when its held-out accuracy is strictly better than the rules' on the same
 * held-out hits. Pure train/evaluate functions plus versioned localStorage
 * (every access in try/catch).
 */
import {
  DRUM_CLASSES,
  classifyByRules,
  detectHits,
  featureVector,
  type DrumClass,
  type HitClassifier,
  type HitFeatures,
} from './drumHits';

export interface TrainingSample {
  drum: DrumClass;
  features: HitFeatures;
}

export interface DrumModel {
  mean: number[];
  std: number[];
  centroids: Partial<Record<DrumClass, number[]>>;
}

/** Each class needs this many samples: 2 to train, 1 held out. */
export const MIN_SAMPLES_PER_CLASS = 3;
/** Every HOLD_OUT_EVERY-th sample of a class (0-based index % n === n-1) is held out. */
const HOLD_OUT_EVERY = 3;

function zscore(v: number[], mean: number[], std: number[]): number[] {
  return v.map((x, i) => (x - mean[i]) / std[i]);
}

export function trainModel(samples: readonly TrainingSample[]): DrumModel {
  const vecs = samples.map((s) => featureVector(s.features));
  const dims = vecs[0]?.length ?? 0;
  const mean = new Array<number>(dims).fill(0);
  const std = new Array<number>(dims).fill(1);
  for (let d = 0; d < dims; d++) {
    const m = vecs.reduce((a, v) => a + v[d], 0) / vecs.length;
    const variance = vecs.reduce((a, v) => a + (v[d] - m) ** 2, 0) / vecs.length;
    mean[d] = m;
    std[d] = Math.sqrt(variance) || 1;
  }
  const centroids: DrumModel['centroids'] = {};
  for (const drum of DRUM_CLASSES) {
    const own = samples.map((s, i) => ({ s, v: vecs[i] })).filter((x) => x.s.drum === drum);
    if (own.length === 0) continue;
    const c = new Array<number>(dims).fill(0);
    for (const { v } of own) {
      const z = zscore(v, mean, std);
      for (let d = 0; d < dims; d++) c[d] += z[d] / own.length;
    }
    centroids[drum] = c;
  }
  return { mean, std, centroids };
}

export function classifyWithModel(model: DrumModel, f: HitFeatures): DrumClass {
  const z = zscore(featureVector(f), model.mean, model.std);
  let best: DrumClass = 'snare';
  let bestDist = Infinity;
  for (const drum of DRUM_CLASSES) {
    const c = model.centroids[drum];
    if (!c) continue;
    const dist = c.reduce((a, x, i) => a + (x - z[i]) ** 2, 0);
    if (dist < bestDist) {
      bestDist = dist;
      best = drum;
    }
  }
  return best;
}

export function modelClassifier(model: DrumModel): HitClassifier {
  return (f) => classifyWithModel(model, f);
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

export interface TrainingResult {
  /** Model trained on every sample (what gets used when `useModel`) */
  model: DrumModel;
  modelAccuracy: number;
  rulesAccuracy: number;
  heldOut: number;
  useModel: boolean;
}

/** Null until at least two classes each have MIN_SAMPLES_PER_CLASS samples. */
export function trainAndEvaluate(samples: readonly TrainingSample[]): TrainingResult | null {
  const counts = countsByClass(samples);
  const ready = DRUM_CLASSES.filter((d) => counts[d] >= MIN_SAMPLES_PER_CLASS);
  if (ready.length < 2) return null;
  const usable = samples.filter((s) => ready.includes(s.drum));
  const { train, test } = splitSamples(usable);
  const heldOutModel = trainModel(train);
  const modelAccuracy = accuracy(modelClassifier(heldOutModel), test);
  const rulesAccuracy = accuracy(classifyByRules, test);
  return {
    model: trainModel(usable),
    modelAccuracy,
    rulesAccuracy,
    heldOut: test.length,
    useModel: modelAccuracy > rulesAccuracy,
  };
}

/** The training outcome as one line for the panel and the setup wizard. */
export function describeTraining(result: TrainingResult | null): string {
  if (!result) return `needs ${MIN_SAMPLES_PER_CLASS} hits for at least two classes`;
  return (
    `held out ${result.heldOut}: model ${Math.round(result.modelAccuracy * 100)} percent, ` +
    `rules ${Math.round(result.rulesAccuracy * 100)} percent, ` +
    `using ${result.useModel ? 'your model' : 'the rules'}`
  );
}

/* ---- Storage (per user, versioned, try/catch on every access) ---- */

export const DRUM_SAMPLES_KEY = 'devilbox.voice.drumSamples.v1';
export const DRUM_MODEL_KEY = 'devilbox.voice.drumModel.v1';

export function loadSamples(): TrainingSample[] {
  try {
    const raw = localStorage.getItem(DRUM_SAMPLES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { version?: number; samples?: TrainingSample[] };
    return parsed.version === 1 && Array.isArray(parsed.samples) ? parsed.samples : [];
  } catch {
    return [];
  }
}

export function saveSamples(samples: readonly TrainingSample[]): void {
  try {
    localStorage.setItem(DRUM_SAMPLES_KEY, JSON.stringify({ version: 1, samples }));
  } catch {
    /* storage unavailable: training is session-only */
  }
}

export function loadTrainingResult(): TrainingResult | null {
  try {
    const raw = localStorage.getItem(DRUM_MODEL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version?: number; result?: TrainingResult };
    return parsed.version === 1 && parsed.result?.model ? parsed.result : null;
  } catch {
    return null;
  }
}

export function saveTrainingResult(result: TrainingResult | null): void {
  try {
    if (result) localStorage.setItem(DRUM_MODEL_KEY, JSON.stringify({ version: 1, result }));
    else localStorage.removeItem(DRUM_MODEL_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function clearTraining(): void {
  saveSamples([]);
  saveTrainingResult(null);
}

/** The stored model when it beat the rules on held-out takes, else the rules. */
export function loadActiveClassifier(): HitClassifier {
  const r = loadTrainingResult();
  return r && r.useModel ? modelClassifier(r.model) : classifyByRules;
}

/** Labelled training samples from one take: every detected hit gets `drum`. */
export function samplesFromTake(take: Float32Array, drum: DrumClass): TrainingSample[] {
  return detectHits(take, classifyByRules).map((h) => ({ drum, features: h.features }));
}

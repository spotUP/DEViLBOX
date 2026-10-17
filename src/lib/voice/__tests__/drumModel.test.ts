import { describe, it, expect, beforeEach } from 'vitest';
import { DRUM_CLASSES, FEATURE_COUNT, featureVector, hitFeatures, type DrumClass } from '../drumHits';
import { synthHit, synthTake } from '../drumSynth';
import { PITCH_SAMPLE_RATE } from '../pitchNotes';
import {
  AVP_PRIOR,
  DRUM_MODEL_KEY,
  DRUM_SAMPLES_KEY,
  activeClassifier,
  clearTraining,
  describeTraining,
  knnClassifier,
  loadSamples,
  loadTrainingResult,
  samplesFromTake,
  saveSamples,
  saveTrainingResult,
  splitSamples,
  trainAndEvaluate,
  type PriorSample,
  type TrainingSample,
} from '../drumModel';

function features(drum: DrumClass, seed: number) {
  const take = new Float32Array(PITCH_SAMPLE_RATE / 4);
  take.set(synthHit(drum, seed), 500);
  return hitFeatures(take, 500);
}

/** `n` synthetic hits per class; `label` lets a test relabel what a sound is called. */
function samples(n: number, label: (d: DrumClass) => DrumClass = (d) => d, first = 1): TrainingSample[] {
  const out: TrainingSample[] = [];
  for (let seed = first; seed < first + n; seed++) {
    for (const d of DRUM_CLASSES) out.push({ drum: label(d), features: features(d, seed) });
  }
  return out;
}

const swap = (d: DrumClass): DrumClass => (d === 'kick' ? 'snare' : d === 'snare' ? 'kick' : d);

beforeEach(() => clearTraining());

describe('k-NN drum classifier (WD-3)', () => {
  it('the shipped AVP prior has v2 feature vectors for kick, snare and hat, no clap', () => {
    expect(AVP_PRIOR.length).toBeGreaterThan(100);
    for (const p of AVP_PRIOR) expect(p.vector).toHaveLength(FEATURE_COUNT);
    expect(new Set(AVP_PRIOR.map((p) => p.drum))).toEqual(new Set(['kick', 'snare', 'hat']));
  });

  it('separable synthetic hits: trained on seeds 1-6, every held-out seed 7-12 hit is right', () => {
    const classify = knnClassifier(samples(6), []);
    const test = samples(6, undefined, 7);
    expect(test.filter((s) => classify(s.features) === s.drum)).toHaveLength(test.length);
  });

  it('a voice that names its sounds differently wins over the prior: the labels the user gave are what it returns', () => {
    const classify = knnClassifier(samples(6, swap));
    expect(classify(features('kick', 40))).toBe('snare');
    expect(classify(features('snare', 40))).toBe('kick');
  });

  it('a class the user did not train falls back to the prior; a trained class replaces its prior', () => {
    // Query q sits on the prior hat point, a hair from the prior kick point
    const q = features('kick', 1);
    const at = (dx: number) => featureVector(q).map((x, i) => (i === 0 ? x + dx : x));
    const prior: PriorSample[] = [
      { drum: 'hat', vector: at(0) },
      { drum: 'kick', vector: at(1e-3) },
    ];
    const elsewhere = (drum: DrumClass): TrainingSample => ({ drum, features: features('snare', 9) });
    expect(knnClassifier([elsewhere('snare')], prior, 1)(q)).toBe('hat'); // snare trained, hat prior kept
    expect(knnClassifier([elsewhere('hat')], prior, 1)(q)).toBe('kick'); // hat trained, its prior gone
  });

  it('with no samples and no prior there is nothing to vote with', () => {
    expect(() => knnClassifier([], [])).toThrow();
  });

  it('samplesFromTake labels every detected hit of a training take', () => {
    const take = synthTake([{ drum: 'snare', at: 0.2 }, { drum: 'snare', at: 0.6 }, { drum: 'snare', at: 1.0 }], 1.4);
    const got = samplesFromTake(take, 'snare');
    expect(got.map((s) => s.drum)).toEqual(['snare', 'snare', 'snare']);
  });
});

describe('training evaluation', () => {
  it('splits every third sample of each class out', () => {
    const { train, test } = splitSamples(samples(6));
    expect(test.length).toBe(8);
    expect(train.length).toBe(16);
  });

  it('is null until one class has three hits, then reports held-out accuracy', () => {
    expect(trainAndEvaluate(samples(2))).toBeNull();
    expect(describeTraining(null)).toMatch(/built-in voice samples/);
    const kicks = samples(3).filter((s) => s.drum === 'kick');
    const r = trainAndEvaluate(kicks)!;
    expect(r.heldOut).toBe(1);
    const full = trainAndEvaluate(samples(6, swap))!;
    expect(full.accuracy).toBe(1);
    expect(full.heldOut).toBe(8);
    expect(full.confusion.kick?.snare ?? 0).toBe(0);
    expect(describeTraining(full)).toMatch(/held out 8: 100 percent/);
  });
});

describe('drum training storage', () => {
  it('round-trips samples and the training result under v2 keys', () => {
    expect(DRUM_SAMPLES_KEY).toMatch(/\.v2$/);
    expect(DRUM_MODEL_KEY).toMatch(/\.v2$/);
    const set = samples(4, swap);
    saveSamples(set);
    expect(loadSamples()).toEqual(set);
    expect(activeClassifier(loadSamples())(features('kick', 41))).toBe('snare');
    const r = trainAndEvaluate(set)!;
    saveTrainingResult(r);
    expect(loadTrainingResult()).toEqual(r);
    clearTraining();
    expect(loadTrainingResult()).toBeNull();
    expect(loadSamples()).toEqual([]);
  });

  it('survives corrupt, wrong-version and unavailable storage', () => {
    localStorage.setItem(DRUM_SAMPLES_KEY, '{nope');
    localStorage.setItem(DRUM_MODEL_KEY, JSON.stringify({ version: 99, result: {} }));
    expect(loadSamples()).toEqual([]);
    expect(loadTrainingResult()).toBeNull();
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error('blocked'); };
    try {
      expect(loadSamples()).toEqual([]);
      expect(loadTrainingResult()).toBeNull();
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});

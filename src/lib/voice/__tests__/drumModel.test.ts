import { describe, it, expect, beforeEach } from 'vitest';
import { DRUM_CLASSES, classifyByRules, hitFeatures, type DrumClass } from '../drumHits';
import { synthHit } from '../drumSynth';
import { PITCH_SAMPLE_RATE } from '../pitchNotes';
import {
  DRUM_MODEL_KEY,
  DRUM_SAMPLES_KEY,
  classifyWithModel,
  clearTraining,
  loadActiveClassifier,
  loadSamples,
  loadTrainingResult,
  saveSamples,
  saveTrainingResult,
  splitSamples,
  trainAndEvaluate,
  type TrainingSample,
} from '../drumModel';

function features(drum: DrumClass, seed: number) {
  const take = new Float32Array(PITCH_SAMPLE_RATE / 4);
  take.set(synthHit(drum, seed), 500);
  return hitFeatures(take, 500);
}

/** `n` synthetic hits per class; `label` lets a test relabel what a sound is called. */
function samples(n: number, label: (d: DrumClass) => DrumClass = (d) => d): TrainingSample[] {
  const out: TrainingSample[] = [];
  for (let seed = 1; seed <= n; seed++) {
    for (const d of DRUM_CLASSES) out.push({ drum: label(d), features: features(d, seed) });
  }
  return out;
}

beforeEach(() => clearTraining());

describe('drum model training and evaluation', () => {
  it('splits every third sample of each class out', () => {
    const { train, test } = splitSamples(samples(6));
    expect(test.length).toBe(8);
    expect(train.length).toBe(16);
  });

  it('needs three hits in at least two classes before it trains', () => {
    expect(trainAndEvaluate(samples(2))).toBeNull();
    const oneClass = samples(6).filter((s) => s.drum === 'kick');
    expect(trainAndEvaluate(oneClass)).toBeNull();
  });

  it('on correct labels the model matches but does not beat the rules, so the rules stay', () => {
    const r = trainAndEvaluate(samples(6));
    expect(r).not.toBeNull();
    expect(r!.modelAccuracy).toBe(1);
    expect(r!.rulesAccuracy).toBe(1);
    expect(r!.useModel).toBe(false);
  });

  it('on a voice the rules get wrong, the model wins on held-out takes and is selected', () => {
    // This user calls the kick sound "snare" and the snare sound "kick"
    const swap = (d: DrumClass): DrumClass => (d === 'kick' ? 'snare' : d === 'snare' ? 'kick' : d);
    const set = samples(6, swap);
    const r = trainAndEvaluate(set)!;
    expect(r.rulesAccuracy).toBeLessThan(0.7);
    expect(r.modelAccuracy).toBe(1);
    expect(r.useModel).toBe(true);
    expect(classifyWithModel(r.model, features('kick', 40))).toBe('snare');
    expect(classifyByRules(features('kick', 40))).toBe('kick');
  });
});

describe('drum model storage', () => {
  it('round-trips samples and the training result under versioned keys', () => {
    expect(DRUM_SAMPLES_KEY).toMatch(/\.v1$/);
    expect(DRUM_MODEL_KEY).toMatch(/\.v1$/);
    const set = samples(4);
    saveSamples(set);
    expect(loadSamples()).toEqual(set);
    const r = trainAndEvaluate(samples(6, (d) => (d === 'kick' ? 'snare' : d === 'snare' ? 'kick' : d)))!;
    saveTrainingResult(r);
    expect(loadTrainingResult()).toEqual(r);
    expect(loadActiveClassifier()(features('kick', 41))).toBe('snare');
    clearTraining();
    expect(loadTrainingResult()).toBeNull();
    expect(loadActiveClassifier()(features('kick', 41))).toBe('kick');
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
      expect(loadActiveClassifier()(features('hat', 1))).toBe('hat');
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});

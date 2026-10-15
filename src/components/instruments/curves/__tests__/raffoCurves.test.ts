/**
 * Raffo curves against the real engine (worklet + WASM in Node): envelope law, release counter, filter transfer
 * function and the four oscillator shapes are compared with what the engine reports and renders.
 */
import { describe, it, expect } from 'vitest';
import { makeRig, SAMPLE_RATE, toneLevel, db, relErr, type Rig } from './wasmRig';
import {
  raffoStagedEnvelope, raffoAmpKnobs, raffoFilterKnobs, raffoFilterCoefficients, raffoCutoffHz, raffoWaveValue, raffoReleaseHangs,
  raffoEnvelopeLevel, raffoAttackSamples, raffoDecaySamples, raffoOscRatio, raffoOscillatorSeries,
} from '../raffoCurves';
import { zMagnitudeDb } from '../wasmSubtractiveModels';

const NAMES = ['volume', 'wave0', 'wave1', 'wave2', 'wave3', 'range0', 'range1', 'range2', 'range3', 'vol0', 'vol1', 'vol2', 'vol3',
  'attack', 'decay', 'sustain', 'release', 'filterCutoff', 'filterAttack', 'filterDecay', 'filterSustain', 'glide',
  'oscButton0', 'oscButton1', 'oscButton2', 'oscButton3', 'filterResonance', 'tuning0', 'tuning1', 'tuning2', 'tuning3', 'filterRelease'] as const;
type P = Record<(typeof NAMES)[number], number>;
const base: P = {
  volume: 7, wave0: 2, wave1: 2, wave2: 0, wave3: 3, range0: 2, range1: 2, range2: 1, range3: 2, vol0: 7, vol1: 5, vol2: 4, vol3: 7,
  attack: 10, decay: 200, sustain: 0.8, release: 0.4, filterCutoff: 3000, filterAttack: 200, filterDecay: 400, filterSustain: 0.7, glide: 0,
  oscButton0: 1, oscButton1: 0, oscButton2: 0, oscButton3: 0, filterResonance: 3, tuning0: 0, tuning1: 0, tuning2: 0, tuning3: 0, filterRelease: 0.5,
};
const getter = (p: P) => (k: string): number => (p as Record<string, number>)[k];

async function rigWith(p: P): Promise<Rig> {
  const rig = await makeRig('raffo', 'RaffoSynth');
  for (let i = 0; i < NAMES.length; i++) await rig.send({ type: 'setParam', index: i, value: p[NAMES[i]] });
  await rig.send({ type: 'watchVoices', on: true });
  return rig;
}
const levelAt = (points: Array<[number, number]>, t: number): number => {
  for (let i = 1; i < points.length; i++) if (points[i][0] >= t) { const [x0, y0] = points[i - 1], [x1, y1] = points[i]; return x1 === x0 ? y1 : y0 + ((y1 - y0) * (t - x0)) / (x1 - x0); }
  return points[points.length - 1][1];
};
const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;

describe('Raffo envelope model against the engine', () => {
  it('held amplitude and filter envelopes follow the reported voice, in absolute level', async () => {
    const p: P = { ...base, attack: 400, decay: 300, sustain: 0.7, filterAttack: 350, filterDecay: 250, filterSustain: 0.5, filterCutoff: 4000 };
    const rig = await rigWith(p);
    const get = getter(p);
    const amp = raffoStagedEnvelope(raffoAmpKnobs(get), SAMPLE_RATE);
    const fenv = raffoStagedEnvelope(raffoFilterKnobs(get), SAMPLE_RATE);
    const { reports } = await rig.render(1.6, async (t) => { if (t === 0) await rig.send({ type: 'noteOn', note: 60, velocity: 100 }); });
    const ae: number[] = [], fe: number[] = [], ce: number[] = [];
    for (const r of reports) {
      const v = r.voices[0];
      if (v.stage === 'off' || v.elapsedSeconds <= 0) continue;
      ae.push(Math.abs(levelAt(amp.points, v.elapsedSeconds) - v.level));
      fe.push(Math.abs(levelAt(fenv.points, v.elapsedSeconds) - v.filterLevel));
      ce.push(relErr(v.cutoff, raffoCutoffHz(p.filterCutoff, v.filterLevel)));
    }
    expect(ae.length).toBeGreaterThan(30);
    expect(Math.max(...ae), 'amplitude level, absolute error').toBeLessThan(0.03);
    expect(Math.max(...fe), 'filter level, absolute error').toBeLessThan(0.03);
    expect(Math.max(...ce), 'reported cutoff against cutoff * level + 100 Hz').toBeLessThan(0.001);
    // the units: 400 knob units is (400 + 2) * 100 samples, not 400 ms
    expect(raffoAttackSamples(400) / SAMPLE_RATE).toBeCloseTo(0.8375, 4);
    expect(raffoDecaySamples(300) / SAMPLE_RATE).toBeCloseTo(0.625, 2);
  });

  it('the release counter decays as replayed (level against time since key off)', async () => {
    const p: P = { ...base, attack: 10, decay: 100, sustain: 0.8, release: 0.6 };
    const rig = await rigWith(p);
    const env = raffoStagedEnvelope(raffoAmpKnobs(getter(p)), SAMPLE_RATE);
    let off = -1;
    const { reports } = await rig.render(2.2, async (t) => {
      if (t === 0) await rig.send({ type: 'noteOn', note: 60, velocity: 100 });
      if (off < 0 && t >= 0.6) { off = t; await rig.send({ type: 'noteOff', note: 60 }); }
    });
    const errs: number[] = [];
    for (const r of reports) {
      const v = r.voices[0];
      if (v.stage !== 'release') continue;
      const since = r.t - off;
      errs.push(Math.abs(levelAt(env.points, env.releaseAt + since) - v.level));
    }
    expect(errs.length).toBeGreaterThan(20);
    expect(mean(errs), 'mean absolute level error in the release').toBeLessThan(0.03);
  });

  it('a release knob above 0.89 never lets the note go (the model says so and the engine agrees)', async () => {
    expect(raffoReleaseHangs(0.95)).toBe(true);
    expect(raffoReleaseHangs(0.85)).toBe(false);
    const p: P = { ...base, release: 0.95 };
    const rig = await rigWith(p);
    let off = false;
    const { reports } = await rig.render(2.0, async (t) => {
      if (t === 0) await rig.send({ type: 'noteOn', note: 60, velocity: 100 });
      if (!off && t >= 0.3) { off = true; await rig.send({ type: 'noteOff', note: 60 }); }
    });
    const last = reports.at(-1)!.voices[0];
    expect(last.stage, 'still releasing 1.7 s after key off').toBe('release');
    expect(last.level).toBeGreaterThan(0.5);
  });
});

/** Harmonic amplitudes (relative to the first) of one period of a model wave. */
function waveHarmonics(wave: number, harmonics: number[]): number[] {
  const n = 4096;
  const amp = harmonics.map((k) => {
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) { const y = raffoWaveValue(wave, i / n); re += y * Math.cos((2 * Math.PI * k * i) / n); im += y * Math.sin((2 * Math.PI * k * i) / n); }
    return Math.hypot(re, im) / n;
  });
  return amp.map((a) => db(a / amp[0]));
}

describe('Raffo filter and oscillator models against the engine output', () => {
  const key2hz = (key: number): number => 8.1758 * Math.pow(1.0594, key);
  const harmonics = [1, 2, 3, 4, 5, 6, 7, 8];

  async function held(p: P): Promise<{ f0: number; seg: Float32Array }> {
    const rig = await rigWith(p);
    const { audio } = await rig.render(2.2, async (t) => { if (t === 0) await rig.send({ type: 'noteOn', note: 57, velocity: 100 }); });
    // filter envelope settled (attack + decay short): measure the last second
    // noteOn() truncates the key's period to whole samples (cpp:162)
    const period = Math.trunc((SAMPLE_RATE * 4) / key2hz(57));
    const nominal = (SAMPLE_RATE * Math.pow(2, p.range0)) / period;
    const seg0 = audio.subarray(Math.floor(SAMPLE_RATE * 1.0), Math.floor(SAMPLE_RATE * 2.2));
    let f0 = nominal, best = 0;
    for (let hz = nominal * 0.99; hz <= nominal * 1.01; hz += nominal * 0.00005) { const l = toneLevel(seg0, hz); if (l > best) { best = l; f0 = hz; } }
    // render() restarts each 128-sample chunk from a phase truncated to whole samples (cpp:233), so the pitch runs
    // about 0.1 % flat (measured 0.99885); the harmonics are measured at the real f0.
    expect(f0 / nominal).toBeGreaterThan(0.995);
    expect(f0 / nominal).toBeLessThanOrEqual(1.0001);
    return { f0, seg: audio.subarray(Math.floor(SAMPLE_RATE * 1.0), Math.floor(SAMPLE_RATE * 2.2)) };
  }

  it.each([
    [0, 'triangle'], [1, 'saw'], [2, 'square'], [3, 'pulse'],
  ] as const)('wave select %i is the %s: measured harmonics divided by the filter response match the shape', async (wave, _name) => {
    void _name;
    const p: P = { ...base, wave0: wave, filterCutoff: 2500, filterAttack: 1, filterDecay: 1, filterSustain: 1, sustain: 1, decay: 1, attack: 10, filterResonance: 4 };
    const { f0, seg } = await held(p);
    const c = raffoFilterCoefficients(raffoCutoffHz(p.filterCutoff, 1), p.filterResonance, SAMPLE_RATE);
    const measured = harmonics.map((k) => db(toneLevel(seg, k * f0)) - zMagnitudeDb(c.b, c.a, k * f0, SAMPLE_RATE));
    const model = waveHarmonics(wave, harmonics);
    // compare where the model harmonic is not a null (the square and triangle have no even harmonics)
    const diffs: number[] = [];
    harmonics.forEach((_k, i) => { if (model[i] > -50) diffs.push(measured[i] - measured[0] - model[i]); });
    expect(diffs.length).toBeGreaterThanOrEqual(4);
    for (const d of diffs) expect(Math.abs(d), `wave ${wave}: harmonic level against the model, dB`).toBeLessThan(1.5);
  });

  it.each([[1500, 0], [1500, 8], [6000, 4]] as const)('filter transfer function: cutoff %i Hz, resonance %i dB, harmonic level of a saw', async (cutoff, res) => {
    const p: P = { ...base, wave0: 1, filterCutoff: cutoff, filterResonance: res, filterAttack: 1, filterDecay: 1, filterSustain: 1, sustain: 1, decay: 1 };
    const ref: P = { ...p, filterCutoff: 500, filterResonance: 0 };
    const { f0, seg } = await held(p);
    const refSeg = (await held(ref)).seg;
    const c = raffoFilterCoefficients(raffoCutoffHz(cutoff, 1), res, SAMPLE_RATE);
    const c0 = raffoFilterCoefficients(raffoCutoffHz(500, 1), 0, SAMPLE_RATE);
    const diffs = harmonics.map((k) => (db(toneLevel(seg, k * f0)) - db(toneLevel(refSeg, k * f0))) - (zMagnitudeDb(c.b, c.a, k * f0, SAMPLE_RATE) - zMagnitudeDb(c0.b, c0.a, k * f0, SAMPLE_RATE)));
    expect(Math.max(...diffs.map(Math.abs)), 'measured minus modelled filter change, dB').toBeLessThan(1);
  });

  it('the oscillator curve sums the enabled oscillators at their ranges and tunings', () => {
    const g = getter({ ...base, oscButton1: 1, range1: 3, wave1: 1 });
    const pts = raffoOscillatorSeries(g, 2, 100);
    expect(pts).toHaveLength(100);
    expect(raffoOscRatio(3, 0) / raffoOscRatio(2, 0)).toBe(2);
    expect(raffoOscillatorSeries(getter({ ...base, oscButton0: 0 }))).toEqual([[0, 0], [1, 0]]);
  });

  it('envelope() levels at the stage boundaries', () => {
    expect(raffoEnvelopeLevel(0, 100, 50, 0.5)).toBe(0);
    expect(raffoEnvelopeLevel(100, 100, 50, 0.5)).toBe(1);
    expect(raffoEnvelopeLevel(150, 100, 50, 0.5)).toBeCloseTo(0.5, 9);
    expect(raffoEnvelopeLevel(1000, 100, 50, 0.5)).toBe(0.5);
  });
});

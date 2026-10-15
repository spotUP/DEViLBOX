/**
 * Calf Monosynth curves against the real engine (worklet + WASM in Node): the linear envelopes, the cutoff law and the
 * filter responses are compared with what the engine reports and renders.
 */
import { describe, it, expect } from 'vitest';
import { makeRig, SAMPLE_RATE, toneLevel, db, relErr, type Rig } from './wasmRig';
import {
  calfEnvelope, calfEg1Knobs, calfEg2Knobs, calfCutoffHz, calfFilterLines, calfTriangle, calfAmpContour, calfResonance,
} from '../calfMonoCurves';
import { zMagnitudeDb } from '../wasmSubtractiveModels';
import { CalfMonoParam } from '@/engine/calf-mono/CalfMonoSynth';

/** layout key -> engine parameter index (the same pairs CalfMonoSynth.CONFIG_TO_PARAM carries) */
const INDEX: Record<string, number> = {
  o1Wave: CalfMonoParam.O1_WAVE, o2Wave: CalfMonoParam.O2_WAVE, o12Mix: CalfMonoParam.O12_MIX, filter: CalfMonoParam.FILTER,
  cutoff: CalfMonoParam.CUTOFF, res: CalfMonoParam.RES, filterSep: CalfMonoParam.FILTER_SEP, env2cutoff: CalfMonoParam.ENV1CUTOFF,
  env2res: CalfMonoParam.ENV1RES, env2amp: CalfMonoParam.ENV1AMP, adsrA: CalfMonoParam.ADSR_A, adsrD: CalfMonoParam.ADSR_D,
  adsrS: CalfMonoParam.ADSR_S, adsrF: CalfMonoParam.ADSR_F, adsrR: CalfMonoParam.ADSR_R, keyFollow: CalfMonoParam.KEY_FOLLOW,
  legato: CalfMonoParam.LEGATO, portamento: CalfMonoParam.PORTAMENTO, vel2filter: CalfMonoParam.VEL2FILTER, vel2amp: CalfMonoParam.VEL2AMP,
  master: CalfMonoParam.MASTER, lfoRate: CalfMonoParam.LFO_RATE, lfoDelay: CalfMonoParam.LFO_DELAY, lfo2filter: CalfMonoParam.LFO2FILTER,
  lfo2pitch: CalfMonoParam.LFO2PITCH, lfo2pw: CalfMonoParam.LFO2PW, mwhl2lfo: CalfMonoParam.MWHL2LFO,
  adsr2Cutoff: CalfMonoParam.ENV2CUTOFF, adsr2Res: CalfMonoParam.ENV2RES, adsr2Amp: CalfMonoParam.ENV2AMP, adsr2A: CalfMonoParam.ADSR2_A,
  adsr2D: CalfMonoParam.ADSR2_D, adsr2S: CalfMonoParam.ADSR2_S, adsr2F: CalfMonoParam.ADSR2_F, adsr2R: CalfMonoParam.ADSR2_R,
  lfo1Trig: CalfMonoParam.LFO1_TRIG,
};
type P = Record<keyof typeof INDEX, number>;
const base: P = {
  o1Wave: 0, o2Wave: 0, o12Mix: 0, filter: 0, cutoff: 2000, res: 1.5, filterSep: 0, env2cutoff: 0, env2res: 0, env2amp: 0,
  adsrA: 300, adsrD: 400, adsrS: 0.5, adsrF: 0, adsrR: 500, keyFollow: 0, legato: 0, portamento: 1, vel2filter: 0, vel2amp: 0, master: 1,
  lfoRate: 2, lfoDelay: 0, lfo2filter: 0, lfo2pitch: 0, lfo2pw: 0, mwhl2lfo: 0, adsr2Cutoff: 0, adsr2Res: 0, adsr2Amp: 0,
  adsr2A: 200, adsr2D: 300, adsr2S: 0.4, adsr2F: 0, adsr2R: 400, lfo1Trig: 0,
};
const getter = (p: P) => (k: string): number => (p as Record<string, number>)[k];

async function rigWith(p: P): Promise<Rig> {
  const rig = await makeRig('calf-mono', 'CalfMonoSynth');
  for (const [key, index] of Object.entries(INDEX)) await rig.send({ type: 'setParam', index, value: p[key] });
  await rig.send({ type: 'watchVoices', on: true });
  return rig;
}
const levelAt = (points: ReadonlyArray<readonly [number, number]>, t: number): number => {
  for (let i = 1; i < points.length; i++) if (points[i][0] >= t) { const [x0, y0] = points[i - 1], [x1, y1] = points[i]; return x1 === x0 ? y1 : y0 + ((y1 - y0) * (t - x0)) / (x1 - x0); }
  return points[points.length - 1][1];
};

describe('Calf Monosynth envelope models against the engine', () => {
  it.each([[0], [900], [-900]])('both linear envelopes follow the reported levels (fade %i ms)', async (fade) => {
    const p: P = { ...base, adsrF: fade, adsr2F: fade };
    const rig = await rigWith(p);
    const get = getter(p);
    const e1 = calfEnvelope(calfEg1Knobs(get));
    const e2 = calfEnvelope(calfEg2Knobs(get));
    const { reports } = await rig.render(1.8, async (t) => { if (t === 0) await rig.send({ type: 'noteOn', note: 60, velocity: 127 }); });
    const errs1: number[] = [], errs2: number[] = [];
    for (const r of reports) {
      const v = r.voices[0];
      if (v.stage === 'off' || v.elapsedSeconds < 0.01) continue;
      if (v.elapsedSeconds < e1.releaseAt) errs1.push(Math.abs(levelAt(e1.points, v.elapsedSeconds) - v.level));
      if (v.elapsedSeconds < e2.releaseAt) errs2.push(Math.abs(levelAt(e2.points, v.elapsedSeconds) - v.filterLevel));
    }
    expect(errs1.length).toBeGreaterThan(30);
    expect(Math.max(...errs1), 'EG1 level, absolute error').toBeLessThan(0.03);
    expect(Math.max(...errs2), 'EG2 level, absolute error').toBeLessThan(0.03);
  });

  it('the release is linear from the level at key off in R seconds, and the loudness follows the cubic amplitude contour', async () => {
    const p: P = { ...base, adsrA: 50, adsrD: 100, adsrS: 0.6, adsrR: 800, env2amp: 1, cutoff: 12000, res: 0.9 };
    const rig = await rigWith(p);
    let off = -1;
    const { reports, audio } = await rig.render(2.2, async (t) => {
      if (t === 0) await rig.send({ type: 'noteOn', note: 60, velocity: 127 });
      if (off < 0 && t >= 0.8) { off = t; await rig.send({ type: 'noteOff', note: 60 }); }
    });
    const env = calfEnvelope(calfEg1Knobs(getter(p)));
    const rel = reports.filter((r) => r.voices[0].stage === 'release' && r.voices[0].level > 0.01);
    expect(rel.length).toBeGreaterThan(20);
    const errs = rel.map((r) => Math.abs(levelAt(env.points, env.releaseAt + (r.t - off)) - r.voices[0].level));
    expect(Math.max(...errs), 'release level, absolute error').toBeLessThan(0.04);
    // loudness: peak amplitude per 20 ms window, relative to the sustain, against the cubic contour
    const win = Math.floor(SAMPLE_RATE * 0.02);
    const peakAt = (t: number): number => { let m = 0; const at = Math.floor(t * SAMPLE_RATE); for (let i = at; i < at + win; i++) m = Math.max(m, Math.abs(audio[i])); return m; };
    const sustainPeak = peakAt(0.5);
    const contour = calfAmpContour(env, 0.6);
    const errsAmp: number[] = [];
    for (const dt of [0.1, 0.25, 0.4, 0.55]) {
      const modelled = levelAt(contour, env.releaseAt + dt) / 0.6;
      errsAmp.push(Math.abs(peakAt(off + dt) / sustainPeak - modelled));
    }
    expect(Math.max(...errsAmp), 'loudness relative to sustain, absolute error').toBeLessThan(0.08);
  });

  it('a sustain above 0.999 is capped at 0.999 (params_changed)', () => {
    const env = calfEnvelope({ attackMs: 10, decayMs: 100, sustain: 1, fadeMs: 0, releaseMs: 100 });
    expect(env.sustainFrom).toBe(0.999);
  });
});

describe('Calf Monosynth cutoff and filter models against the engine', () => {
  it.each([[0], [0.8]])('reported cutoff equals the law (key follow %f, EG1 +3600 ct, EG2 -1200 ct, LFO 600 ct)', async (kf) => {
    const p: P = { ...base, cutoff: 1500, env2cutoff: 3600, adsr2Cutoff: -1200, lfo2filter: 600, keyFollow: kf, lfoRate: 3 };
    const rig = await rigWith(p);
    const get = getter(p);
    const { reports } = await rig.render(1.5, async (t) => { if (t === 0) await rig.send({ type: 'noteOn', note: 64, velocity: 127 }); });
    const errs: number[] = [];
    for (const r of reports) {
      const v = r.voices[0];
      if (v.stage === 'off' || v.elapsedSeconds < 0.4) continue; // the cutoff glides for 1/30 s after a change; settled by now
      // the LFO value the engine used belongs to the phase one step earlier
      const phase = v.lfoPhase - 3 * (CALF_STEP / SAMPLE_RATE);
      errs.push(relErr(v.cutoff, calfCutoffHz(get, v.level, v.filterLevel, calfTriangle(phase), 64)));
    }
    expect(errs.length).toBeGreaterThan(20);
    expect(Math.max(...errs), 'cutoff Hz, relative error').toBeLessThan(0.02);
  });

  it('resonance moves toward 0.7 with the envelope when EG>Reso is up', () => {
    const g = getter({ ...base, res: 5, env2res: 1 });
    expect(calfResonance(g, 0, 0)).toBeCloseTo(0.7, 9);
    expect(calfResonance(g, 1, 0)).toBeCloseTo(5, 9);
  });

  const harmonics = [1, 2, 3, 4, 6, 8, 12, 16];
  it.each([[0, 'lp12'], [1, 'lp24'], [3, 'hp12'], [4, 'lpbr'], [6, 'bp6']] as const)('filter type %i (%s): harmonic level change between two cutoffs matches the model (dB)', async (type, _name) => {
    void _name;
    const f0 = 440 * Math.pow(2, (60 - 69) / 12);
    const measure = async (cutoff: number): Promise<number[]> => {
      const p: P = { ...base, filter: type, cutoff, res: type === 6 ? 2 : 3, filterSep: type === 4 ? 600 : 0, adsrA: 5, adsrD: 5, adsrS: 0.99, adsr2A: 5, adsr2D: 5 };
      const rig = await rigWith(p);
      const { audio } = await rig.render(1.6, async (t) => { if (t === 0) await rig.send({ type: 'noteOn', note: 60, velocity: 127 }); });
      const seg = audio.subarray(Math.floor(SAMPLE_RATE * 0.9), Math.floor(SAMPLE_RATE * 1.6));
      return harmonics.map((k) => db(toneLevel(seg, k * f0)));
    };
    const modelDb = (cutoff: number): number[] => {
      const p: P = { ...base, filter: type, cutoff, res: type === 6 ? 2 : 3, filterSep: type === 4 ? 600 : 0 };
      const line = calfFilterLines(type, calfCutoffHz(getter(p), 0, 0, 0, 60), calfResonance(getter(p), 0, 0), p.filterSep, SAMPLE_RATE)[0];
      return harmonics.map((k) => zMagnitudeDb(line.coeffs.b, line.coeffs.a, k * f0, SAMPLE_RATE) + line.gainDb);
    };
    const [a, b] = [await measure(900), await measure(3000)];
    const [ma, mb] = [modelDb(900), modelDb(3000)];
    const diffs = harmonics.map((_, i) => (a[i] - b[i]) - (ma[i] - mb[i]));
    expect(Math.max(...diffs.map(Math.abs)), 'measured minus modelled level change, dB').toBeLessThan(1.5);
  });
});

const CALF_STEP = 64;

describe('Calf Monosynth LFO', () => {
  it('the triangle starts at zero, rises to +1 at a quarter cycle and the reported phase advances at the LFO rate', async () => {
    expect(calfTriangle(0)).toBeCloseTo(0, 6);
    expect(calfTriangle(0.25)).toBeCloseTo(1, 6);
    expect(calfTriangle(0.5)).toBeCloseTo(0, 6);
    expect(calfTriangle(0.75)).toBeCloseTo(-1, 6);
    const p: P = { ...base, lfoRate: 4 };
    const rig = await rigWith(p);
    const { reports } = await rig.render(1.5, async (t) => { if (t === 0) await rig.send({ type: 'noteOn', note: 60, velocity: 127 }); });
    let cycles = 0, prev: number | null = null, t0 = 0, t1 = 0;
    for (const r of reports) {
      const v = r.voices[0];
      if (v.stage === 'off') continue;
      if (prev === null) t0 = r.t; else { let d = v.lfoPhase - prev; if (d < 0) d += 1; cycles += d; t1 = r.t; }
      prev = v.lfoPhase;
    }
    expect(relErr(cycles / (t1 - t0), 4), 'LFO rate, relative error').toBeLessThan(0.03);
  });
});

/**
 * JX10 curves against the real engine: the mda-jx10 worklet and WASM run in Node, the model is compared with what the
 * engine reports and renders. One test (the last) drives the public layout, the others test the model where it lives.
 */
import { describe, it, expect } from 'vitest';
import { makeRig, SAMPLE_RATE, toneLevel, db, relErr, type Rig } from './wasmRig';
import {
  jx10AmpEnvelope, jx10FilterEnvelope, jx10Ff, jx10FiltF, jx10FiltEnv, jx10FilterCoefficients, jx10Q,
  jx10LfoHz, jx10OscillatorSeries, jx10OscRatio, jx10PeriodSamples, JX10_REFERENCE_VELOCITY,
} from '../jx10Curves';
import { zMagnitudeDb } from '../wasmSubtractiveModels';
import { DEFAULT_MDA_JX10 } from '@/engine/mda-jx10/MdaJX10Synth';

const KEYS = ['oscMix', 'oscTune', 'oscFine', 'glide', 'glideRate', 'glideBend', 'vcfFreq', 'vcfReso', 'vcfEnv', 'vcfLfo', 'vcfVel', 'vcfAtt', 'vcfDec', 'vcfSus', 'vcfRel', 'envAtt', 'envDec', 'envSus', 'envRel', 'lfoRate', 'vibrato', 'noise', 'octave', 'tuning'] as const;
type Params = Record<(typeof KEYS)[number], number>;
const base: Params = { ...(DEFAULT_MDA_JX10 as Params), oscMix: 0, glide: 0, vibrato: 0.5, vcfLfo: 0, noise: 0, vcfVel: 0.5 };
const getter = (p: Params) => (k: string): number => (p as Record<string, number>)[k];

async function rigWith(p: Params): Promise<Rig> {
  const rig = await makeRig('mda-jx10', 'MdaJX10');
  for (let i = 0; i < KEYS.length; i++) await rig.send({ type: 'setParam', index: i, value: p[KEYS[i]] });
  await rig.send({ type: 'watchVoices', on: true });
  return rig;
}

describe('JX10 envelope and cutoff models against the engine', () => {
  it('amplitude and filter envelopes follow the reported voice (relative error)', async () => {
    const p: Params = { ...base, envAtt: 0.45, envDec: 0.55, envSus: 0.5, envRel: 0.55, vcfAtt: 0.5, vcfDec: 0.55, vcfSus: 0.6, vcfRel: 0.55, vcfEnv: 0.62, vcfFreq: 0.5 };
    const rig = await rigWith(p);
    const get = getter(p);
    const amp = jx10AmpEnvelope(get, SAMPLE_RATE);
    const fenv = jx10FilterEnvelope(get);
    const releaseAt = 1.2;
    let released = false;
    const { reports } = await rig.render(2.5, async (t) => {
      if (t === 0) await rig.send({ type: 'noteOn', note: 60, velocity: 100 });
      if (!released && t >= releaseAt) { released = true; await rig.send({ type: 'noteOff', note: 60 }); }
    });
    const at = (env: { points: Array<[number, number]> }, t: number): number => {
      const pts = env.points;
      for (let i = 1; i < pts.length; i++) if (pts[i][0] >= t) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return x1 === x0 ? y1 : y0 + ((y1 - y0) * (t - x0)) / (x1 - x0); }
      return pts[pts.length - 1][1];
    };
    const errs: number[] = [], ferrs: number[] = [];
    for (const r of reports) {
      const v = r.voices.find((x) => x.stage !== 'off');
      if (!v || v.elapsedSeconds < 0.01) continue;
      const t = v.elapsedSeconds;
      if (t < releaseAt - 0.05) {
        errs.push(Math.abs(at(amp, t) - v.level));
        ferrs.push(Math.abs(at(fenv, t) - v.filterLevel));
      }
    }
    const meanErr = errs.reduce((a, b) => a + b, 0) / errs.length;
    const fMean = ferrs.reduce((a, b) => a + b, 0) / ferrs.length;
    expect(errs.length).toBeGreaterThan(20);
    expect(meanErr, 'mean absolute level error, amplitude envelope').toBeLessThan(0.005);
    expect(Math.max(...errs)).toBeLessThan(0.02);
    expect(fMean, 'mean absolute level error, filter envelope').toBeLessThan(0.005);
    expect(Math.max(...ferrs)).toBeLessThan(0.02);
  });

  it('release and decay rates match the engine', async () => {
    const p: Params = { ...base, envAtt: 0.2, envDec: 0.6, envSus: 0.5, envRel: 0.6 };
    const rig = await rigWith(p);
    let off = false;
    const { reports } = await rig.render(2.4, async (t) => {
      if (t === 0) await rig.send({ type: 'noteOn', note: 60, velocity: 100 });
      if (!off && t >= 1.0) { off = true; await rig.send({ type: 'noteOff', note: 60 }); }
    });
    const rel = reports.map((r) => r.voices.find((v) => v.stage === 'release')).filter((v) => !!v);
    const first = rel[2]!, last = rel[rel.length - 3]!;
    const measuredRate = -Math.log(last.level / first.level) / (last.elapsedSeconds - first.elapsedSeconds);
    const modelRate = -Math.log(jx10AmpEnvelope(getter(p), SAMPLE_RATE).points.at(-2)![1] / jx10AmpEnvelope(getter(p), SAMPLE_RATE).points.at(-3)![1]) / (jx10AmpEnvelope(getter(p), SAMPLE_RATE).points.at(-2)![0] - jx10AmpEnvelope(getter(p), SAMPLE_RATE).points.at(-3)![0]);
    expect(rel.length).toBeGreaterThan(5);
    expect(relErr(measuredRate, modelRate), 'release rate, relative error').toBeLessThan(0.01);
  });

  it('cutoff report equals the model once the filter smoothing has settled', async () => {
    const p: Params = { ...base, vcfFreq: 0.5, vcfEnv: 0.62, vcfReso: 0.3, vcfAtt: 0.5, vcfDec: 0.55, vcfSus: 0.6, envSus: 1 };
    const rig = await rigWith(p);
    const get = getter(p);
    const { reports } = await rig.render(1.6, async (t) => { if (t === 0) await rig.send({ type: 'noteOn', note: 60, velocity: 100 }); });
    const errs: number[] = [];
    for (const r of reports) {
      const v = r.voices.find((x) => x.stage !== 'off');
      if (!v || v.elapsedSeconds < 1.0) continue;
      const model = jx10Ff(60, JX10_REFERENCE_VELOCITY, jx10FiltF(get) + jx10FiltEnv(get) * v.filterLevel, get, SAMPLE_RATE);
      errs.push(relErr(v.cutoff, model));
    }
    expect(errs.length).toBeGreaterThan(10);
    expect(Math.max(...errs), 'reported ff against the model, relative').toBeLessThan(0.005);
  });

  it('filter response: harmonic levels of a held note move as the model says (dB)', async () => {
    const levels: Record<string, number[]> = {};
    const f0 = SAMPLE_RATE / (2 * jx10PeriodSamples(60, getter(base), SAMPLE_RATE));
    const harmonics = [1, 2, 3, 4, 6, 8, 12, 16, 24];
    for (const [name, cutoff, reso] of [['low', 0.42, 0.0], ['mid', 0.52, 0.0], ['reso', 0.52, 0.8]] as const) {
      const p: Params = { ...base, vcfFreq: cutoff, vcfReso: reso, vcfEnv: 0.5, envSus: 1, vcfSus: 1, envAtt: 0.1, envDec: 0.1, vcfDec: 0.1 };
      const rig = await rigWith(p);
      const { audio } = await rig.render(1.4, async (t) => { if (t === 0) await rig.send({ type: 'noteOn', note: 60, velocity: 100 }); });
      const seg = audio.subarray(Math.floor(SAMPLE_RATE * 0.8), Math.floor(SAMPLE_RATE * 1.4));
      levels[name] = harmonics.map((k) => db(toneLevel(seg, k * f0)));
    }
    const model = (cutoff: number, reso: number): number[] => {
      const p: Params = { ...base, vcfFreq: cutoff, vcfReso: reso, vcfEnv: 0.5 };
      const ff = jx10Ff(60, JX10_REFERENCE_VELOCITY, jx10FiltF(getter(p)), getter(p), SAMPLE_RATE);
      const c = jx10FilterCoefficients(ff, jx10Q(getter(p)));
      return harmonics.map((k) => zMagnitudeDb(c.b, c.a, k * f0, SAMPLE_RATE) - 20 * Math.log10(k)); // a saw falls as 1/k
    };
    const settings = { low: [0.42, 0], mid: [0.52, 0], reso: [0.52, 0.8] } as const;
    const rows = (['low', 'mid', 'reso'] as const).map((n) => ({ n, m: model(settings[n][0], settings[n][1]) }));
    for (const { n, m } of rows) {
      const off = levels[n][0] - m[0];
      const diffs = levels[n].map((v, k) => v - off - m[k]);
      expect(Math.max(...diffs.map(Math.abs)), `${n}: measured minus modelled harmonic level, dB`).toBeLessThan(1);
    }
    expect(f0).toBeGreaterThan(200);
  });

  it('LFO phase advances at the modelled rate', async () => {
    const p: Params = { ...base, lfoRate: 0.7, envSus: 1 };
    const rig = await rigWith(p);
    const { reports } = await rig.render(1.5, async (t) => { if (t === 0) await rig.send({ type: 'noteOn', note: 60, velocity: 100 }); });
    let cycles = 0, prev: number | null = null, t0 = 0, t1 = 0;
    for (const r of reports) {
      const v = r.voices.find((x) => x.stage !== 'off'); if (!v) continue;
      if (prev !== null) { let d = v.lfoPhase - prev; if (d < 0) d += 1; cycles += d; t1 = r.t; } else t0 = r.t;
      prev = v.lfoPhase;
    }
    const measured = cycles / (t1 - t0);
    expect(relErr(measured, jx10LfoHz(getter(p))), 'LFO rate, relative error').toBeLessThan(0.02);
  });

  it('oscillator: a falling saw, and the second saw at the modelled frequency ratio and mix', async () => {
    const f0 = SAMPLE_RATE / (2 * jx10PeriodSamples(60, getter(base), SAMPLE_RATE));
    // one saw: waveform correlation with the model over four cycles
    {
      const p: Params = { ...base, oscMix: 0, vcfFreq: 0.62, vcfReso: 0, vcfEnv: 0.5, envSus: 1, envAtt: 0.1 };
      const rig = await rigWith(p);
      const { audio } = await rig.render(1.0, async (t) => { if (t === 0) await rig.send({ type: 'noteOn', note: 60, velocity: 100 }); });
      const period = jx10PeriodSamples(60, getter(p), SAMPLE_RATE) * 2;
      const from = Math.floor(SAMPLE_RATE * 0.6);
      let jump = from, best = -1;
      for (let i = from; i < from + period * 1.2; i++) { const d = audio[i + 1] - audio[i]; if (d > best) { best = d; jump = i + 1; } }
      const n = Math.floor(period * 4);
      const meas = Array.from(audio.subarray(jump, jump + n));
      const model = jx10OscillatorSeries(getter(p), 4, n).map((q) => q[1]);
      const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
      const ma = mean(meas), mb = mean(model);
      let sab = 0, saa = 0, sbb = 0;
      for (let i = 0; i < n; i++) { sab += (meas[i] - ma) * (model[i] - mb); saa += (meas[i] - ma) ** 2; sbb += (model[i] - mb) ** 2; }
      expect(sab / Math.sqrt(saa * sbb), 'waveform correlation, single saw').toBeGreaterThan(0.95);
    }
    // two saws: the spectrum has the second line at f0 * ratio, mix times as strong
    {
      const p: Params = { ...base, oscMix: 0.5, oscTune: 0.45, vcfFreq: 0.62, vcfReso: 0, vcfEnv: 0.5, envSus: 1, envAtt: 0.1 };
      const rig = await rigWith(p);
      const { audio } = await rig.render(1.6, async (t) => { if (t === 0) await rig.send({ type: 'noteOn', note: 60, velocity: 100 }); });
      const seg = audio.subarray(Math.floor(SAMPLE_RATE * 0.6), Math.floor(SAMPLE_RATE * 1.6));
      const ratio = jx10OscRatio(getter(p));
      let bestHz = 0, bestLevel = 0;
      for (let hz = f0 * ratio * 0.9; hz <= f0 * ratio * 1.1; hz += 0.25) { const l = toneLevel(seg, hz); if (l > bestLevel) { bestLevel = l; bestHz = hz; } }
      expect(relErr(bestHz, f0 * ratio), 'second oscillator frequency, relative error').toBeLessThan(0.005);
      expect(bestLevel / toneLevel(seg, f0), 'second line level over the first (OSC MIX)').toBeGreaterThan(0.4);
      expect(bestLevel / toneLevel(seg, f0)).toBeLessThan(0.65);
    }
  });
});

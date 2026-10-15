/**
 * amsynth curves against the real engine (worklet + WASM in Node): the control laws, the linear envelopes, the cutoff
 * law and the biquad responses, and the LFO wave order, compared with what the engine reports and renders.
 */
import { describe, it, expect } from 'vitest';
import { makeRig, SAMPLE_RATE, toneLevel, db, relErr, type Rig } from './wasmRig';
import {
  amsynthEnvelope, amsynthAmpKnobs, amsynthFilterEnvKnobs, amsynthCutoffHz, amsynthFilterCoefficients, amsynthLfoValue, amsynthLfoHz,
  amsynthNoteHz, AMSYNTH_LFO_WAVES,
} from '../amsynthCurves';
import { zMagnitudeDb } from '../wasmSubtractiveModels';

/** layout key -> Param index (controls.h) */
const INDEX = {
  ampAttack: 0, ampDecay: 1, ampSustain: 2, ampRelease: 3, osc1Waveform: 4, filterAttack: 5, filterDecay: 6, filterSustain: 7, filterRelease: 8,
  filterResonance: 9, filterEnvAmount: 10, filterCutoff: 11, osc2Detune: 12, osc2Waveform: 13, masterVol: 14, lfoFreq: 15, lfoWaveform: 16,
  osc2Range: 17, oscMix: 18, freqModAmount: 19, filterModAmount: 20, ampModAmount: 21, oscMixMode: 22, osc1Pulsewidth: 23, osc2Pulsewidth: 24,
  reverbRoomsize: 25, reverbDamp: 26, reverbWet: 27, reverbWidth: 28, distortionCrunch: 29, osc2Sync: 30, portamentoTime: 31, keyboardMode: 32,
  osc2Pitch: 33, filterType: 34, filterSlope: 35, freqModOsc: 36, filterKbdTrack: 37, filterVelSens: 38, ampVelSens: 39,
} as const;
type P = Record<keyof typeof INDEX, number>;
const base: P = {
  ampAttack: 0.5, ampDecay: 0.6, ampSustain: 0.5, ampRelease: 0.6, osc1Waveform: 2, filterAttack: 0.4, filterDecay: 0.5, filterSustain: 0.4, filterRelease: 0.5,
  filterResonance: 0.3, filterEnvAmount: 0, filterCutoff: 0.6, osc2Detune: 0, osc2Waveform: 2, masterVol: 0.25, lfoFreq: 2, lfoWaveform: 0,
  osc2Range: 0, oscMix: -1, freqModAmount: 0, filterModAmount: -1, ampModAmount: -1, oscMixMode: 0, osc1Pulsewidth: 1, osc2Pulsewidth: 0.5,
  reverbRoomsize: 0, reverbDamp: 0, reverbWet: 0, reverbWidth: 1, distortionCrunch: 0, osc2Sync: 0, portamentoTime: 0, keyboardMode: 0,
  osc2Pitch: 0, filterType: 0, filterSlope: 1, freqModOsc: 0, filterKbdTrack: 0, filterVelSens: 0, ampVelSens: 0,
};
const getter = (p: P) => (k: string): number => (p as Record<string, number>)[k];

async function rigWith(p: P): Promise<Rig> {
  const rig = await makeRig('amsynth', 'AMSynth');
  for (const [key, index] of Object.entries(INDEX)) await rig.send({ type: 'setParam', index, value: p[key as keyof P] });
  await rig.send({ type: 'watchVoices', on: true });
  return rig;
}
const levelAt = (points: ReadonlyArray<readonly [number, number]>, t: number): number => {
  for (let i = 1; i < points.length; i++) if (points[i][0] >= t) { const [x0, y0] = points[i - 1], [x1, y1] = points[i]; return x1 === x0 ? y1 : y0 + ((y1 - y0) * (t - x0)) / (x1 - x0); }
  return points[points.length - 1][1];
};

describe('amsynth envelope models against the engine', () => {
  it('both linear envelopes follow the reported levels, with the cubic time law', async () => {
    const p: P = { ...base };
    const rig = await rigWith(p);
    const get = getter(p);
    const amp = amsynthEnvelope(amsynthAmpKnobs(get));
    const fenv = amsynthEnvelope(amsynthFilterEnvKnobs(get));
    const { reports } = await rig.render(1.6, async (t) => { if (t === 0) await rig.send({ type: 'noteOn', note: 60, velocity: 127 }); });
    const ae: number[] = [], fe: number[] = [];
    for (const r of reports) {
      const v = r.voices.find((x) => x.note === 60);
      if (!v || v.stage === 'off' || v.elapsedSeconds < 0.005) continue;
      if (v.elapsedSeconds < amp.releaseAt) ae.push(Math.abs(levelAt(amp.points, v.elapsedSeconds) - v.level));
      if (v.elapsedSeconds < fenv.releaseAt) fe.push(Math.abs(levelAt(fenv.points, v.elapsedSeconds) - v.filterLevel));
    }
    expect(ae.length).toBeGreaterThan(20);
    expect(Math.max(...ae), 'amplitude level, absolute error').toBeLessThan(0.02);
    expect(Math.max(...fe), 'filter level, absolute error').toBeLessThan(0.02);
    // knob 0.5 attack is 0.0005 + 0.125 s, not the layout's former 1250 ms
    expect(amp.attackEnd).toBeCloseTo(0.1255, 4);
  });

  it('the release is a linear fall to zero in 0.0005 + v^3 seconds', async () => {
    const p: P = { ...base, ampAttack: 0, ampDecay: 0, ampSustain: 0.8, ampRelease: 0.8 };
    const rig = await rigWith(p);
    let off = -1;
    const { reports } = await rig.render(1.4, async (t) => {
      if (t === 0) await rig.send({ type: 'noteOn', note: 60, velocity: 127 });
      if (off < 0 && t >= 0.3) { off = t; await rig.send({ type: 'noteOff', note: 60 }); }
    });
    const env = amsynthEnvelope(amsynthAmpKnobs(getter(p)));
    const rel = reports.map((r) => ({ t: r.t, v: r.voices.find((x) => x.note === 60) })).filter((r) => r.v && r.v.stage === 'release' && r.v.level > 0.01);
    expect(rel.length).toBeGreaterThan(10);
    const errs = rel.map((r) => Math.abs(levelAt(env.points, env.releaseAt + (r.t - off)) - r.v!.level));
    expect(Math.max(...errs), 'release level, absolute error').toBeLessThan(0.05);
  });

  it('a decay at its 0.5 ms floor makes the attack aim at the sustain level', () => {
    const env = amsynthEnvelope({ attack: 0.3, decay: 0, sustain: 0.4, release: 0.3 });
    expect(Math.max(...env.points.map((p) => p[1]))).toBeCloseTo(0.4, 6);
  });
});

describe('amsynth cutoff and filter models against the engine', () => {
  it.each([[0.6, 0, 0], [0.9, 6, 0.5], [0.7, -8, 1]])('reported cutoff equals the law (cutoff %f, env amount %f, key track %f)', async (cutoff, amount, kbd) => {
    const p: P = { ...base, filterCutoff: cutoff, filterEnvAmount: amount, filterKbdTrack: kbd, filterAttack: 0.3, filterDecay: 0.4 };
    const rig = await rigWith(p);
    const get = getter(p);
    const { reports } = await rig.render(1.2, async (t) => { if (t === 0) await rig.send({ type: 'noteOn', note: 64, velocity: 127 }); });
    const errs: number[] = [];
    for (const r of reports) {
      const v = r.voices.find((x) => x.note === 64);
      if (!v || v.stage === 'off') continue;
      errs.push(relErr(v.cutoff, amsynthCutoffHz(get, v.filterLevel, -1, 64, SAMPLE_RATE)));
    }
    expect(errs.length).toBeGreaterThan(20);
    expect(Math.max(...errs), 'cutoff Hz, relative error').toBeLessThan(0.001);
  });

  const harmonics = [1, 2, 3, 4, 6, 8, 12, 16];
  it.each([[0, 0, 'low-pass 12'], [0, 1, 'low-pass 24'], [1, 0, 'high-pass'], [2, 0, 'band-pass'], [3, 0, 'band-stop']] as const)('filter type %i slope %i (%s): harmonic level change between two cutoffs matches the model (dB)', async (type, slope, _name) => {
    void _name;
    const f0 = amsynthNoteHz(60);
    const run = async (cutoff: number): Promise<{ levels: number[]; hz: number }> => {
      const p: P = { ...base, filterType: type, filterSlope: slope, filterCutoff: cutoff, filterResonance: 0.5, ampAttack: 0, ampDecay: 0, ampSustain: 1, ampRelease: 0.3, filterSustain: 1, filterDecay: 0, filterAttack: 0, filterEnvAmount: 0, filterKbdTrack: 1 };
      const rig = await rigWith(p);
      const { audio } = await rig.render(1.2, async (t) => { if (t === 0) await rig.send({ type: 'noteOn', note: 60, velocity: 127 }); });
      const seg = audio.subarray(Math.floor(SAMPLE_RATE * 0.5), Math.floor(SAMPLE_RATE * 1.2));
      return { levels: harmonics.map((k) => db(toneLevel(seg, k * f0))), hz: amsynthCutoffHz(getter(p), 1, -1, 60, SAMPLE_RATE) };
    };
    const [a, b] = [await run(0.3), await run(0.9)];
    const model = (cut: number): number[] => {
      const c = amsynthFilterCoefficients(type, cut, 0.5, slope === 1, SAMPLE_RATE)!;
      return harmonics.map((k) => zMagnitudeDb(c.b, c.a, k * f0, SAMPLE_RATE));
    };
    const [ma, mb] = [model(a.hz), model(b.hz)];
    // harmonics under -60 dBFS are at the oscillator's alias floor and say nothing about the filter
    const diffs = harmonics.flatMap((_, i) => (a.levels[i] > -60 && b.levels[i] > -60 ? [(a.levels[i] - b.levels[i]) - (ma[i] - mb[i])] : []));
    expect(diffs.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...diffs.map(Math.abs)), 'measured minus modelled level change, dB').toBeLessThan(1.5);
  });
});

describe('amsynth LFO', () => {
  it('the LFO rate is knob^2 Hz (phase advance in the report)', async () => {
    const p: P = { ...base, lfoFreq: 2.2 };
    const rig = await rigWith(p);
    const { reports } = await rig.render(1.5, async (t) => { if (t === 0) await rig.send({ type: 'noteOn', note: 60, velocity: 127 }); });
    let cycles = 0, prev: number | null = null, t0 = 0, t1 = 0;
    for (const r of reports) {
      const v = r.voices.find((x) => x.note === 60);
      if (!v) continue;
      if (prev === null) t0 = r.t; else { let d = v.lfoPhase - prev; if (d < -0.5) d += 1; cycles += Math.max(0, d); t1 = r.t; }
      prev = v.lfoPhase;
    }
    expect(relErr(cycles / (t1 - t0), amsynthLfoHz(2.2)), 'LFO rate, relative error').toBeLessThan(0.03);
  });

  it.each([0, 1, 2, 5, 6])('LFO wave %i (%s): the amplitude modulation it draws has the model shape and no other', async (wave) => {
    // LFO to amp at full depth: the output level follows (lfo * 0.5 + 0.5) times the envelope
    const p: P = { ...base, lfoWaveform: wave, lfoFreq: 1.0, ampModAmount: 1, ampAttack: 0, ampDecay: 0, ampSustain: 1, osc1Waveform: 0, oscMix: -1, filterType: 4, filterSlope: 0 };
    const rig = await rigWith(p);
    const { audio } = await rig.render(2.6, async (t) => { if (t === 0) await rig.send({ type: 'noteOn', note: 60, velocity: 127 }); });
    const win = Math.floor(SAMPLE_RATE * 0.01);
    const env: number[] = [];
    for (let at = Math.floor(SAMPLE_RATE * 0.3); at + win < audio.length; at += win) { let m = 0; for (let i = at; i < at + win; i++) m = Math.max(m, Math.abs(audio[i])); env.push(m); }
    const corr = (shape: number, lag: number): number => {
      const hz = amsynthLfoHz(1.0);
      const model = env.map((_, i) => amsynthLfoValue(shape, hz * (i * 0.01) + lag) * 0.5 + 0.5);
      const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
      const [ma, mb] = [mean(env), mean(model)];
      let sab = 0, saa = 0, sbb = 0;
      for (let i = 0; i < env.length; i++) { sab += (env[i] - ma) * (model[i] - mb); saa += (env[i] - ma) ** 2; sbb += (model[i] - mb) ** 2; }
      return sab / Math.sqrt(Math.max(1e-12, saa * sbb));
    };
    const best = (shape: number): number => Math.max(...Array.from({ length: 40 }, (_, k) => corr(shape, k / 40)));
    expect(best(wave), `${AMSYNTH_LFO_WAVES[wave]} correlates with its own model`).toBeGreaterThan(0.93);
    for (const other of [0, 1, 2, 5, 6]) if (other !== wave) expect(best(other), `${AMSYNTH_LFO_WAVES[wave]} is not ${AMSYNTH_LFO_WAVES[other]}`).toBeLessThan(best(wave));
  });
});

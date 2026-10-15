/**
 * WaveSabre Falcon and Slaughter curves against the real engine (worklet + WASM in Node): envelope law, the oversampled
 * state-variable filter, the oscillators, the FM voice and the config-to-engine parameter table.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from '@/engine/__tests__/workletHarness';
import { makeCustomRig, SAMPLE_RATE, bandPowersDb, relErr, type Rig } from './wasmRig';
import {
  DEFAULT_FALCON_CONFIG, DEFAULT_SLAUGHTER_CONFIG, FalconParamIndex, SlaughterParamIndex, type FalconConfig, type SlaughterConfig,
} from '@typedefs/wavesabreInstrument';
import {
  wsEnvelope, wsEnvMs, slaughterWave, slaughterFilterHz, slaughterFilterDb, wsFilterType, slaughterCornerHz, falconWaveform,
  falconRatio, wsParamToHz,
} from '../wavesabreCurves';

async function wsRig(synthType: 'falcon' | 'slaughter'): Promise<Rig> {
  const wasmBinary = new Uint8Array(readFileSync(resolve(ROOT, 'public/wavesabre/WaveSabreSynth.wasm')));
  const jsCode = readFileSync(resolve(ROOT, 'public/wavesabre/WaveSabreSynth.js'), 'utf8');
  return makeCustomRig(
    'public/wavesabre/WaveSabre.worklet.js',
    (deliver) => deliver({ type: 'init', data: { wasmBytes: { wasmBinary, jsCode }, synthType } }),
    (posted) => posted.some((p) => p.type === 'ready'),
  );
}
async function configure<T extends object>(rig: Rig, table: Record<keyof T, number>, defaults: T, config: Partial<T>, raw: Record<number, number> = {}): Promise<void> {
  const params: Record<number, number> = {};
  for (const [key, value] of Object.entries({ ...defaults, ...config })) {
    const index = table[key as keyof T];
    if (index >= 0) params[index] = value as number;
  }
  await rig.send({ type: 'setParameters', data: { params: { ...params, ...raw } } });
  await rig.send({ type: 'watchVoices', on: true });
}
const noteOn = (rig: Rig, note = 60) => rig.send({ type: 'noteOn', data: { note, velocity: 127 } });
const getter = (c: object) => (k: string): number => (c as Record<string, number>)[k];
const levelAt = (points: ReadonlyArray<readonly [number, number]>, t: number): number => {
  for (let i = 1; i < points.length; i++) if (points[i][0] >= t) { const [x0, y0] = points[i - 1], [x1, y1] = points[i]; return x1 === x0 ? y1 : y0 + ((y1 - y0) * (t - x0)) / (x1 - x0); }
  return points[points.length - 1][1];
};

const HEADERS = ['Falcon', 'Slaughter'].map((n) => resolve(ROOT, `third-party/wavesabre/WaveSabreCore/include/WaveSabreCore/${n}.h`));
describe('WaveSabre parameter tables', () => {
  it.skipIf(!HEADERS.every(existsSync))('every config key maps to the engine parameter whose role the layout names', () => {
    const names = (file: string): string[] => /enum class ParamIndices\s*\{([\s\S]*?)\};/.exec(readFileSync(file, 'utf8'))![1].split(',').map((n) => n.trim()).filter(Boolean);
    const [falcon, slaughter] = HEADERS.map(names);
    const expectFalcon: Record<string, string> = {
      osc1Waveform: 'Osc2Waveform', osc1Coarse: 'Osc2RatioCoarse', osc1Fine: 'Osc2RatioFine', osc2Waveform: 'Osc1Waveform',
      osc2Coarse: 'Osc1RatioCoarse', osc2Fine: 'Osc1RatioFine', fmAmount: 'Osc1FeedForward', feedback: 'Osc1Feedback',
      attack1: 'Osc2Attack', decay1: 'Osc2Decay', sustain1: 'Osc2Sustain', release1: 'Osc2Release',
      attack2: 'Osc1Attack', decay2: 'Osc1Decay', sustain2: 'Osc1Sustain', release2: 'Osc1Release',
      gain: 'MasterLevel', voices: 'VoicesUnisono', detune: 'VoicesDetune', spread: 'VoicesPan',
    };
    for (const [key, name] of Object.entries(expectFalcon)) expect(falcon[FalconParamIndex[key as keyof FalconConfig]], `Falcon ${key}`).toBe(name);
    const expectSlaughter: Record<string, string> = {
      waveform: 'Osc1Waveform', pulseWidth: 'Osc1PulseWidth', coarse: 'Osc1DetuneCoarse', fine: 'Osc1DetuneFine', filterType: 'FilterType',
      cutoff: 'FilterFreq', resonance: 'FilterResonance', filterEnvAmount: 'FilterModAmt', ampAttack: 'AmpAttack', ampDecay: 'AmpDecay',
      ampSustain: 'AmpSustain', ampRelease: 'AmpRelease', filterAttack: 'ModAttack', filterDecay: 'ModDecay', filterSustain: 'ModSustain',
      filterRelease: 'ModRelease', gain: 'MasterLevel', voices: 'VoicesUnisono', detune: 'VoicesDetune', spread: 'VoicesPan',
    };
    for (const [key, name] of Object.entries(expectSlaughter)) expect(slaughter[SlaughterParamIndex[key as keyof SlaughterConfig]], `Slaughter ${key}`).toBe(name);
  });
});

describe('WaveSabre envelope model against the engine', () => {
  it.each([['slaughter'], ['falcon']] as const)('%s: the amplitude and modulation envelopes follow the reported voice', async (kind) => {
    const rig = await wsRig(kind);
    const common = { attack1: 0.25, decay1: 0.3, sustain1: 0.5, release1: 0.3, attack2: 0.2, decay2: 0.25, sustain2: 0.3, release2: 0.3 };
    const slaughter = { ampAttack: 0.25, ampDecay: 0.3, ampSustain: 0.5, ampRelease: 0.3, filterAttack: 0.2, filterDecay: 0.25, filterSustain: 0.3, filterRelease: 0.3 };
    const config = kind === 'falcon' ? { ...DEFAULT_FALCON_CONFIG, ...common } : { ...DEFAULT_SLAUGHTER_CONFIG, ...slaughter };
    if (kind === 'falcon') await configure(rig, FalconParamIndex, DEFAULT_FALCON_CONFIG, config as FalconConfig);
    else await configure(rig, SlaughterParamIndex, DEFAULT_SLAUGHTER_CONFIG, config as SlaughterConfig);
    const amp = kind === 'falcon' ? wsEnvelope({ attack: common.attack1, decay: common.decay1, sustain: common.sustain1, release: common.release1 }) : wsEnvelope({ attack: slaughter.ampAttack, decay: slaughter.ampDecay, sustain: slaughter.ampSustain, release: slaughter.ampRelease });
    const mod = kind === 'falcon' ? wsEnvelope({ attack: common.attack2, decay: common.decay2, sustain: common.sustain2, release: common.release2 }) : wsEnvelope({ attack: slaughter.filterAttack, decay: slaughter.filterDecay, sustain: slaughter.filterSustain, release: slaughter.filterRelease });
    await noteOn(rig);
    let off = -1;
    const { reports } = await rig.render(3.0, async (t) => { if (off < 0 && t >= 1.2) { off = t; await rig.send({ type: 'noteOff', data: { note: 60 } }); } });
    const ae: number[] = [], me: number[] = [];
    for (const r of reports) {
      const v = r.voices[0];
      if (!v || v.stage === 'off' || v.elapsedSeconds < 0.005) continue;
      const t = v.elapsedSeconds;
      if (t < amp.releaseAt) ae.push(Math.abs(levelAt(amp.points, t) - v.level));
      if (t < mod.releaseAt) me.push(Math.abs(levelAt(mod.points, t) - v.filterLevel));
    }
    expect(ae.length).toBeGreaterThan(20);
    expect(Math.max(...ae), 'amplitude envelope level, absolute error').toBeLessThan(0.02);
    expect(Math.max(...me), 'modulation envelope level, absolute error').toBeLessThan(0.02);
    // release: quadratic fall from the level at key off in the release time
    const rel = reports.filter((r) => r.voices[0]?.stage === 'release' && r.voices[0].level > 0.01);
    expect(rel.length).toBeGreaterThan(10);
    const errs = rel.map((r) => Math.abs(levelAt(amp.points, amp.releaseAt + (r.t - off)) - r.voices[0].level));
    expect(Math.max(...errs), 'release level, absolute error').toBeLessThan(0.03);
  });

  it('the time law: parameter 0 is 1 ms, 1 is 5 s, 0.5 is 1.251 s', () => {
    expect(wsEnvMs(0)).toBe(1);
    expect(wsEnvMs(1)).toBe(5001);
    expect(wsEnvMs(0.5)).toBe(1251);
  });
});

describe('Slaughter filter against the engine', () => {
  it('the reported filter frequency is the cutoff law applied to the reported modulation envelope', async () => {
    const rig = await wsRig('slaughter');
    const config = { ...DEFAULT_SLAUGHTER_CONFIG, cutoff: 0.4, filterEnvAmount: 0.85, filterAttack: 0.2, filterDecay: 0.25, filterSustain: 0.3 };
    await configure(rig, SlaughterParamIndex, DEFAULT_SLAUGHTER_CONFIG, config);
    await noteOn(rig);
    const { reports } = await rig.render(1.2);
    const errs = reports.flatMap((r) => (r.voices[0] && r.voices[0].stage !== 'off' ? [relErr(r.voices[0].cutoff, slaughterFilterHz(getter(config), r.voices[0].filterLevel))] : []));
    expect(errs.length).toBeGreaterThan(20);
    expect(Math.max(...errs), 'filter frequency, relative error').toBeLessThan(0.002);
  });

  const centres = [100, 200, 400, 800, 1600, 3200, 6400, 10000];
  /** Noise through the filter: the output spectrum is the squared response (the level offset is the unknown gain). */
  async function spectrum(config: Partial<SlaughterConfig>): Promise<number[]> {
    const rig = await wsRig('slaughter');
    // oscillator 1 off (index 2), noise level 1 (index 15); filter modulation neutral
    await configure(rig, SlaughterParamIndex, DEFAULT_SLAUGHTER_CONFIG, { ampSustain: 1, ampAttack: 0, ampDecay: 0, filterEnvAmount: 0.5, ...config }, { 2: 0, 15: 1 });
    await noteOn(rig);
    const { audio } = await rig.render(3.0);
    return bandPowersDb(audio.subarray(SAMPLE_RATE), centres);
  }
  it.each([
    [0, 0.45, 0.3], [0, 0.6, 0.8], [0.34, 0.5, 0.3], [0.5, 0.5, 0.6], [0.67, 0.4, 0.3], [1, 0.55, 0.5],
  ] as const)('filter type %f cutoff %f resonance %f: the response shape matches the model (dB, up to the overall gain)', async (typeParam, cutoff, resonance) => {
    const measured = await spectrum({ filterType: typeParam, cutoff, resonance });
    const type = wsFilterType(typeParam);
    const freq = wsParamToHz(cutoff);
    const model = centres.map((hz) => slaughterFilterDb(type, freq, 1 - resonance, hz, SAMPLE_RATE));
    // compare after removing the common level, over bands where the model is above -45 dB
    const use = centres.map((_, i) => i).filter((i) => model[i] > -45);
    const offset = use.reduce((s, i) => s + (measured[i] - model[i]), 0) / use.length;
    const diffs = use.map((i) => measured[i] - offset - model[i]);
    expect(use.length).toBeGreaterThanOrEqual(4);
    expect(Math.max(...diffs.map(Math.abs)), 'measured minus modelled level, dB').toBeLessThan(1.6);
    expect(slaughterCornerHz(freq, SAMPLE_RATE)).toBeGreaterThan(0);
  });
});

describe('WaveSabre oscillators against the engine', () => {
  const corr = (a: number[], b: number[]): number => {
    const mean = (x: number[]) => x.reduce((p, q) => p + q, 0) / x.length;
    const [ma, mb] = [mean(a), mean(b)];
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < a.length; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
    return sab / Math.sqrt(saa * sbb);
  };

  it.each([[0, 0.3], [0.5, 0.3], [1, 0.3], [1, 0.5]] as const)('Slaughter waveform morph %f, pulse width %f: one cycle correlates with the model', async (morph, pulseWidth) => {
    const rig = await wsRig('slaughter');
    // filter open (low-pass at the top, no resonance), envelope at full sustain, a low note so the band-limiting is not in the way
    await configure(rig, SlaughterParamIndex, DEFAULT_SLAUGHTER_CONFIG, { waveform: morph, pulseWidth, cutoff: 1, resonance: 0, filterType: 0, ampAttack: 0, ampDecay: 0, ampSustain: 1, filterEnvAmount: 0.5 });
    await noteOn(rig, 48);
    const { audio } = await rig.render(1.0);
    const period = SAMPLE_RATE / (440 * Math.pow(2, (48 - 69) / 12));
    const from = Math.floor(SAMPLE_RATE * 0.5);
    const measured = Array.from(audio.subarray(from, from + Math.round(period * 4)));
    let best = -1;
    for (let lag = 0; lag < period; lag += 0.5) {
      const model = measured.map((_, i) => slaughterWave((i + lag) / period, morph, pulseWidth));
      best = Math.max(best, corr(measured, model));
    }
    expect(best, 'waveform correlation (best alignment)').toBeGreaterThan(0.97);
  });

  it.each([
    [{ osc1Coarse: 0, osc2Coarse: 0.0625, fmAmount: 0.6 }],
    [{ osc1Coarse: 0.0625, osc2Coarse: 0.1, fmAmount: 0.4, osc1Waveform: 1 }],
  ] as const)('Falcon FM voice %o: one cycle of the carrier correlates with the replay', async (patch) => {
    const config = { ...DEFAULT_FALCON_CONFIG, attack1: 0, attack2: 0, decay1: 0, decay2: 0, sustain1: 1, sustain2: 1, feedback: 0, ...patch } as FalconConfig;
    const rig = await wsRig('falcon');
    await configure(rig, FalconParamIndex, DEFAULT_FALCON_CONFIG, config);
    await noteOn(rig, 60);
    const { audio } = await rig.render(1.0);
    const noteHz = 440 * Math.pow(2, (60 - 69) / 12);
    const carrierPeriod = SAMPLE_RATE / (noteHz * falconRatio(config.osc1Coarse, config.osc1Fine));
    const from = Math.floor(SAMPLE_RATE * 0.5);
    const measured = Array.from(audio.subarray(from, from + Math.round(carrierPeriod * 3)));
    const model = falconWaveform(getter(config), 1, 1, SAMPLE_RATE, noteHz, 3, measured.length).map((p) => p[1]);
    // the engine's voice phase is random: find the alignment of the replay
    let best = -1;
    for (let lag = 0; lag < Math.round(carrierPeriod * 4); lag++) best = Math.max(best, corr(measured.slice(0, measured.length - 0), model.map((_, i) => model[(i + lag) % model.length])));
    expect(best, 'FM waveform correlation (best alignment)').toBeGreaterThan(0.9);
  });

  it('the Falcon ratio law: 1 + floor(coarse * 32.99) + cubed fine', () => {
    expect(falconRatio(0, 0.5)).toBe(1);
    expect(falconRatio(0.04, 0.5)).toBe(2);
    expect(falconRatio(1, 0.5)).toBe(33);
    expect(falconRatio(0, 1)).toBe(2);
    expect(falconRatio(0, 0)).toBe(0);
  });
});

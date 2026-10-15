/**
 * Tunefish curves against the real engine (worklet + WASM in Node): the parameter table against the engine header, the
 * filters against the output of a held note, and the voice report against the knobs.
 */
import { describe as baseDescribe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from '@/engine/__tests__/workletHarness';
import { makeCustomRig, SAMPLE_RATE, bandPowersDb, type Rig } from './wasmRig';
import { TunefishParam, DEFAULT_TUNEFISH, TUNEFISH_CONFIG_PARAM, tunefishConfigToParams, type TunefishInstrumentConfig } from '@typedefs/tunefishInstrument';
import { tunefishFilterCoefficients, tunefishCutoffHz, type TunefishFilterKind } from '../tunefishCurves';
import { zMagnitudeDb } from '../wasmSubtractiveModels';

const HEADER = resolve(ROOT, 'third-party/tunefish/src/tunefish4/Source/synth/tf4.hpp');
// third-party/tunefish is a pinned upstream clone, absent from a bare checkout: without its header these tests skip.
const describe = existsSync(HEADER) ? baseDescribe : baseDescribe.skip;

async function tunefishRig(): Promise<Rig> {
  const wasmBinary = new Uint8Array(readFileSync(resolve(ROOT, 'public/tunefish/TunefishSynth.wasm')));
  const jsCode = readFileSync(resolve(ROOT, 'public/tunefish/TunefishSynth.js'), 'utf8');
  return makeCustomRig(
    'public/tunefish/Tunefish.worklet.js',
    (deliver) => deliver({ type: 'init', data: { wasmBytes: { wasmBinary, jsCode } } }),
    (posted) => posted.some((p) => p.type === 'ready'),
  );
}
/** Engine parameters the config does not carry: the wrapper starts every one of them at 0.5, which routes the modulation matrix at random. */
function engineParamNames(): string[] {
  const body = /enum eTfParam\s*\{([\s\S]*?)\};/.exec(readFileSync(HEADER, 'utf8'))![1];
  return body.split(',').map((n) => n.trim()).filter(Boolean);
}
async function configure(rig: Rig, config: Partial<TunefishInstrumentConfig>): Promise<void> {
  // empty modulation matrix: source none, target none, depth 0
  const matrix: Record<number, number> = {};
  engineParamNames().forEach((name, i) => { if (name.startsWith('TF_MM')) matrix[i] = 0; });
  await rig.send({ type: 'setParameters', data: { params: { ...matrix, ...tunefishConfigToParams({ ...DEFAULT_TUNEFISH, ...config }) } } });
  await rig.send({ type: 'watchVoices', on: true });
}
const quiet: Partial<TunefishInstrumentConfig> = {
  chorusGain: 0, chorusRate: 0, chorusDepth: 0, delayLeft: 0, delayRight: 0, delayDecay: 0, reverbWet: 0, flangerWet: 0, formantWet: 0, distortAmount: 0,
  eqLow: 0.5, eqMid: 0.5, eqHigh: 0.5, genModulation: 0, genUnisono: 0, genDetune: 0, genSlop: 0, genDrive: 0, genGlide: 0,
};

describe('Tunefish parameter table', () => {
  it.skipIf(!existsSync(HEADER))('every TunefishParam index is the engine enum index of the same name (the knobs reach the parameters the layout says)', () => {
    const header = readFileSync(HEADER, 'utf8');
    const body = /enum eTfParam\s*\{([\s\S]*?)\};/.exec(header)![1];
    const names = body.split(',').map((n) => n.trim()).filter(Boolean);
    for (const [key, index] of Object.entries(TunefishParam)) {
      if (key === 'PARAM_COUNT') expect(index).toBe(names.indexOf('TF_PARAM_COUNT'));
      else expect(names[index], `TunefishParam.${key} = ${index}`).toBe(`TF_${key}`);
    }
  });

  it('the config reaches the engine: the band-pass and notch cutoff knobs show up in the voice report', async () => {
    const rig = await tunefishRig();
    await configure(rig, { ...quiet, lpFilterOn: 1, lpFilterCutoff: 0.5, hpFilterOn: 1, hpFilterCutoff: 0.2, bpFilterOn: 1, bpFilterCutoff: 0.3, ntFilterOn: 1, ntFilterCutoff: 0.7 });
    await rig.send({ type: 'noteOn', data: { note: 60, velocity: 100 } });
    const { reports } = await rig.render(0.3);
    const v = reports.at(-1)!.voices[0];
    expect(v.cutoff).toBeCloseTo(0.5, 5);
    expect(v.extra[0]).toBeCloseTo(0.2, 5);
    expect(v.extra[1]).toBeCloseTo(0.3, 5);
    expect(v.extra[2]).toBeCloseTo(0.7, 5);
  });

  it('every config key has a distinct engine parameter', () => {
    const indices = Object.values(TUNEFISH_CONFIG_PARAM);
    expect(new Set(indices).size).toBe(indices.length);
  });
});

describe('Tunefish filter responses against the engine output', () => {
  const centres = [150, 300, 600, 1000, 1600, 2500, 4000, 6000, 9000];
  /** Noise through the voice filters: the output spectrum is the filter's squared response. */
  async function spectrum(config: Partial<TunefishInstrumentConfig>): Promise<number[]> {
    const rig = await tunefishRig();
    await configure(rig, {
      ...quiet, genVolume: 0, noiseAmount: 1, noiseFreq: 0.5, noiseBw: 1, globalGain: 0.5,
      lpFilterOn: 0, hpFilterOn: 0, bpFilterOn: 0, ntFilterOn: 0, ...config,
    });
    await rig.send({ type: 'noteOn', data: { note: 60, velocity: 100 } });
    const { audio } = await rig.render(3.0);
    return bandPowersDb(audio.subarray(SAMPLE_RATE), centres);
  }
  const modelDb = (kind: TunefishFilterKind, cutoff: number, q: number): number[] => {
    const c = tunefishFilterCoefficients(kind, cutoff, q, SAMPLE_RATE);
    return centres.map((f) => zMagnitudeDb(c.b, c.a, f, SAMPLE_RATE)); // 10 log10 of the power is the magnitude in dB
  };

  it.each([
    ['lp', 'lpFilterOn', 'lpFilterCutoff', 'lpFilterResonance', 0.35, 0.3],
    ['lp', 'lpFilterOn', 'lpFilterCutoff', 'lpFilterResonance', 0.55, 0.6],
    ['hp', 'hpFilterOn', 'hpFilterCutoff', 'hpFilterResonance', 0.3, 0.3],
    ['hp', 'hpFilterOn', 'hpFilterCutoff', 'hpFilterResonance', 0.5, 0.6],
    ['bp', 'bpFilterOn', 'bpFilterCutoff', 'bpFilterQ', 0.25, 0.5],
    ['bp', 'bpFilterOn', 'bpFilterCutoff', 'bpFilterQ', 0.4, 0.3],
    ['nt', 'ntFilterOn', 'ntFilterCutoff', 'ntFilterQ', 0.2, 0.5],
    ['nt', 'ntFilterOn', 'ntFilterCutoff', 'ntFilterQ', 0.35, 0.2],
  ] as const)('%s response (cutoff %f, q %f): level against the unfiltered noise matches the model (dB)', async (kind, on, cutoffKey, qKey, cutoff, q) => {
    const flat = await spectrum({});
    const reference = flat.reduce((x, y) => x + y, 0) / flat.length;
    const measured = (await spectrum({ [on]: 1, [cutoffKey]: cutoff, [qKey]: q })).map((v) => v - reference);
    const modelled = modelDb(kind, cutoff, q);
    // away from the sharpest peak and deepest null, where a 15 % wide band averages over the feature
    const diffs = centres.flatMap((_, i) => (modelled[i] > -30 && modelled[i] < 12 ? [measured[i] - modelled[i]] : []));
    expect(diffs.length, 'bands compared').toBeGreaterThanOrEqual(4);
    // The engine's noise source is unseeded, so each run measures a slightly different band power: 2.5 dB bounds the run-to-run spread (about 1.2-1.7 dB observed).
    expect(Math.max(...diffs.map(Math.abs)), 'measured minus modelled level, dB').toBeLessThan(2.5);
  });

  it('the cutoff mapping: parameter 0 is 30 Hz, 1 is 20 kHz for low-pass and notch and 10 kHz for high-pass and band-pass', () => {
    expect(tunefishCutoffHz('lp', 0)).toBe(30);
    expect(tunefishCutoffHz('lp', 1)).toBe(20030);
    expect(tunefishCutoffHz('hp', 1)).toBe(10030);
    expect(tunefishCutoffHz('bp', 0.5)).toBeCloseTo(2530, 6);
    expect(tunefishCutoffHz('nt', 0.5)).toBeCloseTo(5030, 6);
  });
});

/**
 * raffoCurves.ts - what the Raffo Minimoog engine does with the editor's knobs (raffo-wasm/src/raffo_standalone.cpp),
 * as curves. Layout values are the raw engine parameters (attack 10..1000 etc.); every formula names its source.
 *
 * Units, verified against the code (the layout labels say "ms" for the attack/decay knobs; they are not):
 *  - attack = (knob + 2) * 100 SAMPLES, decay = knob * 100 + 0.1 SAMPLES (macros ATTACK / DECAY, cpp:12-13), so the knob
 *    10 at 48 kHz is 25 ms and the knob 1000 is 2.09 s; the filter envelope uses the same macros.
 *  - sustain = knob^2 for the amplitude envelope, knob (no square) for the filter envelope (cpp:14, 17).
 *  - release is not a time: each render chunk multiplies the envelope counter by 1.3^(-500^-R * n / 256) + 0.00052
 *    (render(), cpp:219-222). Above R = 0.89 that factor exceeds 1 and the counter never reaches zero: the note
 *    hangs. The chunk n is the process() block, 128 samples in an AudioWorklet.
 *  - level = quadratic ease: attack 1 - ((c - a) / a)^2, decay (c - a - d)^2 (1 - s) / d^2 + s (envelope(), cpp:62).
 *  - the filter cutoff is cutoff * filterEnvelope + 100 Hz (runEqualizer(), cpp:244).
 *
 * The "filter" is what the code computes, not what its comments intend: equalizer() (cpp:67) feeds its first stage's
 * feedback taps from the INPUT history (prev[3] = temp, the input sample), so the first stage is a three-tap FIR with
 * the low-pass coefficients, and the peaking stage reads the input history too. The response below evaluates that
 * transfer function exactly:
 *   H(z) = [b0p * H1(z) + b1p z^-1 + b2p z^-2] / (1 + a1p z^-1 + a2p z^-2),
 *   H1(z) = b0 + (2 b0 + 2 cos w0 / a0) z^-1 + (b0 - (1 - alpha) / a0) z^-2.
 */
import type { CurveDescriptor } from '@/types/synthPanel';
import {
  audioSampleRate, envelopeDomain, envelopeMarkerX, holdFor, num, voiceMarker, zResponsePoints,
  FILTER_DB_MAX, FILTER_DB_MIN, type StagedEnvelope,
} from './wasmSubtractiveModels';
import { fmtHz, fmtMs } from './commonCurveModels';

export const RAFFO_SYNTH_TYPE = 'RaffoSynth';
/** The process() block the worklet renders in; render() chunks by min(256, frames). */
export const RAFFO_CHUNK = 128;
/** The longest release drawn (the counter can hang forever). */
const RELEASE_CAP_SECONDS = 20;

type Get = (key: string) => number;

// ---- envelope law ---------------------------------------------------------------------------------------

/** envelope() in cpp:62, `count` in samples. */
export function raffoEnvelopeLevel(count: number, a: number, d: number, s: number): number {
  if (count > a + d) return s;
  if (count < a) return -((count - a) * (count - a)) / (a * a) + 1;
  return ((count - a - d) * (count - a - d) * (1 - s)) / (d * d) + s;
}
/** inv_envelope() in cpp:70: the counter value inside the attack that has level `env`. */
export const raffoInverseAttack = (env: number, a: number): number => a - Math.sqrt(-a * a * (env - 1));

export const raffoAttackSamples = (knob: number): number => (knob + 2) * 100;
export const raffoDecaySamples = (knob: number): number => knob * 100 + 0.1;

/** One render chunk of the release: the counter after `n` samples (render(), cpp:219). */
export function raffoReleaseStep(count: number, releaseKnob: number, n = RAFFO_CHUNK): number {
  return Math.trunc(count * (Math.pow(1.3, (-Math.pow(500, -releaseKnob) * n) / 256) + 0.00052));
}
/** The release knob above which the counter no longer falls (factor >= 1 for a full 128-sample chunk). */
export function raffoReleaseHangs(releaseKnob: number): boolean {
  return Math.pow(1.3, (-Math.pow(500, -releaseKnob) * RAFFO_CHUNK) / 256) + 0.00052 >= 1;
}

interface EnvelopeKnobs { attack: number; decay: number; sustain: number; release: number }

/**
 * Staged envelope for the knobs: the held part is the counter running at one sample per sample; the release is the
 * engine's chunked counter decay replayed from the counter value noteOff() sets.
 */
export function raffoStagedEnvelope(k: EnvelopeKnobs, fs: number, hold?: number): StagedEnvelope {
  const a = raffoAttackSamples(k.attack);
  const d = raffoDecaySamples(k.decay);
  const attackEnd = a / fs;
  const decayEnd = (a + d) / fs;
  const releaseAt = decayEnd + (hold ?? holdFor(attackEnd, decayEnd - attackEnd));
  const points: Array<[number, number]> = [];
  const level = (c: number): number => raffoEnvelopeLevel(c, a, d, k.sustain);
  for (let i = 0; i <= 40; i++) points.push([(attackEnd * i) / 40, level((a * i) / 40)]);
  for (let i = 1; i <= 40; i++) points.push([attackEnd + ((decayEnd - attackEnd) * i) / 40, level(a + (d * i) / 40)]);
  points.push([releaseAt, k.sustain]);
  let count = Math.max(0, Math.trunc(raffoInverseAttack(k.sustain, a)));
  let t = releaseAt;
  const stepSeconds = RAFFO_CHUNK / fs;
  const limit = releaseAt + RELEASE_CAP_SECONDS;
  const stride = Math.max(1, Math.floor(0.01 / stepSeconds));
  let i = 0;
  while (count > 0 && t < limit) {
    count = raffoReleaseStep(count, k.release);
    t += stepSeconds;
    if (++i % stride === 0 || count === 0) points.push([t, level(count)]);
  }
  if (count > 0) points.push([limit, level(count)]);
  return { points, attackEnd, decayEnd, releaseAt, total: points[points.length - 1][0] };
}

export const raffoAmpKnobs = (get: Get): EnvelopeKnobs => ({
  attack: num(get('attack'), 10), decay: num(get('decay')), sustain: num(get('sustain'), 0.8) ** 2, release: num(get('release'), 0.4),
});
export const raffoFilterKnobs = (get: Get): EnvelopeKnobs => ({
  attack: num(get('filterAttack')), decay: num(get('filterDecay')), sustain: num(get('filterSustain'), 0.7), release: num(get('filterRelease'), 0.5),
});

// ---- filter ---------------------------------------------------------------------------------------------

/** Transfer function b(z)/a(z) the equalizer computes for a cutoff in Hz (cpp:244-268, structure in the file comment). */
export function raffoFilterCoefficients(cutoffHz: number, resonanceDb: number, fs: number): { b: number[]; a: number[] } {
  const w0 = (2 * Math.PI * cutoffHz) / fs;
  const alpha = Math.sin(w0) / 4;
  const cosw0 = Math.cos(w0);
  const lpfA0 = 1 + alpha;
  const lpfA1 = (-2 * cosw0) / lpfA0;
  const lpfA2 = (1 - alpha) / lpfA0;
  const lpfB1 = (1 - cosw0) / lpfA0;
  const lpfB0 = lpfB1 / 2;
  const gain = Math.pow(10, resonanceDb / 20);
  const pw0 = (2 * Math.PI * cutoffHz * 0.9) / fs;
  const pAlpha = Math.sin(pw0) / 4;
  const cosP = Math.cos(pw0);
  const pA0 = 1 + pAlpha / gain;
  const pA1 = (-2 * cosP) / pA0;
  const pA2 = (1 - pAlpha / gain) / pA0;
  const pB0 = (1 + pAlpha * gain) / pA0;
  const pB1 = (-2 * cosP) / pA0;
  const pB2 = (1 - pAlpha * gain) / pA0;
  // first stage: FIR from the input history (psuma2 = -lpfA2 on x[n-2], psuma3 = -lpfA1 on x[n-1])
  const h1 = [lpfB0, 2 * lpfB0 - lpfA1, lpfB0 - lpfA2];
  return { b: [pB0 * h1[0], pB0 * h1[1] + pB1, pB0 * h1[2] + pB2], a: [1, pA1, pA2] };
}

export const raffoCutoffHz = (cutoffKnob: number, filterEnvelope: number): number => cutoffKnob * filterEnvelope + 100;

/** Responses at the envelope's open (peak) and sustain levels. */
export function raffoFilterSeries(get: Get, fs: number): Array<Array<[number, number]>> {
  const cutoff = num(get('filterCutoff'), 3000);
  const res = num(get('filterResonance'), 3);
  const sustain = num(get('filterSustain'), 0.7);
  return [sustain, 1].map((env) => {
    const c = raffoFilterCoefficients(raffoCutoffHz(cutoff, env), res, fs);
    return zResponsePoints(c.b, c.a, fs);
  });
}

// ---- oscillators ----------------------------------------------------------------------------------------

/** The four oscillator shapes by engine wave index (render() cpp:231-247; index 4 plays nothing). */
export function raffoWaveValue(wave: number, phase: number): number {
  const f = phase - Math.floor(phase);
  switch (Math.round(wave)) {
    case 0: return 4 * (Math.abs((((f + 0.25) % 1) - 0.5)) - 0.25); // ondaTriangular
    case 1: return 2 * f - 1; // ondaSierra (rising saw)
    case 2: return 2 * (f - 0.5 < 0 ? 1 : 0) - 1; // ondaCuadrada
    case 3: return 2 * (f - 0.2 < 0 ? 1 : 0) - 1; // ondaPulso (20% duty)
    default: return 0;
  }
}
/** Oscillator frequency relative to the key's base: 2^range * 2^(tune/12) (render(), cpp:226). */
export const raffoOscRatio = (range: number, tuning: number): number => Math.pow(2, range) * Math.pow(2, tuning / 12);

/** Sum of the enabled oscillators at their engine volumes, over `cycles` periods of the slowest one. */
export function raffoOscillatorSeries(get: Get, cycles = 4, count = 360): Array<[number, number]> {
  const osc = [0, 1, 2, 3].map((i) => ({
    on: num(get(`oscButton${i}`)) === 1,
    wave: num(get(`wave${i}`)),
    vol: Math.sqrt((num(get('volume'), 7) * num(get(`vol${i}`))) / 100) / 4,
    ratio: raffoOscRatio(num(get(`range${i}`), 2), num(get(`tuning${i}`))),
  })).filter((o) => o.on && o.wave >= 0 && o.wave <= 3);
  if (osc.length === 0) return [[0, 0], [1, 0]];
  const slowest = Math.min(...osc.map((o) => o.ratio));
  const raw = Array.from({ length: count }, (_, i) => {
    const t = (i / (count - 1)) * cycles; // in periods of the slowest oscillator
    return osc.reduce((sum, o) => sum + o.vol * raffoWaveValue(o.wave, (t * o.ratio) / slowest), 0);
  });
  const peak = Math.max(1e-6, ...raw.map(Math.abs));
  return raw.map((y, i) => [i / (count - 1), y / peak]);
}

// ---- curve descriptors ----------------------------------------------------------------------------------

export function raffoCurves(sampleRate: () => number = audioSampleRate): Record<'amp' | 'filterEnv' | 'filter' | 'oscillator', CurveDescriptor> {
  const amp = (get: Get): StagedEnvelope => raffoStagedEnvelope(raffoAmpKnobs(get), sampleRate());
  const fenv = (get: Get): StagedEnvelope => raffoStagedEnvelope(raffoFilterKnobs(get), sampleRate());
  const readout = (k: EnvelopeKnobs, fs: number): string =>
    `A ${fmtMs((raffoAttackSamples(k.attack) / fs) * 1000)}  D ${fmtMs((raffoDecaySamples(k.decay) / fs) * 1000)}  S ${Math.round(k.sustain * 100)}%${raffoReleaseHangs(k.release) ? '  R never ends' : ''}`;
  return {
    amp: {
      label: 'Amplitude Envelope', xUnit: 's', yDomain: [0, 1], xDomain: (get) => envelopeDomain(amp(get)),
      series: (get) => [{ points: amp(get).points, fill: true }],
      readout: (get) => readout(raffoAmpKnobs(get), sampleRate()),
      marker: voiceMarker(RAFFO_SYNTH_TYPE, (v, get) => envelopeMarkerX(amp(get), v.stage, v.level)),
    },
    filterEnv: {
      label: 'Filter Envelope', xUnit: 's', yDomain: [0, 1], xDomain: (get) => envelopeDomain(fenv(get)),
      series: (get) => [{ points: fenv(get).points, fill: true }],
      readout: (get) => `${readout(raffoFilterKnobs(get), sampleRate())}  100 Hz to ${fmtHz(raffoCutoffHz(num(get('filterCutoff'), 3000), 1))}`,
      marker: voiceMarker(RAFFO_SYNTH_TYPE, (v, get) => envelopeMarkerX(fenv(get), v.filterStage, v.filterLevel)),
    },
    filter: {
      label: 'Filter Response', xScale: 'log', xDomain: [20, 20000], yDomain: [FILTER_DB_MIN, FILTER_DB_MAX], xUnit: 'Hz', yUnit: 'dB',
      series: (get) => {
        const [sustain, open] = raffoFilterSeries(get, sampleRate());
        return [{ points: sustain, color: 'rgba(255,255,255,0.35)' }, { points: open, fill: true }];
      },
      readout: (get) => `${fmtHz(raffoCutoffHz(num(get('filterCutoff'), 3000), num(get('filterSustain'), 0.7)))} to ${fmtHz(raffoCutoffHz(num(get('filterCutoff'), 3000), 1))}`,
      marker: voiceMarker(RAFFO_SYNTH_TYPE, (v) => (v.cutoff > 0 ? v.cutoff : null)),
    },
    oscillator: {
      label: 'Oscillators (4 cycles)', xDomain: [0, 1], yDomain: [-1, 1],
      series: (get) => [{ points: raffoOscillatorSeries(get) }],
    },
  };
}

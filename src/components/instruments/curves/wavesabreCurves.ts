/**
 * wavesabreCurves.ts - what the WaveSabre Falcon and Slaughter engines do with the editor's knobs (WaveSabreCore:
 * Envelope.cpp, Falcon.cpp, Slaughter.cpp, StateVariableFilter.cpp, Helpers.cpp), as curves. Layout values are the
 * 0..1 engine parameters (src/types/wavesabreInstrument.ts maps each config key to its engine index).
 *
 *  - Envelope time in ms is value^2 * 5000 + 1 (ScalarToEnvValue). The attack rises linearly; the decay eases to the
 *    sustain, level = f + sustain (1 - f) with f = (1 - t / decay)^2; the release falls as releaseValue (1 - t / release)^2.
 *  - Slaughter filter: a state-variable filter stepped twice per sample on the linearly interpolated input, outputs
 *    averaged (StateVariableFilter::Next). With u = z^-1 at the 2x step rate, f = 1.5 sin(pi freq / (2 fs)) and q = 1 -
 *    resonance, low = q f^2 u / D, high = q (1 - u)^2 / D, band = q f u (1 - u) / D, notch = low + high, D = (1 - u)^2 +
 *    q f u (1 - u) + f^2 u. The audio-rate response folds the two step-rate images: H(w) = 1/2 sum over theta in
 *    {w / 2, w / 2 + pi} of K A T e^(j theta), with K = e^-j theta (1 + cos theta) the interpolation and A =
 *    (1 + e^-j theta) / 2 the output average.
 *  - Slaughter cutoff: the filter is set to clamp(ParamToFrequency(cutoff) + modEnvelope * 19980 * (2 amount - 1), 0, 19980)
 *    every sample; ParamToFrequency is 20 + 19980 value^2.
 *  - Slaughter oscillator: a band-limited saw morphing into a pulse, -(1 - (1 - w) phase - w [phase >= pulseWidth]) once the
 *    voice's negative output gain is applied, with a 0.998 leaky integrator that removes the DC.
 *  - Falcon: oscillator 1 (modulator) feeds oscillator 2 (the carrier, the output): phase 2 += osc1Output * feedForward^2,
 *    each oscillator is sin(x) + waveform * (sin 3x / 3 + sin 5x / 5), the modulator is scaled by 13.25 and its envelope,
 *    feedback is value^2 / 2, and the frequency ratio is 1 + floor(coarse * 32.99) + ((fine - 0.5) * 2)^3.
 *
 * Not modelled (named): the unison voices and their detune and pan, vibrato and rise, the pitch envelope and the noise
 * oscillator, which the layouts do not expose, and Slaughter oscillators 2 and 3.
 */
import type { CurveDescriptor } from '@/types/synthPanel';
import {
  audioSampleRate, envelopeDomain, envelopeMarkerX, holdFor, logGrid, num, stagedEnvelope, voiceMarker,
  FILTER_DB_MAX, FILTER_DB_MIN, type StagedEnvelope,
} from './wasmSubtractiveModels';
import { fmtHz, fmtMs } from './commonCurveModels';

export const WS_FALCON_TYPE = 'WaveSabreFalcon';
export const WS_SLAUGHTER_TYPE = 'WaveSabreSlaughter';
type Get = (key: string) => number;

// ---- envelopes ------------------------------------------------------------------------------------------

/** Helpers::ScalarToEnvValue: the envelope time in ms for a 0..1 parameter. */
export const wsEnvMs = (param: number): number => param * param * 5000 + 1;

export interface WsEnvelopeKnobs { attack: number; decay: number; sustain: number; release: number }

export function wsEnvelope(k: WsEnvelopeKnobs): StagedEnvelope {
  const a = wsEnvMs(k.attack) / 1000;
  const d = wsEnvMs(k.decay) / 1000;
  const r = wsEnvMs(k.release) / 1000;
  const s = Math.min(1, Math.max(0, k.sustain));
  return stagedEnvelope({
    attackSeconds: a, decaySeconds: d, holdSeconds: holdFor(a, d), releaseSeconds: r,
    attack: (t) => t / a,
    decay: (t) => { const f = (1 - t / d) ** 2; return f + s * (1 - f); },
    release: (t) => s * (1 - t / r) ** 2,
  });
}
const knobs = (get: Get, a: string, d: string, s: string, r: string): WsEnvelopeKnobs => ({
  attack: num(get(a)), decay: num(get(d)), sustain: num(get(s), 1), release: num(get(r)),
});

// ---- Slaughter filter -----------------------------------------------------------------------------------

export const WS_FILTER_TYPES = ['Low-pass', 'High-pass', 'Band-pass', 'Notch'] as const;
/** ParamToStateVariableFilterType: floor(param * 3). */
export const wsFilterType = (param: number): number => Math.min(3, Math.max(0, Math.floor(param * 3)));
/** Helpers::ParamToFrequency. */
export const wsParamToHz = (param: number): number => 20 + (20000 - 20) * param * param;
/** Slaughter::SlaughterVoice::Run: the frequency handed to the filter for a modulation envelope value. */
export function slaughterFilterHz(get: Get, modEnv: number): number {
  const hz = wsParamToHz(num(get('cutoff'), 0.5)) + modEnv * (20000 - 20) * (num(get('filterEnvAmount'), 0.5) * 2 - 1);
  return Math.min(20000 - 20, Math.max(0, hz));
}

type C = [number, number];
const cmul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cadd = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
const cdiv = (a: C, b: C): C => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const cexp = (theta: number): C => [Math.cos(theta), Math.sin(theta)];

/** Step-rate transfer of the state-variable filter at step frequency theta. */
function svfStep(type: number, f: number, q: number, theta: number): C {
  const u = cexp(-theta);
  const oneMinusU: C = [1 - u[0], -u[1]];
  const sq = cmul(oneMinusU, oneMinusU);
  const qfUOneMinusU = cmul([q * f * u[0], q * f * u[1]], oneMinusU);
  const d = cadd(cadd(sq, qfUOneMinusU), [f * f * u[0], f * f * u[1]]);
  const low = cdiv([q * f * f * u[0], q * f * f * u[1]], d);
  const high = cdiv([q * sq[0], q * sq[1]], d);
  switch (type) {
    case 0: return low;
    case 1: return high;
    case 2: return cdiv(qfUOneMinusU, d);
    default: return cadd(low, high);
  }
}

/** |H| in dB of the whole oversampled filter at audio frequency `hz` (see the file comment). */
export function slaughterFilterDb(type: number, freqHz: number, q: number, hz: number, fs: number): number {
  const f = 1.5 * Math.sin((Math.PI * freqHz) / 2 / fs);
  const w = (2 * Math.PI * hz) / fs;
  let sum: C = [0, 0];
  for (const theta of [w / 2, w / 2 + Math.PI]) {
    const kernel = cmul(cexp(-theta), [1 + Math.cos(theta), 0]);
    const average: C = [0.5 * (1 + Math.cos(theta)), -0.5 * Math.sin(theta)];
    sum = cadd(sum, cmul(cmul(cmul(kernel, average), svfStep(type, f, q, theta)), cexp(theta)));
  }
  const mag = Math.hypot(sum[0], sum[1]) / 2;
  return mag <= 1e-9 ? FILTER_DB_MIN : Math.max(FILTER_DB_MIN, 20 * Math.log10(mag));
}

/** Where the filter's response bends, in Hz, for the frequency the engine set: the SVF's analogue corner. */
export const slaughterCornerHz = (freqHz: number, fs: number): number => (1.5 * Math.sin((Math.PI * freqHz) / 2 / fs) * 2 * fs) / (2 * Math.PI);

export function slaughterFilterSeries(get: Get, fs: number, modEnv: number): Array<[number, number]> {
  const type = wsFilterType(num(get('filterType')));
  const q = 1 - num(get('resonance'), 0.3);
  const freq = slaughterFilterHz(get, modEnv);
  return logGrid().filter((hz) => hz < fs / 2).map((hz) => [hz, slaughterFilterDb(type, freq, q, hz, fs)] as [number, number]);
}

// ---- oscillators ----------------------------------------------------------------------------------------

/**
 * One sample of the Slaughter oscillator (before the DC is taken out) at a phase in cycles. The voice scales its output
 * by amp = -16 * VolumeToScalar(masterLevel) (Slaughter.cpp Run), a negative number, so the saw as heard rises and the
 * pulse is low for the first `pulseWidth` of the cycle.
 */
export const slaughterWave = (phase: number, morph: number, pulseWidth: number): number => {
  const p = phase - Math.floor(phase);
  return -(1 - (1 - morph) * p - (p >= pulseWidth ? morph : 0));
};

/** Slaughter oscillator over `cycles` periods; zero-mean, scaled to peak 1. */
export function slaughterOscillatorSeries(get: Get, cycles = 3, count = 300): Array<[number, number]> {
  const w = num(get('waveform'));
  const pw = num(get('pulseWidth'), 0.5);
  const raw = Array.from({ length: count }, (_, i) => slaughterWave((i / (count - 1)) * cycles, w, pw));
  const mean = raw.reduce((a, b) => a + b, 0) / raw.length;
  const centred = raw.map((y) => y - mean);
  const peak = Math.max(1e-6, ...centred.map(Math.abs));
  return centred.map((y, i) => [i / (count - 1), y / peak]);
}

/** Falcon ratioScalar(): 1 + floor(coarse * 32.99) + ((fine - 0.5) * 2)^3. */
export function falconRatio(coarse: number, fine: number): number {
  const fineBase = (fine - 0.5) * 2;
  return 1 + Math.floor(coarse * 32.99) + fineBase ** 3;
}
const FALCON_MODULATOR_GAIN = 13.25;
const square35 = (x: number): number => Math.sin(3 * x) / 3 + Math.sin(5 * x) / 5;

/**
 * The carrier output of one Falcon voice over `cycles` carrier periods at `fs`, replaying FalconVoice::Run for the given
 * envelope values (1 = the envelope peak). Config keys: osc1 = carrier, osc2 = modulator (see wavesabreInstrument.ts).
 */
export function falconWaveform(get: Get, modulatorEnvelope: number, carrierEnvelope: number, fs = 48000, noteHz = 261.63, cycles = 3, count = 360): Array<[number, number]> {
  const rCarrier = falconRatio(num(get('osc1Coarse')), num(get('osc1Fine'), 0.5));
  const rModulator = falconRatio(num(get('osc2Coarse')), num(get('osc2Fine'), 0.5));
  const wCarrier = num(get('osc1Waveform'));
  const wModulator = num(get('osc2Waveform'));
  const feedback = (num(get('feedback')) ** 2) / 2;
  const feedForward = num(get('fmAmount')) ** 2;
  // a ratio of 0 (coarse 0 with the fine knob at 0) stops the oscillator: nothing to draw but silence
  if (rCarrier < 0.05 || rModulator < 0) return [[0, 0], [1, 0]];
  const periodSamples = fs / (noteHz * rCarrier);
  const total = Math.round(periodSamples * (cycles + 2));
  let p1 = 0, p2 = 0, o1 = 0, o2 = 0;
  const out: number[] = [];
  for (let n = 0; n < total; n++) {
    const in1 = (p1 / fs) * 2 * Math.PI + o1 * feedback;
    o1 = (Math.sin(in1) + square35(in1) * wModulator) * modulatorEnvelope * FALCON_MODULATOR_GAIN;
    const in2 = (p2 / fs) * 2 * Math.PI + o1 * feedForward;
    o2 = (Math.sin(in2) + square35(in2) * wCarrier) * carrierEnvelope;
    out.push(o2);
    p1 += noteHz * rModulator;
    p2 += noteHz * rCarrier;
  }
  const start = Math.round(periodSamples * 2);
  const window = out.slice(start, start + Math.round(periodSamples * cycles));
  const peak = Math.max(1e-6, ...window.map(Math.abs));
  return Array.from({ length: count }, (_, i) => [i / (count - 1), window[Math.min(window.length - 1, Math.round((i / (count - 1)) * (window.length - 1)))] / peak] as [number, number]);
}

// ---- curve descriptors ----------------------------------------------------------------------------------

const readoutOf = (k: WsEnvelopeKnobs): string =>
  `A ${fmtMs(wsEnvMs(k.attack))}  D ${fmtMs(wsEnvMs(k.decay))}  S ${Math.round(k.sustain * 100)}%  R ${fmtMs(wsEnvMs(k.release))}`;

function envelopeCurve(label: string, type: string, read: (get: Get) => WsEnvelopeKnobs, useFilterReport: boolean): CurveDescriptor {
  return {
    label, xUnit: 's', yDomain: [0, 1],
    xDomain: (get) => envelopeDomain(wsEnvelope(read(get))),
    series: (get) => [{ points: wsEnvelope(read(get)).points, fill: true }],
    readout: (get) => readoutOf(read(get)),
    marker: voiceMarker(type, (v, get) => (useFilterReport ? envelopeMarkerX(wsEnvelope(read(get)), v.filterStage, v.filterLevel) : envelopeMarkerX(wsEnvelope(read(get)), v.stage, v.level))),
  };
}

export function falconCurves(): Record<'carrier' | 'modulator' | 'waveform', CurveDescriptor> {
  return {
    // config attack1.. is the carrier (engine oscillator 2): the voice report's amplitude fields
    carrier: envelopeCurve('Carrier Envelope', WS_FALCON_TYPE, (g) => knobs(g, 'attack1', 'decay1', 'sustain1', 'release1'), false),
    modulator: envelopeCurve('Modulator Envelope', WS_FALCON_TYPE, (g) => knobs(g, 'attack2', 'decay2', 'sustain2', 'release2'), true),
    waveform: {
      label: 'FM Waveform (middle C, 3 cycles)', xDomain: [0, 1], yDomain: [-1, 1],
      series: (get) => [
        { points: falconWaveform(get, 1, 1), fill: false },
        { points: falconWaveform(get, num(get('sustain2'), 1), 1), color: 'rgba(255,255,255,0.35)' },
      ],
      readout: (get) => `carrier x${falconRatio(num(get('osc1Coarse')), num(get('osc1Fine'), 0.5)).toFixed(2)}  modulator x${falconRatio(num(get('osc2Coarse')), num(get('osc2Fine'), 0.5)).toFixed(2)}  index ${(num(get('fmAmount')) ** 2 * FALCON_MODULATOR_GAIN).toFixed(1)}`,
    },
  };
}

export function slaughterCurves(sampleRate: () => number = audioSampleRate): Record<'amp' | 'filterEnv' | 'filter' | 'oscillator', CurveDescriptor> {
  return {
    amp: envelopeCurve('Amplitude Envelope', WS_SLAUGHTER_TYPE, (g) => knobs(g, 'ampAttack', 'ampDecay', 'ampSustain', 'ampRelease'), false),
    filterEnv: envelopeCurve('Filter Envelope', WS_SLAUGHTER_TYPE, (g) => knobs(g, 'filterAttack', 'filterDecay', 'filterSustain', 'filterRelease'), true),
    filter: {
      label: 'Filter Response', xScale: 'log', xDomain: [20, 20000], yDomain: [FILTER_DB_MIN, FILTER_DB_MAX], xUnit: 'Hz', yUnit: 'dB',
      series: (get) => {
        const fs = sampleRate();
        const sustain = num(get('filterSustain'), 0.3);
        return [{ points: slaughterFilterSeries(get, fs, 0), color: 'rgba(255,255,255,0.35)' }, { points: slaughterFilterSeries(get, fs, sustain), fill: true }];
      },
      readout: (get) => `${WS_FILTER_TYPES[wsFilterType(num(get('filterType')))]}  ${fmtHz(slaughterFilterHz(get, 0))} to ${fmtHz(slaughterFilterHz(get, 1))}`,
      marker: voiceMarker(WS_SLAUGHTER_TYPE, (v) => (v.cutoff > 0 ? slaughterCornerHz(v.cutoff, sampleRate()) : null)),
    },
    oscillator: {
      label: 'Oscillator (3 cycles)', xDomain: [0, 1], yDomain: [-1, 1],
      series: (get) => [{ points: slaughterOscillatorSeries(get) }],
    },
  };
}


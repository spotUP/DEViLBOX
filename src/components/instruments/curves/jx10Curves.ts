/**
 * jx10Curves.ts - what the MDA JX10 engine does with the editor's knobs (mda-jx10-wasm/src/mdaJX10_standalone.cpp),
 * as curves. Layout values are the 24 normalised parameters (0..1). Every formula names its source line.
 *
 * Envelopes: a one-pole approach toward a target, `env += d * (target - env)`; the stage rate is
 * `d = 1 - exp(-exp(5.5 - 7.5 p) / Fs)` per sample (update(), cpp:117-121), i.e. a time constant of exp(7.5 p - 5.5)
 * seconds. The attack aims at 2 and the decay stage starts when the level passes 1 (process(), cpp:392-393), so the
 * attack is `2 - 2 exp(-R t)` and takes ln 2 / R. The filter envelope runs the same law once per KMAX + 1 samples
 * with a step coefficient built for KMAX samples (cpp:123-128, 398), so its rate is R * KMAX / (KMAX + 1).
 *
 * Filter: process() cpp:402-405 is a two-integrator loop that reduces exactly to
 *   H(z) = ff^2 (z^-1 + z^-2) / (1 - (2 - ff q - ff^2) z^-1 + (1 - ff q) z^-2),   q = (1 - resonance)^2,
 * so the response is evaluated from those coefficients, not from a biquad stand-in. ff = exp(filtf + filtenv * fenv
 * + lfo) / period, with the period of the note in samples (noteOn(), cpp:560-562): the filter follows the key.
 *
 * Not modelled (named): the soft limiter on f1 (cpp:407) and velocity (the curves assume velocity 100; at the default
 * VEL knob the velocity term is 0), the oscillator's DC high-pass (hpf = 0.997) and the noise mix.
 */
import type { CurveDescriptor } from '@/types/synthPanel';
import {
  audioSampleRate, envelopeDomain, envelopeMarkerX, holdFor, num, stagedEnvelope, voiceMarker, zResponsePoints,
  FILTER_DB_MAX, FILTER_DB_MIN, type StagedEnvelope,
} from './wasmSubtractiveModels';
import { fmtHz, fmtMs } from './commonCurveModels';

export const JX10_SYNTH_TYPE = 'MdaJX10';
export const JX10_KMAX = 32; // mdaJX10_standalone.h
export const JX10_SILENCE = 0.001;
export const JX10_REFERENCE_NOTE = 60;
export const JX10_REFERENCE_VELOCITY = 100;
const SEMITONE = 1.059463094359;
const TWOPI = 2 * Math.PI;

/** update(): the stage rate in 1/s for a time knob. */
export const jx10Rate = (p: number): number => Math.exp(5.5 - 7.5 * p);


// ---- amplitude envelope -------------------------------------------------------------------------------

/** Level at `t` seconds into the attack (starts at 2 * SILENCE, aims at 2). */
const attackLevel = (rate: number, t: number): number => 2 - (2 - 2 * JX10_SILENCE) * Math.exp(-rate * t);
export const jx10AttackSeconds = (p: number): number => Math.log((2 - 2 * JX10_SILENCE) / 1) / jx10Rate(p);

/** Seconds until a decaying level `from` falls below the voice's cut-off SILENCE at rate `rate`. */
const secondsToSilence = (from: number, rate: number): number => (from > JX10_SILENCE ? Math.log(from / JX10_SILENCE) / rate : 0);

/** release(): param 18 below 0.01 is a fixed 0.9 per sample (cpp:122). */
function releaseRate(pRel: number, fs: number): number {
  return pRel < 0.01 ? -Math.log(0.9) * fs : jx10Rate(pRel);
}

export function jx10AmpEnvelope(get: (key: string) => number, fs: number): StagedEnvelope {
  const aRate = jx10Rate(num(get('envAtt')));
  const dRate = jx10Rate(num(get('envDec')));
  const sus = Math.min(1, Math.max(0, num(get('envSus'), 1)));
  const rRate = releaseRate(num(get('envRel')), fs);
  const decaySeconds = sus >= 0.995 ? 0 : Math.log(50) / dRate;
  const attackSeconds = Math.log(2 - 2 * JX10_SILENCE) / aRate;
  return stagedEnvelope({
    attackSeconds, decaySeconds, holdSeconds: holdFor(attackSeconds, decaySeconds),
    releaseSeconds: secondsToSilence(sus, rRate),
    attack: (t) => Math.min(1, attackLevel(aRate, t)),
    decay: (t) => sus + (1 - sus) * Math.exp(-dRate * t),
    release: (t) => sus * Math.exp(-rRate * t),
  });
}

// ---- filter envelope ----------------------------------------------------------------------------------

/** The stepped filter envelope as a continuous rate (see the file comment). */
const filterEnvRate = (p: number): number => (jx10Rate(p) * JX10_KMAX) / (JX10_KMAX + 1);

export function jx10FilterEnvelope(get: (key: string) => number): StagedEnvelope {
  const aRate = filterEnvRate(num(get('vcfAtt')));
  const dRate = filterEnvRate(num(get('vcfDec')));
  const rRate = filterEnvRate(num(get('vcfRel')));
  const fsus = num(get('vcfSus')) ** 2;
  const attackSeconds = Math.log(2) / aRate;
  const decaySeconds = fsus >= 0.995 ? 0 : Math.log(50) / dRate;
  return stagedEnvelope({
    attackSeconds, decaySeconds, holdSeconds: holdFor(attackSeconds, decaySeconds),
    releaseSeconds: fsus > 0.01 ? Math.log(fsus / 0.01) / rRate : 0,
    attack: (t) => Math.min(1, 2 - 2 * Math.exp(-aRate * t)),
    decay: (t) => fsus + (1 - fsus) * Math.exp(-dRate * t),
    release: (t) => fsus * Math.exp(-rRate * t),
  });
}

// ---- filter -------------------------------------------------------------------------------------------

/** Period of a note in samples (noteOn(), cpp:560-562), before the engine's octave-doubling floor. */
export function jx10PeriodSamples(note: number, get: (key: string) => number, fs: number): number {
  const tuneExp = -23.376 - 2 * num(get('tuning'), 0.5) - 12 * Math.floor(num(get('octave'), 0.5) * 4.9);
  const tune = fs * Math.pow(SEMITONE, tuneExp);
  let p = tune * Math.exp(-0.05776226505 * note);
  while (p < 3) p += p;
  return p;
}

/** Resonance term q = (1 - resonance)^2 (update(), cpp:111). */
export const jx10Q = (get: (key: string) => number): number => (1 - num(get('vcfReso'))) ** 2;
/** Filter exponent without envelope: filtf = 8 freq - 1.5 (cpp:108). */
export const jx10FiltF = (get: (key: string) => number): number => 8 * num(get('vcfFreq')) - 1.5;
/** Filter envelope amount: 12 env - 6 (cpp:110). */
export const jx10FiltEnv = (get: (key: string) => number): number => 12 * num(get('vcfEnv')) - 6;

/** The per-sample step ff for exponent `e`, clamped to the engine's stability limit (cpp:399). */
export function jx10Ff(note: number, velocity: number, exponent: number, get: (key: string) => number, fs: number): number {
  const p10 = num(get('vcfVel'), 0.5);
  const filtvel = p10 < 0.05 ? 0 : 0.1 * p10 - 0.05;
  const fc = Math.exp(filtvel * (velocity - 64)) / jx10PeriodSamples(note, get, fs);
  const ff = Math.max(0.005, fc * Math.exp(exponent));
  return Math.min(ff, 1.97 - 0.85 * jx10Q(get));
}

/** z-domain coefficients of the filter for a step `ff` and `q` (derivation in the file comment). */
export function jx10FilterCoefficients(ff: number, q: number): { b: number[]; a: number[] } {
  const ffq = ff * q;
  return { b: [0, ff * ff, ff * ff], a: [1, -(2 - ffq - ff * ff), 1 - ffq] };
}

/** Corner frequency in Hz of a step ff: the pole angle of the denominator. */
export function jx10CornerHz(ff: number, q: number, fs: number): number {
  const ffq = ff * q;
  const r2 = 1 - ffq;
  if (r2 <= 0) return (ff * fs) / TWOPI;
  const cosT = (2 - ffq - ff * ff) / (2 * Math.sqrt(r2));
  if (cosT >= 1) return (ff * fs) / TWOPI;
  if (cosT <= -1) return fs / 2;
  return (Math.acos(cosT) * fs) / TWOPI;
}

/** Closed (envelope 0) and open (envelope 1) responses at the reference note. */
export function jx10FilterSeries(get: (key: string) => number, fs: number): Array<Array<[number, number]>> {
  const q = jx10Q(get);
  const closed = jx10Ff(JX10_REFERENCE_NOTE, JX10_REFERENCE_VELOCITY, jx10FiltF(get), get, fs);
  const open = jx10Ff(JX10_REFERENCE_NOTE, JX10_REFERENCE_VELOCITY, jx10FiltF(get) + jx10FiltEnv(get), get, fs);
  return [closed, open].map((ff) => { const c = jx10FilterCoefficients(ff, q); return zResponsePoints(c.b, c.a, fs); });
}

// ---- LFO ------------------------------------------------------------------------------------------------

/**
 * update(): LFO rate in Hz (cpp:105). The phase steps once per KMAX + 1 samples by a step built for KMAX samples
 * (cpp:105, 391), so the real rate is lfoHz * KMAX / (KMAX + 1): measured 2.385 Hz where exp(7 p - 4) says 2.460.
 */
export const jx10LfoHz = (get: (key: string) => number): number => (Math.exp(7 * num(get('lfoRate')) - 4) * JX10_KMAX) / (JX10_KMAX + 1);
/** update(): vibrato (or PWM) depth, a ratio on the oscillator period (cpp:103-104). */
export const jx10VibratoDepth = (get: (key: string) => number): number => 0.2 * (num(get('vibrato'), 0.5) - 0.5) ** 2;
/** True when the Vibrato knob is in the vibrato half; below 0.5 it drives pulse-width modulation of the second oscillator. */
export const jx10IsVibrato = (get: (key: string) => number): boolean => num(get('vibrato'), 0.5) >= 0.5;
/** update(): filter LFO depth as a natural-log offset of the cutoff (cpp:109). */
export const jx10FilterLfoDepth = (get: (key: string) => number): number => 2.5 * num(get('vcfLfo')) ** 2;

const LFO_POINTS = 96;
/** Two cycles of the LFO sine, scaled by `amount`; x is 0..1 over the two cycles. */
const lfoSeries = (amount: (s: number) => number): Array<[number, number]> =>
  Array.from({ length: LFO_POINTS }, (_, i) => { const x = i / (LFO_POINTS - 1); return [x, amount(Math.sin(2 * Math.PI * 2 * x))]; });

/** The pitch (vibrato) or detune (PWM) swing in cents: the period is multiplied by 1 + depth sin (cpp:363-365). */
export const jx10VibratoCents = (get: (key: string) => number, s: number): number => -1200 * Math.log2(1 + jx10VibratoDepth(get) * s);
/** The filter LFO swing in octaves of cutoff. */
export const jx10FilterLfoOctaves = (get: (key: string) => number, s: number): number => (jx10FilterLfoDepth(get) * s) / Math.LN2;

// ---- oscillator -----------------------------------------------------------------------------------------

/** Frequency of oscillator 2 relative to oscillator 1: 1.059463^(semi + 0.01 cent) (update(), cpp:95-98; detune = 1 / ratio). */
export function jx10OscRatio(get: (key: string) => number): number {
  const semi = Math.floor(48 * num(get('oscTune'), 0.25)) - 24;
  const c = 15.876 * num(get('oscFine'), 0.5) - 7.938;
  const cent = 0.1 * Math.floor(c * c * c);
  return Math.pow(SEMITONE, semi + 0.01 * cent);
}
/**
 * Oscillator output over `cycles` periods of oscillator 1: a falling bandlimited saw minus the second saw at the
 * detune ratio scaled by OSC MIX (process() cpp:384, `saw = ... + x - dc2 - y`; measured falling ramp).
 */
export function jx10OscillatorSeries(get: (key: string) => number, cycles = 4, count = 240): Array<[number, number]> {
  const mix = num(get('oscMix'));
  const ratio = jx10OscRatio(get);
  const saw = (phase: number): number => 1 - 2 * (phase - Math.floor(phase));
  const raw = Array.from({ length: count }, (_, i) => { const t = (i / (count - 1)) * cycles; return saw(t) - mix * saw(t * ratio); });
  const peak = Math.max(1e-6, ...raw.map(Math.abs));
  return raw.map((y, i) => [i / (count - 1), y / peak]);
}

// ---- curve descriptors ----------------------------------------------------------------------------------

const hz = (get: (key: string) => number, ff: number, fs: number): number => jx10CornerHz(ff, jx10Q(get), fs);

export function jx10Curves(sampleRate: () => number = audioSampleRate): Record<'amp' | 'filterEnv' | 'filter' | 'lfo' | 'filterLfo' | 'oscillator', CurveDescriptor> {
  const amp = (get: (key: string) => number): StagedEnvelope => jx10AmpEnvelope(get, sampleRate());
  return {
    amp: {
      label: 'Amplitude Envelope', xUnit: 's', yDomain: [0, 1], xDomain: (get) => envelopeDomain(amp(get)),
      series: (get) => [{ points: amp(get).points, fill: true }],
      readout: (get) => `A ${fmtMs(amp(get).attackEnd * 1000)}  D ${fmtMs((amp(get).decayEnd - amp(get).attackEnd) * 1000)}  S ${Math.round(num(get('envSus')) * 100)}%`,
      marker: voiceMarker(JX10_SYNTH_TYPE, (v, get) => envelopeMarkerX(amp(get), v.stage, v.level)),
    },
    filterEnv: {
      label: 'Filter Envelope', xUnit: 's', yDomain: [0, 1], xDomain: (get) => envelopeDomain(jx10FilterEnvelope(get)),
      series: (get) => [{ points: jx10FilterEnvelope(get).points, fill: true }],
      readout: (get) => `cutoff x${Math.exp(jx10FiltEnv(get)).toFixed(2)} at the peak`,
      marker: voiceMarker(JX10_SYNTH_TYPE, (v, get) => envelopeMarkerX(jx10FilterEnvelope(get), v.filterStage, v.filterLevel)),
    },
    filter: {
      label: 'Filter Response (middle C)', xScale: 'log', xDomain: [20, 20000], yDomain: [FILTER_DB_MIN, FILTER_DB_MAX], xUnit: 'Hz', yUnit: 'dB',
      series: (get) => {
        const [closed, open] = jx10FilterSeries(get, sampleRate());
        return [{ points: closed, color: 'rgba(255,255,255,0.35)' }, { points: open, fill: true }];
      },
      readout: (get) => {
        const f = (e: number) => fmtHz(hz(get, jx10Ff(JX10_REFERENCE_NOTE, JX10_REFERENCE_VELOCITY, e, get, sampleRate()), sampleRate()));
        return `${f(jx10FiltF(get))} to ${f(jx10FiltF(get) + jx10FiltEnv(get))}`;
      },
      marker: voiceMarker(JX10_SYNTH_TYPE, (v, get) => (v.cutoff > 0 ? hz(get, v.cutoff, sampleRate()) : null)),
    },
    lfo: {
      label: 'LFO', xDomain: [0, 1], yUnit: 'cents',
      yDomain: (get) => { const m = Math.max(1, Math.abs(jx10VibratoCents(get, 1)), Math.abs(jx10VibratoCents(get, -1))); return [-m, m]; },
      series: (get) => [{ points: lfoSeries((s) => jx10VibratoCents(get, s)) }],
      readout: (get) => `${jx10LfoHz(get).toFixed(2)} Hz  ${jx10IsVibrato(get) ? 'vibrato' : 'pulse width'}`,
      marker: voiceMarker(JX10_SYNTH_TYPE, (v) => v.lfoPhase / 2),
    },
    filterLfo: {
      label: 'Filter LFO', xDomain: [0, 1], yUnit: 'octaves',
      yDomain: (get) => { const m = Math.max(0.05, Math.abs(jx10FilterLfoOctaves(get, 1))); return [-m, m]; },
      series: (get) => [{ points: lfoSeries((s) => jx10FilterLfoOctaves(get, s)) }],
      readout: (get) => `${jx10LfoHz(get).toFixed(2)} Hz  +-${(jx10FilterLfoDepth(get) / Math.LN2).toFixed(2)} oct`,
      marker: voiceMarker(JX10_SYNTH_TYPE, (v, get) => (jx10FilterLfoDepth(get) > 0 ? v.lfoPhase / 2 : null)),
    },
    oscillator: {
      label: 'Oscillator (4 cycles)', xDomain: [0, 1], yDomain: [-1, 1],
      series: (get) => [{ points: jx10OscillatorSeries(get) }],
      readout: (get) => `osc 2 at x${jx10OscRatio(get).toFixed(3)}  mix ${Math.round(num(get('oscMix')) * 100)}%`,
    },
  };
}

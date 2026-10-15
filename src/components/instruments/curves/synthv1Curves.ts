/**
 * synthv1Curves.ts - what the synthv1 engine does with the editor's knobs (synthv1-wasm/src/synthv1.cpp,
 * synthv1_filter.h, synthv1_wave.cpp), as curves. Layout values are the raw engine parameters (0..1 knobs).
 *
 * Laws, verified against the code (file:line in synthv1-wasm/src):
 *  - Envelope (synthv1_env, synthv1.cpp:240): every stage runs `knob^2 * max_frames` frames, at least 0.5 ms (attack) or
 *    2 ms (decay, release); max_frames is 10000 ms * DCO ENVTIME (a parameter the layout does not expose, default 0.5, so
 *    5 s). Inside a stage the level is c1 * u * (2 - u) + c0 with u the stage's progress 0..1: an ease-out, not a line.
 *    Attack 0 to 1, decay 1 to the sustain level, release from the level at key off to 0.
 *  - Filter (process(), synthv1.cpp:2490): the value the filter receives is sigmoid_1(cutoff * env * (1 + LFO>cutoff * lfo))
 *    with env = 0.5 * (1 + amount * filter envelope), a smooth S-curve of the 0..1 knob product, NOT a frequency. What it
 *    means in Hz depends on the slope: 12 dB is Chamberlin's state variable filter run twice per sample (synthv1_filter1),
 *    24 dB the Stilson/Smith Moog ladder (synthv1_filter2), Biquad an RBJ filter at cutoff * fs / 2 (synthv1_filter3), and
 *    Formant a vowel bank. The responses below are the exact small-signal transfer functions of those loops (the ladder's
 *    cubic clip is ignored; it only bites at high levels). There is no key follow: the cutoff does not move with the note.
 *  - LFO (process(), synthv1.cpp:2385): frequency = BPM / (60.01 - rate * 60) Hz with BPM 180 unless set (a parameter the
 *    layout does not expose), so the RATE knob runs 3 Hz to 18 kHz. The shapes are synthv1_wave_lf tables (1024 points,
 *    unsmoothed): 0 Pulse, 1 Saw, 2 Sine, 3 Random, 4 Noise; Width bends them.
 *  - Oscillators: synthv1_wave tables (4096 points) smoothed by 24 passes of a running average starting at the first
 *    upward zero crossing, then centred and normalised; the voice starts at the last upward zero crossing (phase0).
 *
 * Not modelled (named): Random and Noise draw nothing (the table is pseudo-random per width, no stable picture), the
 * Formant slope, the filter envelope amount below zero (the layout cannot reach it), the LFO envelope, the ring
 * modulator, sync, detune and the oscillator balance.
 */
import type { CurveDescriptor } from '@/types/synthPanel';
import { VOICE_STAGES, type WasmVoice } from '@/engine/voiceStatus/wasmVoiceStatus';
import {
  audioSampleRate, envelopeDomain, envelopeMarkerX, holdFor, num, voiceMarker, logGrid,
  FILTER_DB_MAX, FILTER_DB_MIN, type StagedEnvelope,
} from './wasmSubtractiveModels';
import { fmtHz, fmtMs } from './commonCurveModels';

export const SYNTHV1_SYNTH_TYPE = 'SynthV1';
type Get = (key: string) => number;
export type SynthV1Page = 1 | 2;

/** DCO ENVTIME, the parameter that scales every envelope stage; the layout cannot set it (wasm default 0.5). */
export const SYNTHV1_ENV_TIME = 0.5;
export const SYNTHV1_MIN_ENV_MSECS = 0.5;
/** LFO tempo in beats per minute when the BPM key is absent (the wasm default, synthv1_param.cpp). */
export const SYNTHV1_LFO_BPM = 180;

// ---- envelope --------------------------------------------------------------------------------------------

export interface SynthV1EnvFrames { min1: number; min2: number; max: number }

/** updateEnvTimes_1(), synthv1.cpp:1252 (frames are whole numbers). */
export function synthv1EnvFrames(fs: number, envTime = SYNTHV1_ENV_TIME): SynthV1EnvFrames {
  const ms = 0.001 * fs;
  let msecs = 10000 * envTime;
  if (msecs < SYNTHV1_MIN_ENV_MSECS) msecs = SYNTHV1_MIN_ENV_MSECS * 4;
  const min1 = Math.trunc(ms * SYNTHV1_MIN_ENV_MSECS);
  return { min1, min2: min1 << 2, max: Math.trunc(ms * msecs) };
}

export type SynthV1Stage = 'attack' | 'decay' | 'release';
/** Frames of one stage for a knob value (synthv1_env::start / next / note_off). */
export function synthv1StageFrames(knob: number, stage: SynthV1Stage, fs: number): number {
  const f = synthv1EnvFrames(fs);
  const frames = Math.trunc(knob * knob * f.max);
  return Math.max(frames, stage === 'attack' ? f.min1 : f.min2);
}

/** The stage curve u * (2 - u), u in 0..1 (synthv1_env::State::tick). */
export const synthv1Ease = (u: number): number => u * (2 - u);

export interface SynthV1EnvKnobs { attack: number; decay: number; sustain: number; release: number }

/** Staged envelope drawing; `hold` seconds is how long the key stays down after the decay. */
export function synthv1StagedEnvelope(k: SynthV1EnvKnobs, fs: number, hold?: number): StagedEnvelope {
  const a = synthv1StageFrames(k.attack, 'attack', fs) / fs;
  const d = synthv1StageFrames(k.decay, 'decay', fs) / fs;
  const r = synthv1StageFrames(k.release, 'release', fs) / fs;
  const s = Math.min(1, Math.max(0, k.sustain));
  const attackEnd = a;
  const decayEnd = a + d;
  const releaseAt = decayEnd + (hold ?? holdFor(a, d));
  const total = releaseAt + r;
  const points: Array<[number, number]> = [];
  const steps = 48;
  for (let i = 0; i <= steps; i++) points.push([(a * i) / steps, synthv1Ease(i / steps)]);
  for (let i = 1; i <= steps; i++) points.push([a + (d * i) / steps, (s - 1) * synthv1Ease(i / steps) + 1]);
  points.push([releaseAt, s]);
  for (let i = 1; i <= steps; i++) points.push([releaseAt + (r * i) / steps, s - s * synthv1Ease(i / steps)]);
  return { points, attackEnd, decayEnd, releaseAt, total };
}

const prefix = (page: SynthV1Page, unit: 'dca' | 'dcf' | 'dco' | 'lfo'): string => `${unit}${page}`;
export const synthv1AmpKnobs = (page: SynthV1Page, get: Get): SynthV1EnvKnobs => {
  const p = prefix(page, 'dca');
  return { attack: num(get(`${p}Attack`)), decay: num(get(`${p}Decay`), 0.3), sustain: num(get(`${p}Sustain`), 0.8), release: num(get(`${p}Release`), 0.3) };
};
export const synthv1FilterEnvKnobs = (page: SynthV1Page, get: Get): SynthV1EnvKnobs => {
  const p = prefix(page, 'dcf');
  return { attack: num(get(`${p}Attack`)), decay: num(get(`${p}Decay`), 0.3), sustain: num(get(`${p}Sustain`), 0.6), release: num(get(`${p}Release`), 0.3) };
};

// ---- filter ----------------------------------------------------------------------------------------------

/** synthv1_sigmoid_0 with t0 = 0.01 (synthv1.cpp:98). */
function sigmoid0(x: number, t0: number): number {
  const t1 = 1 - t0;
  return x < -1 ? -t1 : x > 1 ? t1 : t1 * x * (1.5 - 0.5 * x * x);
}
/** synthv1_sigmoid_1 (synthv1.cpp:114): the 0..1 S-curve every cutoff and resonance passes through. */
export const synthv1Sigmoid1 = (x: number, t0 = 0.01): number => 0.5 * (1 + sigmoid0(2 * x - 1, t0));

/** The cutoff value the filter receives (process(), synthv1.cpp:2490). */
export function synthv1EffectiveCutoff(cutoff: number, amount: number, envelope: number, lfoCutoff = 0, lfo = 0): number {
  const env = 0.5 * (1 + amount * envelope);
  return synthv1Sigmoid1(cutoff * env * (1 + lfoCutoff * lfo));
}
/** Same for the resonance (it shares the envelope term). */
export function synthv1EffectiveReso(reso: number, amount: number, envelope: number, lfoReso = 0, lfo = 0): number {
  const env = 0.5 * (1 + amount * envelope);
  return synthv1Sigmoid1(reso * env * (1 + lfoReso * lfo));
}

type C = [number, number];
const cadd = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
const csub = (a: C, b: C): C => [a[0] - b[0], a[1] - b[1]];
const cmul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cscale = (a: C, k: number): C => [a[0] * k, a[1] * k];
const cdiv = (a: C, b: C): C => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };

export type SynthV1FilterType = 0 | 1 | 2 | 3; // Low, Band, High, Notch

/** Chamberlin SVF, two iterations per sample on a held input (synthv1_filter1::output, nover = 2). */
function svfResponse(type: number, c: number, reso: number, w: number): C {
  const q = 1 - reso;
  const z: C = [Math.cos(w), Math.sin(w)];
  // state s = [low, band]; one iteration s' = A s + B x
  const A = [[1, c], [-c, 1 - c * (c + q)]];
  const B = [0, c];
  const mul2 = (m: number[][], n: number[][]): number[][] => [
    [m[0][0] * n[0][0] + m[0][1] * n[1][0], m[0][0] * n[0][1] + m[0][1] * n[1][1]],
    [m[1][0] * n[0][0] + m[1][1] * n[1][0], m[1][0] * n[0][1] + m[1][1] * n[1][1]],
  ];
  const A2 = mul2(A, A);
  // (z I - A^2) S0 = (A + I) B
  const rhs = [A[0][0] * B[0] + A[0][1] * B[1] + B[0], A[1][0] * B[0] + A[1][1] * B[1] + B[1]];
  const m00: C = csub(z, [A2[0][0], 0]); const m01: C = [-A2[0][1], 0];
  const m10: C = [-A2[1][0], 0]; const m11: C = csub(z, [A2[1][1], 0]);
  const det = csub(cmul(m00, m11), cmul(m01, m10));
  const s0: [C, C] = [
    cdiv(cadd(cscale(m11, rhs[0]), cscale(cscale(m01, -1), rhs[1])), det),
    cdiv(cadd(cscale(cscale(m10, -1), rhs[0]), cscale(m00, rhs[1])), det),
  ];
  const s1: [C, C] = [
    cadd(cadd(cscale(s0[0], A[0][0]), cscale(s0[1], A[0][1])), [B[0], 0]),
    cadd(cadd(cscale(s0[0], A[1][0]), cscale(s0[1], A[1][1])), [B[1], 0]),
  ];
  const s2: [C, C] = [cmul(z, s0[0]), cmul(z, s0[1])];
  const high = csub(csub([1, 0], s1[0]), cscale(s1[1], c + q));
  switch (type) {
    case 1: return s2[1];
    case 2: return high;
    case 3: return cadd(high, s2[0]);
    default: return s2[0];
  }
}

/** Stilson/Smith ladder: four identical one-pole sections inside a one-sample feedback (synthv1_filter2::output). */
function ladderResponse(type: number, c: number, reso: number, w: number): C {
  const cc = 1 - c;
  const p = c + 0.8 * c * cc;
  const f = 2 * p - 1;
  const q = reso * (1 + 0.5 * cc * (1 - cc + 5.6 * cc * cc));
  const zi: C = [Math.cos(w), -Math.sin(w)]; // z^-1
  const G = cdiv(cscale(cadd([1, 0], zi), p), cadd([1, 0], cscale(zi, f)));
  const G2 = cmul(G, G);
  const G3 = cmul(G2, G);
  const G4 = cmul(G2, G2);
  const X = cdiv([1, 0], cadd([1, 0], cscale(cmul(zi, G4), q)));
  const B3 = cmul(G3, X);
  const B4 = cmul(G4, X);
  const band = cscale(csub(B3, B4), 3);
  switch (type) {
    case 1: return band;
    case 2: return csub(X, B4);
    case 3: return csub(band, X);
    default: return B4;
  }
}

/** RBJ biquad at omega = pi * cutoff, Q = 2 reso^2 + 1 (synthv1_filter3::reset). */
function biquadResponse(type: number, c: number, reso: number, w: number): C {
  const q = 2 * reso * reso + 1;
  const omega = Math.PI * c;
  const tsin = Math.sin(omega), tcos = Math.cos(omega);
  const alpha = tsin / (2 * q);
  const a0 = 1 + alpha, a1 = -2 * tcos, a2 = 1 - alpha;
  let b0: number, b1: number, b2: number;
  switch (type) {
    case 3: b0 = 1; b1 = -2 * tcos; b2 = 1; break;
    case 2: b0 = (1 + tcos) / 2; b1 = -1 - tcos; b2 = b0; break;
    case 1: b0 = tsin / 2; b1 = 0; b2 = -b0; break;
    default: b0 = (1 - tcos) / 2; b1 = 1 - tcos; b2 = b0;
  }
  const z1: C = [Math.cos(w), -Math.sin(w)];
  const z2 = cmul(z1, z1);
  const num_ = cadd(cadd([b0 / a0, 0], cscale(z1, b1 / a0)), cscale(z2, b2 / a0));
  const den = cadd(cadd([1, 0], cscale(z1, a1 / a0)), cscale(z2, a2 / a0));
  return cdiv(num_, den);
}

/** |H| in dB of the filter at `hz`; null for the Formant slope (not modelled). */
export function synthv1FilterDb(slope: number, type: number, cutoff: number, reso: number, hz: number, fs: number): number | null {
  const w = (2 * Math.PI * hz) / fs;
  const s = Math.round(slope);
  const t = Math.min(3, Math.max(0, Math.round(type)));
  const h = s === 1 ? ladderResponse(t, cutoff, reso, w) : s === 2 ? biquadResponse(t, cutoff, reso, w) : s === 3 ? null : svfResponse(t, cutoff, reso, w);
  if (h === null) return null;
  const mag = Math.hypot(h[0], h[1]);
  return mag <= 1e-12 ? FILTER_DB_MIN : Math.max(FILTER_DB_MIN, 20 * Math.log10(mag));
}

/** The filter's corner in Hz for a cutoff value: the pole angle (state variable), the one-pole corner (ladder), cutoff * fs / 2 (biquad). */
export function synthv1CutoffHz(slope: number, cutoff: number, reso: number, fs: number): number {
  const c = Math.min(1, Math.max(0, cutoff));
  const s = Math.round(slope);
  if (s === 1) {
    const cc = 1 - c;
    const p = c + 0.8 * c * cc;
    return p >= 1 ? fs / 2 : (fs / Math.PI) * Math.atan(p / (1 - p));
  }
  if (s === 2 || s === 3) return (c * fs) / 2;
  const q = 1 - reso;
  const trace = 2 - c * (c + q);
  const det = 1 - c * q;
  const cosTheta = Math.min(1, Math.max(-1, trace / 2 / Math.sqrt(Math.max(1e-12, det))));
  return (Math.acos(cosTheta) * fs) / Math.PI;
}

export function synthv1FilterSeries(page: SynthV1Page, get: Get, fs: number): Array<Array<[number, number]>> {
  const d = prefix(page, 'dcf');
  const slope = num(get(`${d}Slope`));
  const type = num(get(`${d}Type`));
  const cutoff = num(get(`${d}Cutoff`), 0.75);
  const reso = num(get(`${d}Reso`), 0.2);
  const amount = num(get(`${d}Envelope`), 0.5);
  const sustain = num(get(`${d}Sustain`), 0.6);
  return [0, sustain, 1].map((env) => {
    const c = synthv1EffectiveCutoff(cutoff, amount, env);
    const r = synthv1EffectiveReso(reso, amount, env);
    return logGrid().filter((hz) => hz < fs / 2).map((hz): [number, number] => [hz, synthv1FilterDb(slope, type, c, r, hz, fs) ?? 0]);
  });
}

// ---- waves -----------------------------------------------------------------------------------------------

/** One cycle of a synthv1_wave table as the engine plays it: [phase 0..1, level -1..1], starting at the voice's start phase. */
export interface SynthV1Wave { points: Array<[number, number]>; random: boolean; /** The table position the voice starts at, in cycles (the drawing starts there). */ phase0: number }

/** Naive tables (synthv1_wave.cpp reset_pulse_part / saw / sine with nparts = 0). Shapes: 0 Pulse 1 Saw 2 Sine. */
function rawTable(shape: number, width: number, n: number): Float32Array | null {
  const t = new Float32Array(n + 4);
  const p0 = n;
  if (shape === 0) {
    const w2 = p0 * width * 0.5 + 0.001;
    for (let i = 0; i < n; i++) t[i] = i < w2 ? 1 : -1;
  } else if (shape === 1) {
    const w0 = p0 * width;
    for (let i = 0; i < n; i++) t[i] = i < w0 ? (2 * i) / w0 - 1 : 1 - (2 * (1 + (i - w0))) / (p0 - w0);
  } else if (shape === 2) {
    const w0 = p0 * width;
    const w2 = w0 * 0.5;
    for (let i = 0; i < n; i++) t[i] = i < w2 ? Math.sin((2 * Math.PI * i) / w0) : Math.sin((Math.PI * (i + (p0 - w0))) / (p0 - w2));
  } else return null;
  return t;
}

/** reset_filter: `passes` running-average passes starting at the first upward zero crossing. */
function smooth(t: Float32Array, n: number, passes: number): void {
  let k = 0;
  for (let i = 1; i < n; i++) if (t[i - 1] < 0 && t[i] >= 0) { k = i; break; }
  for (let pass = 0; pass < passes; pass++) {
    let p = t[k];
    for (let i = 0; i < n; i++) {
      if (++k >= n) k = 0;
      p = 0.5 * (t[k] + p);
      t[k] = p;
    }
  }
}

/** reset_normalize: `mean` centres on the mean (oscillator tables), otherwise on the middle of the range (LFO tables). */
function normalise(t: Float32Array, n: number, mean: boolean): void {
  let pmax = 0, pmid = 0;
  if (mean) {
    for (let i = 0; i < n; i++) pmid += t[i];
    pmid /= n;
  } else {
    for (let i = 0; i < n; i++) {
      const p = t[i];
      if (pmax < p) pmax = p;
      else if (pmid > p) pmid = p;
    }
    pmid = 0.5 * (pmax + pmid);
  }
  pmax = 0;
  for (let i = 0; i < n; i++) { t[i] -= pmid; pmax = Math.max(pmax, Math.abs(t[i])); }
  if (pmax > 0) for (let i = 0; i < n; i++) t[i] /= pmax;
}

const waveCache = new Map<string, SynthV1Wave>();

/**
 * The wave a voice plays. `lfo` selects the unsmoothed 1024-point LFO table, otherwise the smoothed 4096-point
 * oscillator table; the playback starts at the last upward zero crossing (phase0), so the drawing does too.
 */
export function synthv1Wave(shape: number, width: number, lfo: boolean, count = 360): SynthV1Wave {
  const sh = Math.round(shape);
  const w = Math.min(1, Math.max(0, width));
  const key = `${lfo ? 'l' : 'o'}${sh}/${w}/${count}`;
  const hit = waveCache.get(key);
  if (hit) return hit;
  const n = lfo ? 1024 : 4096;
  const table = rawTable(sh, w, n);
  let out: SynthV1Wave;
  if (!table) {
    out = { points: [[0, 0], [1, 0]], random: true, phase0: 0 };
  } else {
    if (!lfo) {
      if (sh !== 2 || w < 1) { smooth(table, n, 24); normalise(table, n, true); }
    } else if (sh !== 2 || w < 1) {
      normalise(table, n, false);
    }
    let k = 0;
    for (let i = 1; i < n; i++) if (table[i - 1] < 0 && table[i] >= 0) k = i;
    const points: Array<[number, number]> = [];
    for (let i = 0; i < count; i++) {
      const at = (k + (i / (count - 1)) * n) % n;
      const i0 = Math.floor(at);
      const f = at - i0;
      const a = table[i0 % n], b = table[(i0 + 1) % n];
      points.push([i / (count - 1), a + f * (b - a)]);
    }
    out = { points, random: false, phase0: k / n };
  }
  if (waveCache.size > 200) waveCache.clear();
  waveCache.set(key, out);
  return out;
}

/** LFO frequency in Hz (process(), synthv1.cpp:2385). */
export const synthv1LfoHz = (rate: number, bpm = SYNTHV1_LFO_BPM): number => bpm / (60.01 - rate * 60);
export const SYNTHV1_SHAPE_NAMES = ['Pulse', 'Saw', 'Sine', 'Random', 'Noise'] as const;

// ---- voice report -----------------------------------------------------------------------------------------

export interface SynthV1PageVoice { note: number; stage: WasmVoice['stage']; level: number; cutoff: number; filterLevel: number; lfoPhase: number; filterStage: WasmVoice['stage'] }

/** A report voice holds two 8-float records: this page's (page 1 in the standard slots, page 2 in `extra`). */
export function synthv1PageVoice(v: WasmVoice, page: SynthV1Page): SynthV1PageVoice {
  if (page === 1) return { note: v.note, stage: v.stage, level: v.level, cutoff: v.cutoff, filterLevel: v.filterLevel, lfoPhase: v.lfoPhase, filterStage: v.filterStage };
  const e = v.extra;
  return {
    note: Math.round(e[0] ?? -1), stage: VOICE_STAGES[Math.round(e[1] ?? 4)] ?? 'off', level: e[2] ?? 0, cutoff: e[4] ?? 0,
    filterLevel: e[5] ?? 0, lfoPhase: e[6] ?? 0, filterStage: VOICE_STAGES[Math.round(e[7] ?? 4)] ?? 'off',
  };
}

// ---- curve descriptors ---------------------------------------------------------------------------------------

export interface SynthV1PageCurves {
  oscA: CurveDescriptor; oscB: CurveDescriptor; filter: CurveDescriptor; filterEnv: CurveDescriptor; amp: CurveDescriptor; lfo: CurveDescriptor;
}

const pct = (v: number): string => `${Math.round(v * 100)}%`;
const SLOPE_NAMES = ['12 dB', '24 dB', 'Biquad', 'Formant'];
const TYPE_NAMES = ['Low pass', 'Band pass', 'High pass', 'Notch'];

export function synthv1Curves(page: SynthV1Page, sampleRate: () => number = audioSampleRate): SynthV1PageCurves {
  const o = prefix(page, 'dco');
  const d = prefix(page, 'dcf');
  const l = prefix(page, 'lfo');
  const amp = (get: Get): StagedEnvelope => synthv1StagedEnvelope(synthv1AmpKnobs(page, get), sampleRate());
  const fenv = (get: Get): StagedEnvelope => synthv1StagedEnvelope(synthv1FilterEnvKnobs(page, get), sampleRate());
  const envReadout = (k: SynthV1EnvKnobs, fs: number): string =>
    `A ${fmtMs((synthv1StageFrames(k.attack, 'attack', fs) / fs) * 1000)}  D ${fmtMs((synthv1StageFrames(k.decay, 'decay', fs) / fs) * 1000)}  S ${pct(k.sustain)}  R ${fmtMs((synthv1StageFrames(k.release, 'release', fs) / fs) * 1000)}`;
  const oscillator = (n: 1 | 2): CurveDescriptor => ({
    label: `Oscillator ${n === 1 ? 'A' : 'B'} (one cycle)`, xDomain: [0, 1], yDomain: [-1, 1],
    series: (get) => [{ points: synthv1Wave(num(get(`${o}Shape${n}`), 1), num(get(`${o}Width${n}`), 0.5), false).points }],
    readout: (get) => {
      const shape = Math.round(num(get(`${o}Shape${n}`), 1));
      return `${SYNTHV1_SHAPE_NAMES[shape] ?? 'Pulse'}${shape >= 3 ? '  random, no fixed shape' : `  width ${pct(num(get(`${o}Width${n}`), 0.5))}`}`;
    },
  });
  const cutoffAt = (get: Get, env: number): number =>
    synthv1EffectiveCutoff(num(get(`${d}Cutoff`), 0.75), num(get(`${d}Envelope`), 0.5), env);
  return {
    oscA: oscillator(1),
    oscB: oscillator(2),
    amp: {
      label: 'Amplitude Envelope', xUnit: 's', yDomain: [0, 1], xDomain: (get) => envelopeDomain(amp(get)),
      series: (get) => [{ points: amp(get).points, fill: true }],
      readout: (get) => envReadout(synthv1AmpKnobs(page, get), sampleRate()),
      marker: voiceMarker(SYNTHV1_SYNTH_TYPE, (v, get) => { const p = synthv1PageVoice(v, page); return envelopeMarkerX(amp(get), p.stage, p.level); }),
    },
    filterEnv: {
      label: 'Filter Envelope', xUnit: 's', yDomain: [0, 1], xDomain: (get) => envelopeDomain(fenv(get)),
      series: (get) => [{ points: fenv(get).points, fill: true }],
      readout: (get) => `${envReadout(synthv1FilterEnvKnobs(page, get), sampleRate())}  amount ${pct(num(get(`${d}Envelope`), 0.5))}`,
      marker: voiceMarker(SYNTHV1_SYNTH_TYPE, (v, get) => { const p = synthv1PageVoice(v, page); return envelopeMarkerX(fenv(get), p.filterStage, p.filterLevel); }),
    },
    filter: {
      label: 'Filter Response', xScale: 'log', xDomain: [20, 20000], yDomain: [FILTER_DB_MIN, FILTER_DB_MAX], xUnit: 'Hz', yUnit: 'dB',
      series: (get) => {
        const [rest, sustain, open] = synthv1FilterSeries(page, get, sampleRate());
        return [{ points: rest, color: 'rgba(255,255,255,0.25)' }, { points: sustain, color: 'rgba(255,255,255,0.45)' }, { points: open, fill: true }];
      },
      readout: (get) => {
        const slope = Math.round(num(get(`${d}Slope`)));
        const fs = sampleRate();
        const reso = num(get(`${d}Reso`), 0.2);
        const lo = synthv1CutoffHz(slope, cutoffAt(get, 0), reso, fs);
        const hi = synthv1CutoffHz(slope, cutoffAt(get, 1), reso, fs);
        return `${SLOPE_NAMES[slope] ?? '12 dB'} ${TYPE_NAMES[Math.round(num(get(`${d}Type`)))] ?? ''}  ${fmtHz(lo)} to ${fmtHz(hi)}${slope === 3 ? '  formant bank not drawn' : ''}`;
      },
      marker: voiceMarker(SYNTHV1_SYNTH_TYPE, (v, get) => {
        const p = synthv1PageVoice(v, page);
        return p.stage === 'off' ? null : synthv1CutoffHz(num(get(`${d}Slope`)), p.cutoff, num(get(`${d}Reso`), 0.2), sampleRate());
      }),
    },
    lfo: {
      label: 'LFO (one cycle)', xDomain: [0, 1], yDomain: [-1, 1],
      series: (get) => [{ points: synthv1Wave(num(get(`${l}Shape`), 0), num(get(`${l}Width`), 0.5), true).points }],
      readout: (get) => {
        const shape = Math.round(num(get(`${l}Shape`)));
        const hz = synthv1LfoHz(num(get(`${l}Rate`), 0.3), num(get(`${l}Bpm`), SYNTHV1_LFO_BPM) || SYNTHV1_LFO_BPM);
        return `${SYNTHV1_SHAPE_NAMES[shape] ?? 'Pulse'}  ${hz >= 100 ? `${(hz / 1000).toFixed(1)} kHz` : `${hz.toFixed(1)} Hz`}${shape >= 3 ? '  random, no fixed shape' : ''}`;
      },
      marker: voiceMarker(SYNTHV1_SYNTH_TYPE, (v, get) => {
        const p = synthv1PageVoice(v, page);
        if (p.stage === 'off') return null;
        const phase0 = synthv1Wave(num(get(`${l}Shape`), 0), num(get(`${l}Width`), 0.5), true).phase0;
        return (((p.lfoPhase - phase0) % 1) + 1) % 1;
      }),
    },
  };
}

/**
 * wasmSubtractiveModels.ts - the pieces every WASM subtractive-synth curve module shares (rollout groups 4 and 5):
 * a staged envelope (points plus the stage boundaries the live marker needs), a response evaluator for any z-domain
 * filter, the log frequency grid, and the live voice marker builder. Pure, no React, no DOM.
 * Each synth's own module (jx10Curves, raffoCurves, ...) holds that engine's formulas and cites their file:line.
 */
import type { CurveDescriptor } from '@/types/synthPanel';
import { subscribeVoiceMarker, type WasmVoice } from '@/engine/voiceStatus/wasmVoiceStatus';
import { getDevilboxAudioContext } from '@/utils/audio-context';
import { FILTER_DB_MAX, FILTER_DB_MIN } from './commonCurveModels';

export { FILTER_DB_MAX, FILTER_DB_MIN };

export interface StagedEnvelope {
  /** [seconds, level 0..1] */
  points: Array<[number, number]>;
  attackEnd: number;
  decayEnd: number;
  /** When the key is released (the end of the sustain hold). */
  releaseAt: number;
  total: number;
  /** Levels at the start and end of the sustain hold, when the sustain is not flat (a fade). */
  sustainFrom?: number;
  sustainTo?: number;
}

/** `count` points spaced evenly in [t0, t1] (both ends included). */
export function linspace(t0: number, t1: number, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(t0 + ((t1 - t0) * i) / (count - 1));
  return out;
}

/** Points of a stage: `level(t)` sampled on [t0, t1]. */
export function sampleStage(t0: number, t1: number, level: (t: number) => number, count = 48): Array<[number, number]> {
  if (!(t1 > t0)) return [[t0, level(t0)]];
  return linspace(t0, t1, count).map((t) => [t, level(t)]);
}

/**
 * Join stage functions into one ADSR drawing. `attack(t)`, `decay(t)` and `release(t)` take the time since the stage
 * began and return the level; the stage ends are given in seconds.
 */
export function stagedEnvelope(o: {
  attackSeconds: number; decaySeconds: number; holdSeconds: number; releaseSeconds: number;
  attack: (t: number) => number; decay: (t: number) => number; release: (t: number) => number;
}): StagedEnvelope {
  const a = Math.max(0, o.attackSeconds);
  const d = Math.max(0, o.decaySeconds);
  const attackEnd = a;
  const decayEnd = a + d;
  const releaseAt = decayEnd + Math.max(0, o.holdSeconds);
  const total = releaseAt + Math.max(0, o.releaseSeconds);
  const points: Array<[number, number]> = [];
  points.push(...sampleStage(0, attackEnd, o.attack));
  if (d > 0) points.push(...sampleStage(attackEnd, decayEnd, (t) => o.decay(t - attackEnd)).slice(1));
  const sustainLevel = d > 0 ? o.decay(d) : o.attack(a);
  points.push([releaseAt, sustainLevel]);
  if (o.releaseSeconds > 0) points.push(...sampleStage(releaseAt, total, (t) => o.release(t - releaseAt)).slice(1));
  return { points, attackEnd, decayEnd, releaseAt, total };
}

/**
 * Where the voice sits on a staged envelope: the point of the reported stage whose level is nearest the reported one
 * (the report carries stage and level, and the time inside a stage follows from the level).
 */
export function envelopeMarkerX(env: StagedEnvelope, stage: WasmVoice['stage'], level: number): number | null {
  if (stage === 'off') return null;
  if (stage === 'sustain') {
    const { sustainFrom: from, sustainTo: to } = env;
    if (from !== undefined && to !== undefined && Math.abs(to - from) > 1e-6) {
      const f = (level - from) / (to - from);
      return env.decayEnd + Math.min(1, Math.max(0, f)) * (env.releaseAt - env.decayEnd);
    }
    return (env.decayEnd + env.releaseAt) / 2;
  }
  const [lo, hi] = stage === 'attack' ? [0, env.attackEnd] : stage === 'decay' ? [env.attackEnd, env.decayEnd] : [env.releaseAt, env.total];
  let bestX = lo;
  let bestErr = Infinity;
  for (const [x, y] of env.points) {
    if (x < lo - 1e-9 || x > hi + 1e-9) continue;
    const err = Math.abs(y - level);
    if (err < bestErr) { bestErr = err; bestX = x; }
  }
  return bestX;
}

/** Log-spaced frequencies from lo to hi. */
export function logGrid(count = 160, lo = 20, hi = 20000): number[] {
  return Array.from({ length: count }, (_, i) => lo * Math.pow(hi / lo, i / (count - 1)));
}

/** |H(e^jw)| in dB of a z-domain filter b(z)/a(z), coefficients in powers of z^-1, at `hz` for sample rate `fs`. */
export function zMagnitudeDb(b: readonly number[], a: readonly number[], hz: number, fs: number): number {
  const w = (2 * Math.PI * hz) / fs;
  const poly = (c: readonly number[]): [number, number] => {
    let re = 0, im = 0;
    c.forEach((v, k) => { re += v * Math.cos(w * k); im -= v * Math.sin(w * k); });
    return [re, im];
  };
  const [nr, ni] = poly(b);
  const [dr, di] = poly(a);
  const mag = Math.hypot(nr, ni) / Math.max(1e-30, Math.hypot(dr, di));
  return mag <= 1e-12 ? FILTER_DB_MIN : Math.max(FILTER_DB_MIN, 20 * Math.log10(mag));
}

/** A response series: dB of `b/a` over the log grid, as [Hz, dB] points. */
export function zResponsePoints(b: readonly number[], a: readonly number[], fs: number, gainDb = 0): Array<[number, number]> {
  return logGrid().filter((hz) => hz < fs / 2).map((hz) => [hz, zMagnitudeDb(b, a, hz, fs) + gainDb]);
}

/** Convolve two coefficient lists (cascading two filters). */
export function polyMul(x: readonly number[], y: readonly number[]): number[] {
  const out = new Array<number>(x.length + y.length - 1).fill(0);
  x.forEach((xv, i) => y.forEach((yv, j) => { out[i + j] += xv * yv; }));
  return out;
}

/** The fixed extra tail a draw adds after the sustain: long enough to read the stage, short enough to keep the attack visible. */
export const holdFor = (attackSeconds: number, decaySeconds: number): number => Math.max(0.05, 0.25 * (attackSeconds + decaySeconds));

export type VoicePlace = (voice: WasmVoice, get: (key: string) => number) => number | null;

/**
 * A curve marker that follows the live voice of every instance of `synthType`: `place` turns the voice into an x
 * position with the current knob values (null hides the marker).
 */
export function voiceMarker(synthType: string, place: VoicePlace): CurveDescriptor['marker'] {
  return {
    subscribe: (onPosition, latestValues) =>
      subscribeVoiceMarker(synthType, (voice) => onPosition(voice ? place(voice, latestValues()) : null)),
  };
}

/** y domain / x domain helper for envelopes. */
export const envelopeDomain = (env: StagedEnvelope): readonly [number, number] => [0, Math.max(0.05, env.total * 1.02)];

/** Finite number or fallback; the tracker side panel can hand a layout a config without the synth's values. */
export const num = (v: number, fallback = 0): number => (Number.isFinite(v) ? v : fallback);

/** The audio context's rate; the editor can open before audio is initialised, then 48 kHz stands in. */
export function audioSampleRate(): number {
  try { return getDevilboxAudioContext().sampleRate; } catch { return 48000; }
}

/** RBJ biquad (Audio EQ Cookbook) as z-domain coefficients; `unityBandpass` is the constant 0 dB peak band-pass. */
export function rbjCoefficients(type: 'lowpass' | 'highpass' | 'bandpass' | 'notch', fc: number, q: number, fs: number): { b: number[]; a: number[] } {
  const w = (2 * Math.PI * fc) / fs;
  const sn = Math.sin(w);
  const cs = Math.cos(w);
  const alpha = sn / (2 * q);
  const inv = 1 / (1 + alpha);
  const a = [1, -2 * cs * inv, (1 - alpha) * inv];
  switch (type) {
    case 'lowpass': { const b0 = inv * (1 - cs) * 0.5; return { b: [b0, 2 * b0, b0], a }; }
    case 'highpass': { const b0 = inv * (1 + cs) * 0.5; return { b: [b0, -2 * b0, b0], a }; }
    case 'bandpass': return { b: [inv * alpha, 0, -inv * alpha], a };
    default: return { b: [inv, -2 * cs * inv, inv], a };
  }
}

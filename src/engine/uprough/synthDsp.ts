/**
 * Up Rough host softsynth DSP primitives (tools/synth_dsp.py, tools/synth_factory.py), ported for the bass voices:
 * PolyBLEP osc, drift_curve, _env, moog_ladder, distort (every kind), karplus (integer and fractional/allpass), fm_2op.
 *
 * Every transcendental goes through portableMath (fdlibm ports, the same bytes as the host's portable_math), and the
 * filters through refDsp (portableIir), so the output matches the reference to the last few ulps.
 * Parity fixture: tools/softsynth-fixtures/gen_bass_primitives.py.
 */
import { NumpyRandomState } from '@/engine/turntable/turntableSim';
import { pcos, pexp, pexp2, psin, ptanh } from '@/engine/dj/scratch/portableMath';
import { bp, hp, npSum } from '@/engine/dj/scratch/refDsp';
import { onepoleLp } from '@/engine/dj/scratch/demoDrums';
import { roundHalfEven } from '@/engine/dj/scratch/scratchGrit';
import { softClip, tapeSat, tube } from './effects/busEffects';

/** synth_dsp TWO_PI = 2.0 * np.pi. */
export const TWO_PI = 2.0 * Math.PI;

/** A scalar or a per-sample array, as numpy lets a caller pass either. */
export type Scalar1 = number | ArrayLike<number>;

/** Python / numpy `x % m` for a positive modulus: the result takes the sign of m. */
const pmod = (x: number, m: number): number => {
  const r = x % m;
  return r !== 0 && r < 0 !== m < 0 ? r + m : r;
};

/** `np.full(n, f)` for a scalar, else the first n entries edge-padded (`_phase` / `_dt_array` freq handling). */
function perSample(v: Scalar1, n: number): Float64Array {
  const out = new Float64Array(n);
  if (typeof v === 'number') { out.fill(v); return out; }
  const m = Math.min(n, v.length);
  for (let i = 0; i < m; i++) out[i] = v[i]!;
  for (let i = m; i < n; i++) out[i] = v[v.length - 1]!;
  return out;
}

/** `_phase`: sample-accurate phase accumulator, (phase0 + cumsum(freq / rate)) % 1. */
export function phaseOf(freq: Scalar1, n: number, rate: number, phase0 = 0.0, drift: ArrayLike<number> | null = null): Float64Array {
  const fa = perSample(freq, n);
  if (drift) for (let i = 0; i < n; i++) fa[i] = fa[i]! * (1.0 + drift[i]!);
  const out = new Float64Array(n);
  let s = 0;
  for (let i = 0; i < n; i++) { s += fa[i]! / rate; out[i] = pmod(phase0 + s, 1.0); }
  return out;
}

/** `_dt_array`: per-sample phase increment |freq| / rate. */
export function dtOf(freq: Scalar1, n: number, rate: number, drift: ArrayLike<number> | null = null): Float64Array {
  const fa = perSample(freq, n);
  if (drift) for (let i = 0; i < n; i++) fa[i] = fa[i]! * (1.0 + drift[i]!);
  for (let i = 0; i < n; i++) fa[i] = Math.abs(fa[i]!) / rate;
  return fa;
}

/** `_polyblep(t, dt)`: PolyBLEP residual for a unit step at phase 0/1. */
export function polyblep(t: ArrayLike<number>, dt: ArrayLike<number>): Float64Array {
  const y = new Float64Array(t.length);
  for (let i = 0; i < t.length; i++) {
    const d = dt[i]! <= 0 ? 1e-9 : dt[i]!;
    const ti = t[i]!;
    if (ti < d) { const x = ti / d; y[i] = 2.0 * x - x * x - 1.0; }
    if (ti > 1.0 - d) { const x = (ti - 1.0) / d; y[i] = x * x + 2.0 * x + 1.0; }
  }
  return y;
}

function bleSaw(ph: Float64Array, dt: Float64Array): Float64Array {
  const r = polyblep(ph, dt);
  const y = new Float64Array(ph.length);
  for (let i = 0; i < ph.length; i++) y[i] = (2.0 * ph[i]! - 1.0) - r[i]!;
  return y;
}

function bleSquare(ph: Float64Array, dt: Float64Array, pw: Scalar1): Float64Array {
  const n = ph.length;
  const pwa = typeof pw === 'number' ? null : pw;
  const at = (i: number): number => (pwa ? pwa[i]! : (pw as number));
  const shifted = new Float64Array(n);
  for (let i = 0; i < n; i++) shifted[i] = pmod(ph[i]! - at(i), 1.0);
  const r1 = polyblep(ph, dt);
  const r2 = polyblep(shifted, dt);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let v = ph[i]! < at(i) ? 1.0 : -1.0;
    v += r1[i]!;
    v -= r2[i]!;
    y[i] = v;
  }
  return y;
}

/** synth_dsp `wavefold`: sin(amount x pi / 2). */
export function wavefold(x: ArrayLike<number>, amount = 2.0): Float64Array {
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = psin(amount * x[i]! * Math.PI / 2.0);
  return out;
}

export type OscKind = 'saw' | 'square' | 'pulse' | 'pwm' | 'tri' | 'sine' | 'halfsine' | 'supersaw' | 'sub' | 'noise' | 'impulse' | string;

export interface OscOptions {
  pw?: Scalar1; phase0?: number; detune?: number; drift?: ArrayLike<number> | null;
  fold?: number; seed?: number; bandLimit?: boolean;
}

const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);

/** synth_dsp `osc`: one oscillator. detune in cents, drift a per-sample fractional pitch array, fold wavefolds. */
export function osc(kind: OscKind, freqIn: Scalar1, n: number, rate: number, opts: OscOptions = {}): Float64Array {
  const { pw = 0.5, phase0 = 0.0, detune = 0.0, drift = null, fold = 0.0, seed = 0, bandLimit = true } = opts;
  let freq: Scalar1 = freqIn;
  if (detune) {
    const k = pexp2(detune / 1200.0);
    freq = typeof freqIn === 'number' ? freqIn * k : Float64Array.from(freqIn, (f) => f * k);
  }
  const ph = phaseOf(freq, n, rate, phase0, drift);
  const dt = bandLimit ? dtOf(freq, n, rate, drift) : null;
  let y: Float64Array;
  if (kind === 'saw') {
    y = bandLimit ? bleSaw(ph, dt!) : Float64Array.from(ph, (p) => 2.0 * p - 1.0);
  } else if (kind === 'square' || kind === 'pulse' || kind === 'pwm') {
    if (bandLimit) y = bleSquare(ph, dt!, pw);
    else y = Float64Array.from(ph, (p, i) => (p < (typeof pw === 'number' ? pw : pw[i]!) ? 1.0 : -1.0));
  } else if (kind === 'tri') {
    y = Float64Array.from(ph, (p) => 2.0 * Math.abs(2.0 * p - 1.0) - 1.0);
  } else if (kind === 'sine') {
    y = Float64Array.from(ph, (p) => psin(TWO_PI * p));
  } else if (kind === 'halfsine') {
    y = Float64Array.from(ph, (p) => (p < 0.5 ? psin(TWO_PI * p) : 0.0));
  } else if (kind === 'supersaw') {
    y = new Float64Array(n);
    const DETUNES = [-11, -6, -2, 2, 6, 11];
    DETUNES.forEach((dtC, k) => {
      const fq = typeof freq === 'number' ? freq * pexp2(dtC / 1200.0) : Float64Array.from(freq, (f) => f * pexp2(dtC / 1200.0));
      const pk = phaseOf(fq, n, rate, pmod(k * 0.16, 1.0));
      const s = bandLimit ? bleSaw(pk, dtOf(fq, n, rate)) : Float64Array.from(pk, (p) => 2.0 * p - 1.0);
      for (let i = 0; i < n; i++) y[i] = y[i]! + s[i]!;
    });
    for (let i = 0; i < n; i++) y[i] = y[i]! / 6.0;
  } else if (kind === 'sub') {
    const base = typeof freq === 'number' ? freq * 0.5 : Float64Array.from(freq, (f) => f * 0.5);
    y = Float64Array.from(phaseOf(base, n, rate, phase0), (p) => sign(psin(TWO_PI * p)));
  } else if (kind === 'impulse') {
    y = new Float64Array(n);
    const meanF = typeof freq === 'number' ? freq : npSum(freq, 0, freq.length) / freq.length;
    const period = Math.max(1, Math.trunc(rate / Math.max(1.0, meanF)));
    for (let i = 0; i < n; i += period) y[i] = 1.0;
  } else if (kind === 'noise') {
    y = new NumpyRandomState(seed >>> 0).uniformArray(-1, 1, n);
  } else {
    y = Float64Array.from(ph, (p) => 2.0 * p - 1.0);
  }
  return fold ? wavefold(y, 1.0 + 3.0 * fold) : y;
}

/** synth_dsp `drift_curve`: slow random pitch drift (fractional), (2^(depth up / 1200)) - 1. */
export function driftCurve(n: number, rate: number, depthCents = 4.0, hz = 0.3, seed = 0): Float64Array {
  const rng = new NumpyRandomState(seed >>> 0);
  const slow = rng.uniformArray(-1, 1, Math.max(2, Math.trunc(n / rate * hz * 4) + 2));
  // np.interp(np.linspace(0, len-1, n), arange(len), slow)
  const last = slow.length - 1;
  const step = n > 1 ? (last - 0) / (n - 1) : 0;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = n > 1 && i === n - 1 ? last : i * step + 0;
    let up: number;
    if (x >= last) up = slow[last]!;
    else {
      const j = Math.floor(x);
      up = (slow[j + 1]! - slow[j]!) / 1.0 * (x - j) + slow[j]!;
    }
    out[i] = pexp2(depthCents * up / 1200.0) - 1.0;
  }
  return out;
}

const linspace = (start: number, stop: number, num: number): Float64Array => {
  const out = new Float64Array(num);
  if (num === 0) return out;
  if (num === 1) { out[0] = start; return out; }
  const step = (stop - start) / (num - 1);
  for (let i = 0; i < num; i++) out[i] = i * step + start;
  out[num - 1] = stop;
  return out;
};

/** synth_factory `_env`: attack / sustain-slope / release envelope of exactly n samples, every stage clamped to what is left. */
export function env(nIn: number, aS: number, _dS: number, sus: number, rS: number, rate: number): Float64Array {
  const n = Math.max(1, Math.trunc(nIn));
  let a = Math.trunc(aS * rate), r = Math.trunc(rS * rate);
  if (a + r > n) {
    const scale = n / (a + r);
    a = Math.trunc(a * scale); r = Math.trunc(r * scale);
  }
  a = Math.max(0, Math.min(a, n)); r = Math.max(0, Math.min(r, n - a));
  const s = Math.max(0, n - a - r);
  const e = new Float64Array(n).fill(1.0);
  if (a) e.set(linspace(0, 1, a), 0);
  if (s) e.set(linspace(1, sus, s), a);
  if (r) e.set(linspace(sus, 0, r), a + s);
  return e;
}

/** synth_dsp `moog_ladder`: 4-pole ladder with tanh feedback; fc a scalar or a per-sample array, res 0..1. */
export function moogLadder(x: ArrayLike<number>, fc: Scalar1, res: number, rate: number): Float64Array {
  const n = x.length;
  const gOf = (f: number): number => {
    const fcn = Math.min(0.99, Math.max(0.001, f / (rate * 0.5)));
    return 1.0 - pexp(-TWO_PI * 0.5 * fcn);
  };
  const g = typeof fc === 'number' ? null : Float64Array.from({ length: n }, (_, i) => gOf(fc[i]!));
  const g0 = typeof fc === 'number' ? gOf(fc) : 0;
  const k = 4.0 * res;
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const gi = g ? g[i]! : g0;
    const u = ptanh(x[i]! - k * s3);
    s0 += gi * (u - s0);
    s1 += gi * (s0 - s1);
    s2 += gi * (s1 - s2);
    s3 += gi * (s2 - s3);
    y[i] = s3;
  }
  return y;
}

// ── distortion library (synth_dsp Ph6) ──────────────────────────────────────

const map = (x: ArrayLike<number>, f: (v: number) => number): Float64Array => {
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = f(x[i]!);
  return out;
};
const clip = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

type DistortFn = (x: ArrayLike<number>, drive: number) => Float64Array;
export const DISTORTIONS: Readonly<Record<string, DistortFn>> = {
  soft: (x, d) => softClip(x, d),
  hard: (x, d) => map(x, (v) => clip(d * v, -0.7, 0.7) / 0.7),
  tape: (x, d) => tapeSat(x, d),
  tube: (x, d) => tube(x, d),
  diode: (x, d) => map(x, (v) => sign(v) * (1.0 - pexp(-Math.abs(d * v)))),
  asym: (x, d) => map(x, (v) => (v >= 0 ? ptanh(d * v) : ptanh(0.6 * d * v))),
  wavefold: (x, d) => wavefold(x, d),
  rat: (x, d) => map(x, (v) => ptanh(1.5 * clip(d * v, -1, 1))),
  tubescreamer: (x, d) => map(x, (v) => 0.7 * ptanh(d * v) + 0.3 * v),
  bigmuff: (x, d) => map(x, (v) => ptanh(ptanh(d * v) * 2.0)),
  ds1: (x, d) => map(x, (v) => clip(ptanh(d * v) * 1.4, -1, 1)),
};

/** synth_dsp `bitcrush`: quantise to `bits`, optional sample-and-hold by rateDiv. */
export function bitcrush(x: ArrayLike<number>, bits = 6, rateDiv = 1): Float64Array {
  const q = 2.0 ** (bits - 1);
  let y = map(x, (v) => roundHalfEven(v * q) / q);
  if (rateDiv > 1) {
    const held = new Float64Array(x.length);
    for (let i = 0; i < x.length; i++) held[i] = y[Math.trunc(i / rateDiv) * rateDiv]!;
    y = held;
  }
  return y;
}

/** synth_dsp `distort`: unknown kinds fall back to soft clip; bitcrush maps drive to bits = int(max(2, 8 - drive)). */
export function distort(x: ArrayLike<number>, kind = 'soft', drive = 2.0): Float64Array {
  if (kind === 'bitcrush') return bitcrush(x, Math.trunc(Math.max(2, 8 - drive)));
  return (DISTORTIONS[kind] ?? DISTORTIONS.soft!)(x, drive);
}

// ── FM (synth_dsp Ph18) ─────────────────────────────────────────────────────

/** synth_dsp `fm_2op`: one modulator into one carrier, exponential envelopes, optional 1-sample feedback. */
export function fm2op(freq: number, n: number, rate: number, ratio = 2.0, index = 3.0, feedback = 0.0, carDecay = 0.4, modDecay = 0.3): Float64Array {
  const out = new Float64Array(n);
  let prev = 0.0;
  for (let t = 0; t < n; t++) {
    const menv = pexp(-t / (modDecay * rate));
    const cenv = pexp(-t / (carDecay * rate));
    let mod: number;
    if (feedback) { prev = psin(TWO_PI * freq * ratio * t / rate + feedback * prev); mod = prev; }
    else mod = psin(TWO_PI * freq * ratio * t / rate);
    out[t] = psin(TWO_PI * freq * t / rate + index * menv * mod) * cenv;
  }
  return out;
}

// ── Karplus-Strong (synth_dsp Ph19) ─────────────────────────────────────────

/** `_allpass_phase_delay`: phase delay of (c + z^-1) / (1 + c z^-1) at w, in samples. */
function allpassPhaseDelay(c: number, w: number): number {
  const zr = pcos(w), zi = -psin(w);               // z = exp(-j w)
  const nr = c + zr, ni = zi;                       // c + z
  const dr = 1 + c * zr, di = c * zi;               // 1 + c z
  // angle(num / den) = atan2(Im(num conj(den)), Re(num conj(den)))
  const re = nr * dr + ni * di, im = ni * dr - nr * di;
  return -Math.atan2(im, re) / w;
}

/** `_allpass_coeff_for_delay`: 60-step bisection for the allpass coefficient giving phase delay d at w. */
export function allpassCoeffForDelay(d: number, w: number): number {
  let lo = -0.999, hi = 0.999;
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    if (allpassPhaseDelay(mid, w) > d) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

export type KarplusKind = 'pluck' | 'mallet' | 'metal' | 'bell' | 'wood' | string;

function karplusExcitation(kind: KarplusKind, exc: Float64Array, rate: number, damp: number): { exc: Float64Array; damp: number } {
  if (kind === 'mallet') return { exc: onepoleLp(exc, 2000, rate), damp };
  if (kind === 'metal' || kind === 'bell') return { exc: hp(exc, 3000, rate), damp: 0.05 };
  if (kind === 'wood') return { exc: bp(exc, 400, 2000, rate), damp };
  return { exc, damp };
}

/** synth_dsp `karplus`: string / mallet / metal; `fractional` tunes the loop with a Jaffe-Smith allpass. */
export function karplus(freq: number, durS: number, rate: number, dampIn = 0.5, kind: KarplusKind = 'pluck', seed = 0, fractional = false): Float64Array {
  const n = Math.trunc(durS * rate);
  const rng = new NumpyRandomState(seed >>> 0);
  let a = 0.5 * (1 - dampIn * 0.5);
  const out = new Float64Array(n);
  if (!fractional) {
    const p = Math.max(2, Math.trunc(rate / freq));
    const ex = karplusExcitation(kind, rng.uniformArray(-1, 1, p), rate, dampIn);
    if (kind === 'metal' || kind === 'bell') a = 0.5 * (1 - ex.damp * 0.5);
    const buf = Array.from(ex.exc);
    for (let i = 0; i < n; i++) {
      const s = buf[i % p]!;
      out[i] = s;
      buf[i % p] = a * (s + buf[(i + 1) % p]!);
    }
  } else {
    const T = rate / freq;
    const p = Math.max(3, roundHalfEven(T + 0.5));
    const need = Math.min(Math.max(T - (p - 0.5), 0.01), 0.99);
    const c = allpassCoeffForDelay(need, TWO_PI * freq / rate);
    const ex = karplusExcitation(kind, rng.uniformArray(-1, 1, p), rate, dampIn);
    if (kind === 'metal' || kind === 'bell') a = 0.5 * (1 - ex.damp * 0.5);
    const buf = Array.from(ex.exc);
    let apx = 0.0, apy = 0.0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % p;
      const s = buf[i % p]!;
      out[i] = s;
      const v = a * (s + buf[j]!);
      const y = c * v + apx - c * apy;
      apx = v; apy = y;
      buf[i % p] = y;
    }
  }
  const tau = durS * rate * 1.2;
  for (let i = 0; i < n; i++) out[i] = out[i]! * pexp(-i / tau);
  return out;
}

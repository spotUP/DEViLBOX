/**
 * The Up Rough demo system's DSP primitives, ported to the sample (scratch null test, owner 2026-10-12:
 * "make the demo and devilbox scratch 1:1"). Each function is the reference's own math in float64:
 *
 *   butter / lfilter   scipy.signal.butter (zpk -> bilinear with fs = 2 -> tf) and lfilter (transposed
 *                      direct form II, the order scipy's C loop sums in) - synth_dsp.py lp / hp / bp
 *   firwin / resamplePoly   scipy.signal.firwin (Kaiser 5.0) and resample_poly (upfirdn, its padding and
 *                      trim) - synth_dsp.py resample_ratio, the bank's loader
 *   comb / allpass / reverb   synth_dsp.py comb, _allpass, reverb (the Schroeder kinds)
 *   echoLine / delay   synth_dsp.py _echo_line, delay (tape: damp, wow, tanh in the loop)
 *
 * The scratch channel worklet (`public/worklets/scratch-deck-c.worklet.js`) runs the same recursions
 * per sample; these whole-array versions are the record loader's and the tests'.
 */

// ── complex arithmetic (the zpk design) ──────────────────────────────────

type C = readonly [re: number, im: number];
const cadd = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
const csub = (a: C, b: C): C => [a[0] - b[0], a[1] - b[1]];
const cmul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cscale = (a: C, k: number): C => [a[0] * k, a[1] * k];
function cdiv(a: C, b: C): C {
  // numpy complex division (Smith's algorithm, as npymath does)
  const [ar, ai] = a, [br, bi] = b;
  const abs_br = Math.abs(br), abs_bi = Math.abs(bi);
  if (abs_br >= abs_bi) {
    if (abs_br === 0 && abs_bi === 0) return [ar / abs_br, ai / abs_bi];
    const rat = bi / br, scl = 1.0 / (br + bi * rat);
    return [(ar + ai * rat) * scl, (ai - ar * rat) * scl];
  }
  const rat = br / bi, scl = 1.0 / (bi + br * rat);
  return [(ar * rat + ai) * scl, (ai * rat - ar) * scl];
}
function csqrt(a: C): C {
  // principal branch (npymath csqrt)
  const [re, im] = a;
  if (re === 0 && im === 0) return [0, im];
  const t = Math.sqrt((Math.abs(re) + Math.hypot(re, im)) * 0.5);
  if (re >= 0) return [t, im / (2 * t)];
  return [Math.abs(im) / (2 * t), im >= 0 ? t : -t];
}

/** numpy.poly: the monic polynomial with these roots (convolution in root order), real part. */
function poly(roots: readonly C[]): number[] {
  let a: C[] = [[1, 0]];
  for (const r of roots) {
    const next: C[] = new Array(a.length + 1).fill(null).map(() => [0, 0] as C);
    for (let i = 0; i < a.length; i++) {
      next[i] = cadd(next[i]!, a[i]!);
      next[i + 1] = csub(next[i + 1]!, cmul(a[i]!, r));
    }
    a = next;
  }
  return a.map((c) => c[0]);
}

const cprod = (xs: readonly C[]): C => xs.reduce<C>((p, x) => cmul(p, x), [1, 0]);

export interface Ba { b: number[]; a: number[] }

/** scipy.signal.butter(N, Wn, btype) for digital filters (fs = 2, Wn relative to Nyquist). */
export function butter(N: number, Wn: number | readonly [number, number], btype: 'low' | 'high' | 'band'): Ba {
  // buttap: p = -exp(1j * pi * arange(-N + 1, N, 2) / (2 N)), k = 1
  const p0: C[] = [];
  for (let m = -N + 1; m < N; m += 2) {
    const th = Math.PI * m / (2 * N);
    p0.push([-Math.cos(th), -Math.sin(th)]);
  }
  const fs = 2.0;
  const warp = (w: number) => 2 * fs * Math.tan(Math.PI * w / fs);
  let z: C[] = [], p: C[], k: number;
  if (btype === 'low') {
    const wo = warp(Wn as number);
    p = p0.map((x) => cscale(x, wo));
    k = wo ** N;
  } else if (btype === 'high') {
    const wo = warp(Wn as number);
    p = p0.map((x) => cdiv([wo, 0], x));
    z = Array.from({ length: N }, () => [0, 0] as C);
    // k * real(prod(-z) / prod(-p)) with z empty: 1 / real(prod(-p))
    const pp = cprod(p0.map((x) => cscale(x, -1)));
    k = cdiv([1, 0], pp)[0];
  } else {
    const [w1, w2] = Wn as readonly [number, number];
    const lo = warp(w1), hi = warp(w2);
    const bw = hi - lo, wo = Math.sqrt(lo * hi);
    const pl = p0.map((x) => cscale(x, bw / 2));
    const plus: C[] = [], minus: C[] = [];
    for (const x of pl) {
      const s = csqrt(csub(cmul(x, x), [wo * wo, 0]));
      plus.push(cadd(x, s)); minus.push(csub(x, s));
    }
    p = [...plus, ...minus];
    z = Array.from({ length: N }, () => [0, 0] as C);
    k = bw ** N;
  }
  // bilinear_zpk, fs2 = 2 fs
  const fs2: C = [2 * fs, 0];
  const degree = p.length - z.length;
  const zz = z.map((x) => cdiv(cadd(fs2, x), csub(fs2, x)));
  for (let i = 0; i < degree; i++) zz.push([-1, 0]);
  const pz = p.map((x) => cdiv(cadd(fs2, x), csub(fs2, x)));
  const kz = k * cdiv(cprod(z.map((x) => csub(fs2, x))), cprod(p.map((x) => csub(fs2, x))))[0];
  return { b: poly(zz).map((v) => v * kz), a: poly(pz) };
}

/** synth_dsp `_norm`: a corner (Hz) relative to Nyquist, clamped to [0.001, 0.99]. */
export const normFc = (fc: number, rate: number) => Math.min(0.99, Math.max(0.001, fc / (rate / 2.0)));

/** scipy.signal.lfilter(b, a, x) from zero state (a[0] = 1), transposed direct form II. */
export function lfilter(ba: Ba, x: ArrayLike<number>): Float64Array {
  const n = Math.max(ba.b.length, ba.a.length);
  const a0 = ba.a[0]!;
  const b = Array.from({ length: n }, (_, i) => (ba.b[i] ?? 0) / a0);
  const a = Array.from({ length: n }, (_, i) => (ba.a[i] ?? 0) / a0);
  const zi = new Float64Array(Math.max(1, n - 1));
  const y = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const xi = x[i]!;
    if (n === 1) { y[i] = xi * b[0]!; continue; }
    const yi = zi[0]! + b[0]! * xi;
    for (let k = 0; k < n - 2; k++) zi[k] = zi[k + 1]! + xi * b[k + 1]! - yi * a[k + 1]!;
    zi[n - 2] = xi * b[n - 1]! - yi * a[n - 1]!;
    y[i] = yi;
  }
  return y;
}

/** synth_dsp lp / hp (butter `poles`, lfilter). */
export const lp = (x: ArrayLike<number>, fc: number, rate: number, poles = 2) => lfilter(butter(poles, normFc(fc, rate), 'low'), x);
export const hp = (x: ArrayLike<number>, fc: number, rate: number, poles = 2) => lfilter(butter(poles, normFc(fc, rate), 'high'), x);
/** synth_dsp bp (butter(order, [lo, hi], 'band')). */
export const bp = (x: ArrayLike<number>, lo: number, hi: number, rate: number, order = 2) => lfilter(butter(order, [normFc(lo, rate), normFc(hi, rate)], 'band'), x);

// ── resampling (the bank loader) ─────────────────────────────────────────

/** Modified Bessel function of the first kind, order 0 (cephes i0, Chebyshev expansion). */
const I0_A = [
  -4.41534164647933937950e-18, 3.33079451882223809783e-17, -2.43127984654795469359e-16, 1.71539128555513303061e-15,
  -1.16853328779934516808e-14, 7.67618549860493561688e-14, -4.85644678311192946090e-13, 2.95505266312963983461e-12,
  -1.72682629144155570723e-11, 9.67580903537323691224e-11, -5.18979560163526290666e-10, 2.65982372468238665035e-9,
  -1.30002500998624804212e-8, 6.04699502254191894932e-8, -2.67079385394061173391e-7, 1.11738753912010371815e-6,
  -4.41673835845875056359e-6, 1.64484480707288970893e-5, -5.75419501008210370398e-5, 1.88502885095841655729e-4,
  -5.76375574538582365885e-4, 1.63947561694133579842e-3, -4.32430999505057594430e-3, 1.05464603945949983183e-2,
  -2.37374148058994688156e-2, 4.93052842396707084878e-2, -9.49010970480476444210e-2, 1.71620901522208775349e-1,
  -3.04682672343198398683e-1, 6.76795274409476084995e-1,
];
const I0_B = [
  -7.23318048787475395456e-18, -4.83050448594418207126e-18, 4.46562142029675999901e-17, 3.46122286769746109310e-17,
  -2.82762398051658348494e-16, -3.42548561967721913462e-16, 1.77256013305652638360e-15, 3.81168066935262242075e-15,
  -9.55484669882830764870e-15, -4.15056934728722208663e-14, 1.54008621752140982691e-14, 3.85277838274214270114e-13,
  7.18012445138366623367e-13, -1.79417853150680611778e-12, -1.32158118404477131188e-11, -3.14991652796324136454e-11,
  1.18891471078464383424e-11, 4.94060238822496958910e-10, 3.39623202570838634515e-9, 2.26666899049817806459e-8,
  2.04891858946906374183e-7, 2.89137052083475648297e-6, 6.88975834691682398426e-5, 3.36911647825569408990e-3,
  8.04490411014108831608e-1,
];
function chbevl(x: number, c: readonly number[]): number {
  let b0 = c[0]!, b1 = 0, b2 = 0;
  for (let i = 1; i < c.length; i++) { b2 = b1; b1 = b0; b0 = x * b1 - b2 + c[i]!; }
  return 0.5 * (b0 - b2);
}
export function besselI0(x: number): number {
  x = Math.abs(x);
  if (x <= 8.0) return Math.exp(x) * chbevl(x / 2.0 - 2.0, I0_A);
  return Math.exp(x) * chbevl(32.0 / x - 2.0, I0_B) / Math.sqrt(x);
}

/** scipy.signal.firwin(numtaps, cutoff, window=('kaiser', beta)) for a low pass (cutoff relative to Nyquist). */
export function firwinKaiser(numtaps: number, cutoff: number, beta: number): Float64Array {
  const alpha = 0.5 * (numtaps - 1);
  const h = new Float64Array(numtaps);
  const i0b = besselI0(beta);
  for (let i = 0; i < numtaps; i++) {
    const m = i - alpha;
    const xs = cutoff * m;
    const sinc = xs === 0 ? 1 : Math.sin(Math.PI * xs) / (Math.PI * xs);
    // windows.kaiser(M, beta, sym=True): I0(beta sqrt(1 - ((n - alpha) / alpha)^2)) / I0(beta)
    const r = (i - alpha) / alpha;
    const w = besselI0(beta * Math.sqrt(1 - r * r)) / i0b;
    h[i] = cutoff * sinc * w;
  }
  // scale so the response at DC is 1 (pass_zero): s = sum(h * cos(0))
  let s = 0;
  for (let i = 0; i < numtaps; i++) s += h[i]!;
  for (let i = 0; i < numtaps; i++) h[i] = h[i]! / s;
  return h;
}

/** scipy.signal.resample_poly(x, up, down) with its default Kaiser 5.0 window, constant padding. */
export function resamplePoly(x: ArrayLike<number>, up: number, down: number): Float64Array {
  const g = gcd(up, down); up /= g; down /= g;
  const nIn = x.length;
  if (up === 1 && down === 1) return Float64Array.from(x);
  let nOut = nIn * up;
  nOut = Math.floor(nOut / down) + (nOut % down ? 1 : 0);
  const maxRate = Math.max(up, down);
  const halfLen = 10 * maxRate;
  const h0 = firwinKaiser(2 * halfLen + 1, 1 / maxRate, 5.0);
  const nPrePad = down - (halfLen % down);
  const nPreRemove = Math.floor((halfLen + nPrePad) / down);
  const h = new Float64Array(nPrePad + h0.length);
  for (let i = 0; i < h0.length; i++) h[nPrePad + i] = h0[i]! * up;
  // upfirdn: upsample by `up`, convolve with h, keep every `down`th; samples nPreRemove .. + nOut
  const y = new Float64Array(nOut);
  for (let m = 0; m < nOut; m++) {
    const n = (m + nPreRemove) * down; // index in the upsampled, filtered stream
    let acc = 0;
    // sum over j: h[j] * xu[n - j], xu nonzero at multiples of up
    for (let j = n % up; j < h.length; j += up) {
      const xi = (n - j) / up;
      if (xi < 0) break;
      if (xi < nIn) acc += h[j]! * x[xi]!;
    }
    y[m] = acc;
  }
  return y;
}
function gcd(a: number, b: number): number { while (b) { [a, b] = [b, a % b]; } return a; }

// ── combs, allpasses, reverbs, delays ─────────────────────────────────────

/** synth_dsp `comb` (delay in samples): y[i] = x[i] + fb v[i], v[i] = (1 - damp) y[i - d] + damp v[i - 1]. */
export function comb(x: ArrayLike<number>, d: number, fb: number, damp = 0): Float64Array {
  d = Math.max(1, Math.trunc(d));
  const y = Float64Array.from(x);
  let v = 0;
  for (let i = 0; i < y.length; i++) {
    const yd = i >= d ? y[i - d]! : 0;
    v = damp ? (1 - damp) * yd + damp * v : yd;
    y[i] = y[i]! + fb * v;
  }
  return y;
}

/** synth_dsp `_allpass`: out[i] = -g x[i] + x[i - d] + g out[i - d]. */
export function allpass(x: ArrayLike<number>, d: number, g: number): Float64Array {
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = -g * x[i]! + (i >= d ? x[i - d]! + g * out[i - d]! : 0);
  return out;
}

export type RefReverbKind = 'room' | 'plate';
export const REF_REVERBS: Readonly<Record<RefReverbKind, { combs: ReadonlyArray<readonly [number, number]>; pre: number; damp: number }>> = {
  room: { combs: [[0.030, 0.72], [0.037, 0.70], [0.041, 0.68], [0.044, 0.66]], pre: 0.005, damp: 0.2 },
  plate: { combs: [[0.022, 0.80], [0.029, 0.78], [0.034, 0.77], [0.038, 0.75]], pre: 0.002, damp: 0.1 },
};

/** synth_dsp `reverb` (Schroeder): length len(x) + 0.12 s, (1 - mix) dry + mix wet. */
export function reverb(x: ArrayLike<number>, rate: number, kind: RefReverbKind, mix: number, decay: number): Float64Array {
  const cfg = REF_REVERBS[kind];
  const n = x.length + Math.trunc(0.12 * rate);
  const xp = new Float64Array(n);
  const pre = Math.trunc(cfg.pre * rate);
  for (let i = 0; i < x.length && pre + i < n; i++) xp[pre + i] = x[i]!;
  let wet: Float64Array = new Float64Array(n);
  for (const [sec, g] of cfg.combs) {
    const c = comb(xp, Math.max(1, Math.trunc(sec * rate)), Math.min(0.96, g * decay), cfg.damp);
    for (let i = 0; i < n; i++) wet[i] = wet[i]! + c[i]!;
  }
  for (let i = 0; i < n; i++) wet[i] = wet[i]! / cfg.combs.length;
  wet = allpass(wet, Math.trunc(0.005 * rate), 0.7);
  wet = allpass(wet, Math.trunc(0.0017 * rate), 0.7);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = (1 - mix) * (i < x.length ? x[i]! : 0) + mix * wet[i]!;
  return out;
}

/** sampler.py `reverb` kinds the scratch channel uses: the input's length, (1 - mix) x + mix wet. */
export function samplerReverb(x: ArrayLike<number>, rate: number, kind: 'short_plate' | 'dark_room', mix = 1.0): Float64Array {
  const wet = kind === 'dark_room'
    ? lp(reverb(x, rate, 'room', 1.0, 0.8), 2400, rate)
    : hp(lp(reverb(x, rate, 'plate', 1.0, 0.7), 6000, rate), 350, rate);
  const out = Float64Array.from(x);
  const n = Math.min(x.length, wet.length);
  for (let i = 0; i < n; i++) out[i] = (1 - mix) * out[i]! + mix * wet[i]!;
  return out;
}

/** synth_dsp `delay(kind="tape")`: the echo line with damp >= 0.35, tanh(1.2 x) and 2-sample wow in the loop. */
export function tapeDelay(x: ArrayLike<number>, rate: number, delaySec: number, fb: number, mix: number, damp: number): Float64Array {
  const d = Math.max(1, Math.trunc(delaySec * rate));
  const dmp = Math.max(damp, 0.35), sat = 1.2, wowDepth = 2.0;
  const n = x.length;
  const buf = new Float64Array(n + Math.trunc(d * 6));
  for (let i = 0; i < n; i++) buf[i] = x[i]!;
  let lpState = 0;
  for (let i = d; i < buf.length; i++) {
    const dd = d + Math.trunc(wowDepth * Math.sin(2 * Math.PI * 0.7 * i / rate));
    let v = i - dd >= 0 ? buf[i - dd]! : 0.0;
    lpState = (1 - dmp) * v + dmp * lpState;
    v = Math.tanh(sat * lpState);
    buf[i] = buf[i]! + fb * v;
  }
  const len = n + Math.trunc(d * 4);
  const out = new Float64Array(len);
  for (let i = 0; i < len; i++) out[i] = (1 - mix) * (i < n ? x[i]! : 0) + mix * buf[i]!;
  return out;
}

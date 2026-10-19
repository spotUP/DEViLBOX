/**
 * Mirror of the Up Rough demo system's tools/portable_math.py: exp, expm1, tanh, sin and cos whose bits do not
 * depend on the JavaScript engine or the machine's libm. Math.exp / Math.tanh / Math.sin / Math.cos are
 * engine-defined (V8 and SpiderMonkey ship fdlibm, JavaScriptCore calls the system libm), so a port that uses
 * them is not the Python render on every browser.
 *
 * exp, expm1, tanh: fdlibm e_exp.c, s_expm1.c, s_tanh.c line for line. sin, cos: musl's __sin / __cos kernels
 * (shared with portableIir.ts) after musl's __rem_pio2 medium-path reduction, used for every finite x (the
 * Python does the same; musl's Payne-Hanek path above 2^20*pi/2 is not ported on either side).
 * JavaScript never contracts a*b+c into a fused multiply-add, so every expression is one rounded IEEE double
 * operation per operator, in the Python's order.
 */
import { C1, C2, C3, C4, C5, C6, S1, S2, S3, S4, S5, S6 } from './portableIir';

const buf = new DataView(new ArrayBuffer(8));
function fromBits(hi: number, lo: number): number {
  buf.setUint32(0, hi >>> 0);
  buf.setUint32(4, lo >>> 0);
  return buf.getFloat64(0);
}
function highWord(x: number): number {
  buf.setFloat64(0, x);
  return buf.getUint32(0);
}
/** 2^k for integer k in [-1022, 1023]. */
function pow2(k: number): number { return fromBits((k + 1023) * 0x100000, 0); }

const LN2_HI = 6.93147180369123816490e-01;
const LN2_LO = 1.90821492927058770002e-10;
const INVLN2 = 1.44269504088896338700e+00;
const O_THRESHOLD = 7.09782712893383973096e+02;
const U_THRESHOLD = -7.45133219101941108420e+02;
const P1 = 1.66666666666666019037e-01, P2 = -2.77777777770155933842e-03, P3 = 6.61375632143793436117e-05;
const P4 = -1.65339022054652515390e-06, P5 = 4.13813679705723846039e-08;
const Q1 = -3.33333333333331316428e-02, Q2 = 1.58730158725481460165e-03, Q3 = -7.93650757867487942473e-05;
const Q4 = 4.00821782732936239552e-06, Q5 = -2.01099218183624371326e-07;
const TWO1023 = 8.98846567431157953865e+307;
const TWOM1000 = 9.33263618503218878990e-302;
const TOINT = 6755399441055744.0;
const PIO4 = 7.85398163397448278999e-01;
const INVPIO2 = 6.36619772367581382433e-01;
const PIO2_1 = 1.57079632673412561417e+00, PIO2_1T = 6.07710050650619224932e-11;
const PIO2_2 = 6.07710050630396597660e-11, PIO2_2T = 2.02226624879595063154e-21;
const PIO2_3 = 2.02226624871116645580e-21, PIO2_3T = 8.47842766036889956997e-32;

/** fdlibm __ieee754_exp. */
export function pexp(x: number): number {
  const hw = highWord(x);
  const neg = (hw & 0x80000000) !== 0;
  const hx = hw & 0x7fffffff;
  if (hx >= 0x40862e42) {
    if (hx >= 0x7ff00000) return Number.isNaN(x) ? x + x : (neg ? 0.0 : x);
    if (x > O_THRESHOLD) return Infinity;
    if (x < U_THRESHOLD) return 0.0;
  }
  let hi = x, lo = 0.0, k = 0;
  if (hx > 0x3fd62e42) {
    if (hx < 0x3ff0a2b2) {
      const s = neg ? -1.0 : 1.0;
      hi = x - s * LN2_HI; lo = s * LN2_LO; k = neg ? -1 : 1;
    } else {
      const kf = Math.trunc(INVLN2 * x + (neg ? -0.5 : 0.5));
      k = kf; hi = x - kf * LN2_HI; lo = kf * LN2_LO;
    }
    x = hi - lo;
  } else if (hx < 0x3e300000) {
    return 1.0 + x;
  }
  const t = x * x;
  const c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  if (k === 0) return 1.0 - ((x * c) / (c - 2.0) - x);
  const y = 1.0 - ((lo - (x * c) / (2.0 - c)) - hi);
  if (k < -1021) return y * pow2(k + 1000) * TWOM1000;
  if (k === 1024) return y * 2.0 * TWO1023;
  return y * pow2(k);
}

/** fdlibm expm1. */
export function pexpm1(x: number): number {
  const hw = highWord(x);
  const neg = (hw & 0x80000000) !== 0;
  const hx = hw & 0x7fffffff;
  if (hx >= 0x4043687a) {
    if (hx >= 0x40862e42) {
      if (hx >= 0x7ff00000) return Number.isNaN(x) ? x + x : (neg ? -1.0 : x);
      if (x > O_THRESHOLD) return Infinity;
    }
    if (neg) return -1.0;
  }
  let hi: number, lo: number, k: number, c = 0.0;
  if (hx > 0x3fd62e42) {
    if (hx < 0x3ff0a2b2) {
      if (!neg) { hi = x - LN2_HI; lo = LN2_LO; k = 1; } else { hi = x + LN2_HI; lo = -LN2_LO; k = -1; }
    } else {
      const kf = Math.trunc(INVLN2 * x + (neg ? -0.5 : 0.5));
      k = kf; hi = x - kf * LN2_HI; lo = kf * LN2_LO;
    }
    x = hi - lo;
    c = (hi - x) - lo;
  } else if (hx < 0x3c900000) {
    return x;
  } else {
    k = 0;
  }
  const hfx = 0.5 * x;
  const hxs = x * hfx;
  const r1 = 1.0 + hxs * (Q1 + hxs * (Q2 + hxs * (Q3 + hxs * (Q4 + hxs * Q5))));
  const t = 3.0 - r1 * hfx;
  let e = hxs * ((r1 - t) / (6.0 - x * t));
  if (k === 0) return x - (x * e - hxs);
  e = (x * (e - c) - c);
  e = e - hxs;
  if (k === -1) return 0.5 * (x - e) - 0.5;
  if (k === 1) return x < -0.25 ? -2.0 * (e - (x + 0.5)) : 1.0 + 2.0 * (x - e);
  if (k <= -2 || k > 56) {
    let y = 1.0 - (e - x);
    y = k === 1024 ? y * 2.0 * TWO1023 : y * pow2(k);
    return y - 1.0;
  }
  if (k < 20) {
    const tt = fromBits(0x3ff00000 - (0x200000 >> k), 0);
    return (tt - (e - x)) * pow2(k);
  }
  const tt = fromBits((0x3ff - k) * 0x100000, 0);
  let y = x - (e + tt);
  y = y + 1.0;
  return y * pow2(k);
}

/** fdlibm tanh. */
export function ptanh(x: number): number {
  const hw = highWord(x);
  const neg = (hw & 0x80000000) !== 0;
  const ix = hw & 0x7fffffff;
  if (ix >= 0x7ff00000) return neg ? 1.0 / x - 1.0 : 1.0 / x + 1.0;
  let z: number;
  if (ix < 0x40360000) {
    if (ix < 0x3e300000) return x * (1.0 + x);
    const ax = Math.abs(x);
    if (ix >= 0x3ff00000) {
      const t = pexpm1(2.0 * ax);
      z = 1.0 - 2.0 / (t + 2.0);
    } else {
      const t = pexpm1(-2.0 * ax);
      z = -t / (t + 2.0);
    }
  } else {
    z = 1.0;
  }
  return neg ? -z : z;
}

function ksin(x: number, y: number): number {
  const z = x * x;
  const w = z * z;
  const r = S2 + z * (S3 + z * S4) + z * w * (S5 + z * S6);
  const v = z * x;
  return x - ((z * (0.5 * y - v * r) - y) - v * S1);
}

function kcos(x: number, y: number): number {
  const z = x * x;
  let w = z * z;
  const r = z * (C1 + z * (C2 + z * C3)) + w * w * (C4 + z * (C5 + z * C6));
  const hz = 0.5 * z;
  w = 1.0 - hz;
  return w + (((1.0 - w) - hz) + (z * r - x * y));
}

function expo(x: number): number { return (highWord(x) >>> 20) & 0x7ff; }

/** musl __rem_pio2 medium path, returning the quadrant (n & 3) and y0, y1. */
function remPio2(x: number, ix: number): [number, number, number] {
  let fn = x * INVPIO2 + TOINT - TOINT;
  let r = x - fn * PIO2_1;
  let w = fn * PIO2_1T;
  if (r - w < -PIO4) { fn = fn - 1.0; r = x - fn * PIO2_1; w = fn * PIO2_1T; }
  else if (r - w > PIO4) { fn = fn + 1.0; r = x - fn * PIO2_1; w = fn * PIO2_1T; }
  let y0 = r - w;
  const ex = ix >>> 20;
  if (ex - expo(y0) > 16) {
    let t = r;
    w = fn * PIO2_2;
    r = t - w;
    w = fn * PIO2_2T - ((t - r) - w);
    y0 = r - w;
    if (ex - expo(y0) > 49) {
      t = r;
      w = fn * PIO2_3;
      r = t - w;
      w = fn * PIO2_3T - ((t - r) - w);
      y0 = r - w;
    }
  }
  const y1 = (r - y0) - w;
  const q = ((fn % 4) + 4) % 4;
  return [q, y0, y1];
}

/** musl sin with the medium-path reduction for every finite x. */
export function psin(x: number): number {
  const ix = highWord(x) & 0x7fffffff;
  if (ix >= 0x7ff00000) return x - x;
  if (ix <= 0x3fe921fb) return ix < 0x3e500000 ? x : ksin(x, 0.0);
  const [q, y0, y1] = remPio2(x, ix);
  if (q === 0) return ksin(y0, y1);
  if (q === 1) return kcos(y0, y1);
  if (q === 2) return -ksin(y0, y1);
  return -kcos(y0, y1);
}

/** musl cos with the medium-path reduction for every finite x. */
export function pcos(x: number): number {
  const ix = highWord(x) & 0x7fffffff;
  if (ix >= 0x7ff00000) return x - x;
  if (ix <= 0x3fe921fb) return ix < 0x3e46a09e ? 1.0 : kcos(x, 0.0);
  const [q, y0, y1] = remPio2(x, ix);
  if (q === 0) return kcos(y0, y1);
  if (q === 1) return -ksin(y0, y1);
  if (q === 2) return -kcos(y0, y1);
  return ksin(y0, y1);
}

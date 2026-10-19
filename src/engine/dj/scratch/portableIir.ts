/**
 * Mirror of the Up Rough demo system's tools/portable_iir.py: a Butterworth design whose bytes do not
 * depend on the machine's libm. The Python reference designs every butter() through it, so this port
 * must give the same float64 bits, operation for operation (spec:
 * thoughts/shared/research/2026-10-19_portable_synth_filters.md, "Operation-order spec for the TS mirror").
 *
 * Never Math.tan / Math.sin / Math.cos / Math.hypot here: tan, sin and cos are musl's kernels
 * (src/math/__tan.c, __sin.c, __cos.c, __rem_pio2.c n = 1), constants copied by bit pattern.
 * JavaScript never contracts a*b+c into a fused multiply-add, so each expression below is one rounded
 * IEEE double operation per operator, evaluated left to right like the Python.
 */

const buf = new DataView(new ArrayBuffer(8));

/** The double with this bit pattern (hi:lo, 32 bits each). */
function fromBits(hi: number, lo: number): number {
  buf.setUint32(0, hi >>> 0);
  buf.setUint32(4, lo >>> 0);
  return buf.getFloat64(0);
}

function highWord(x: number): number {
  buf.setFloat64(0, x);
  return buf.getUint32(0);
}

function clearLowWord(x: number): number {
  buf.setFloat64(0, x);
  buf.setUint32(4, 0);
  return buf.getFloat64(0);
}

const T: readonly number[] = [
  fromBits(0x3fd55555, 0x55555563), fromBits(0x3fc11111, 0x1110fe7a), fromBits(0x3faba1ba, 0x1bb341fe),
  fromBits(0x3f9664f4, 0x8406d637), fromBits(0x3f8226e3, 0xe96e8493), fromBits(0x3f6d6d22, 0xc9560328),
  fromBits(0x3f57dbc8, 0xfee08315), fromBits(0x3f4344d8, 0xf2f26501), fromBits(0x3f3026f7, 0x1a8d1068),
  fromBits(0x3f147e88, 0xa03792a6), fromBits(0x3f12b80f, 0x32f0a7e9), fromBits(0xbef375cb, 0xdb605373),
  fromBits(0x3efb2a70, 0x74bf7ad4),
];
const PIO4 = fromBits(0x3fe921fb, 0x54442d18);
const PIO4LO = fromBits(0x3c81a626, 0x33145c07);
const PIO2_1 = fromBits(0x3ff921fb, 0x54400000);
const PIO2_1T = fromBits(0x3dd0b461, 0x1a626331);
const S1 = fromBits(0xbfc55555, 0x55555549), S2 = fromBits(0x3f811111, 0x1110f8a6);
const S3 = fromBits(0xbf2a01a0, 0x19c161d5), S4 = fromBits(0x3ec71de3, 0x57b1fe7d);
const S5 = fromBits(0xbe5ae5e6, 0x8a2b9ceb), S6 = fromBits(0x3de5d93a, 0x5acfd57c);
const C1 = fromBits(0x3fa55555, 0x5555554c), C2 = fromBits(0xbf56c16c, 0x16c15177);
const C3 = fromBits(0x3efa01a0, 0x19cb1590), C4 = fromBits(0xbe927e4f, 0x809c52ad);
const C5 = fromBits(0x3e21ee9e, 0xbdb4b1c4), C6 = fromBits(0xbda8fae9, 0xbe8838d4);

/** musl __tan(x, y, odd): tan(x+y) (odd = 0) or -1/tan(x+y) (odd = 1), |x+y| <= ~pi/4. */
function kernelTan(x: number, y: number, odd: 0 | 1): number {
  const hx = highWord(x);
  const big = (hx & 0x7fffffff) >= 0x3fe59428;
  let sign = 0;
  if (big) {
    sign = hx >>> 31;
    if (sign) { x = -x; y = -y; }
    x = (PIO4 - x) + (PIO4LO - y);
    y = 0.0;
  }
  const z = x * x;
  let w = z * z;
  let r = T[1]! + w * (T[3]! + w * (T[5]! + w * (T[7]! + w * (T[9]! + w * T[11]!))));
  let v = z * (T[2]! + w * (T[4]! + w * (T[6]! + w * (T[8]! + w * (T[10]! + w * T[12]!)))));
  let s = z * x;
  r = y + z * (s * (r + v) + y) + s * T[0]!;
  w = x + r;
  if (big) {
    s = 1 - 2 * odd;
    v = s - 2.0 * (x + (r - w * w / (w + s)));
    return sign ? -v : v;
  }
  if (!odd) return w;
  const w0 = clearLowWord(w);
  v = r - (w0 - x);
  const a = -1.0 / w;
  const a0 = clearLowWord(a);
  return a0 + a * (1.0 + a0 * w0 + a0 * v);
}

/** Portable tan for 0 <= x < pi/2 (musl tan, rem_pio2 n = 0 / 1 only); anything else throws. */
export function portableTan(x: number): number {
  if (!(x >= 0.0 && x < PIO2_1)) throw new RangeError(`portableTan: ${x} outside [0, pi/2)`);
  const ix = highWord(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) {
    if (ix < 0x3e400000) return x;
    return kernelTan(x, 0.0, 0);
  }
  if ((ix & 0xfffff) === 0x921fb) throw new RangeError(`portableTan: ${x} too close to pi/2`);
  const z = x - PIO2_1;
  const y0 = z - PIO2_1T;
  const y1 = (z - y0) - PIO2_1T;
  return kernelTan(y0, y1, 1);
}

/** musl __sin(x, 0, 0), |x| <= pi/4. */
export function kernelSin(x: number): number {
  const z = x * x;
  const w = z * z;
  const r = S2 + z * (S3 + z * S4) + z * w * (S5 + z * S6);
  const v = z * x;
  return x + v * (S1 + z * r);
}

/** musl __cos(x, 0), |x| <= pi/4. */
export function kernelCos(x: number): number {
  const z = x * x;
  let w = z * z;
  const r = z * (C1 + z * (C2 + z * C3)) + w * w * (C4 + z * (C5 + z * C6));
  const hz = 0.5 * z;
  w = 1.0 - hz;
  return w + (((1.0 - w) - hz) + z * r);
}

/** (cos, sin) of pi*m/(2n), 0 <= m <= n, from the kernels only. */
function cosSinFrac(m: number, n: number): [number, number] {
  if (m === 0) return [1.0, 0.0];
  if (m === n) return [0.0, 1.0];
  if (2 * m <= n) {
    let t = Math.PI * m;
    t = t / (2 * n);
    return [kernelCos(t), kernelSin(t)];
  }
  let t = Math.PI * (n - m);
  t = t / (2 * n);
  return [kernelSin(t), kernelCos(t)];
}

// ── complex numbers as (re, im) pairs, fixed formulas ────────────────────

type C = readonly [number, number];
const cmul = (p: C, q: C): C => [p[0] * q[0] - p[1] * q[1], p[0] * q[1] + p[1] * q[0]];
function cdiv(p: C, q: C): C {
  const den = q[0] * q[0] + q[1] * q[1];
  return [(p[0] * q[0] + p[1] * q[1]) / den, (p[1] * q[0] - p[0] * q[1]) / den];
}
function csqrt(p: C): C {
  const m = Math.sqrt(p[0] * p[0] + p[1] * p[1]);
  const re = Math.sqrt((m + p[0]) * 0.5);
  const im = Math.sqrt((m - p[0]) * 0.5);
  return [re, p[1] < 0.0 ? -im : im];
}
function cprod(seq: readonly C[]): C {
  let acc: C = [1.0, 0.0];
  for (const v of seq) acc = cmul(acc, v);
  return acc;
}
/** Coefficients of prod(s - r), highest power first, roots in list order. */
function poly(roots: readonly C[]): C[] {
  let c: C[] = [[1.0, 0.0]];
  for (const r of roots) {
    const nxt: C[] = [c[0]!];
    for (let j = 1; j < c.length; j++) {
      const m = cmul(r, c[j - 1]!);
      nxt.push([c[j]![0] - m[0], c[j]![1] - m[1]]);
    }
    const m = cmul(r, c[c.length - 1]!);
    nxt.push([0.0 - m[0], 0.0 - m[1]]);
    c = nxt;
  }
  return c;
}

function warp(wn: number): number {
  if (!(wn > 0.0 && wn < 1.0)) throw new RangeError(`portableButter: Wn ${wn} outside (0, 1)`);
  let t = Math.PI * wn;
  t = t / 2.0;
  return 4.0 * portableTan(t);
}

export interface PortableBa { b: number[]; a: number[] }

/** portable_iir.butter(N, Wn, btype): scipy's digital Butterworth (zpk -> bilinear fs = 2 -> tf). */
export function portableButter(N: number, Wn: number | readonly [number, number], btype: 'low' | 'high' | 'band'): PortableBa {
  if (!(Number.isInteger(N) && N >= 1 && N <= 32)) throw new RangeError(`portableButter: order ${N} outside 1..32`);
  const proto: C[] = [];
  for (let m = -N + 1; m < N; m += 2) {
    const [c, s] = cosSinFrac(Math.abs(m), N);
    if (m === 0) proto.push([-1.0, 0.0]);
    else if (m > 0) proto.push([-c, -s]);
    else proto.push([-c, s]);
  }
  let poles: C[], zeros: C[], k: number;
  if (btype === 'low') {
    const wo = warp(Wn as number);
    poles = proto.map((p) => [p[0] * wo, p[1] * wo] as C);
    zeros = [];
    k = 1.0;
    for (let i = 0; i < N; i++) k = k * wo;
  } else if (btype === 'high') {
    const wo = warp(Wn as number);
    poles = proto.map((p) => cdiv([wo, 0.0], p));
    zeros = Array.from({ length: N }, () => [0.0, 0.0] as C);
    const neg = cprod(proto.map((p) => [-p[0], -p[1]] as C));
    k = cdiv([1.0, 0.0], neg)[0];
  } else {
    const [lo, hi] = Wn as readonly [number, number];
    const wo1 = warp(lo);
    const wo2 = warp(hi);
    const bw = wo2 - wo1;
    const wo = Math.sqrt(wo1 * wo2);
    const woSq = wo * wo;
    const plp = proto.map((p) => [(p[0] * bw) / 2.0, (p[1] * bw) / 2.0] as C);
    const roots = plp.map((p) => { const sq = cmul(p, p); return csqrt([sq[0] - woSq, sq[1]]); });
    poles = [
      ...plp.map((p, i) => [p[0] + roots[i]![0], p[1] + roots[i]![1]] as C),
      ...plp.map((p, i) => [p[0] - roots[i]![0], p[1] - roots[i]![1]] as C),
    ];
    zeros = Array.from({ length: N }, () => [0.0, 0.0] as C);
    k = 1.0;
    for (let i = 0; i < N; i++) k = k * bw;
  }
  const fs2 = 4.0;
  const zd = zeros.map((z) => cdiv([fs2 + z[0], z[1]], [fs2 - z[0], 0.0 - z[1]]));
  const pd = poles.map((p) => cdiv([fs2 + p[0], p[1]], [fs2 - p[0], 0.0 - p[1]]));
  while (zd.length < pd.length) zd.push([-1.0, 0.0]);
  const num = cprod(zeros.map((z) => [fs2 - z[0], 0.0 - z[1]] as C));
  const den = cprod(poles.map((p) => [fs2 - p[0], 0.0 - p[1]] as C));
  const kd = k * cdiv(num, den)[0];
  return { b: poly(zd).map((c) => kd * c[0]), a: poly(pd).map((c) => c[0]) };
}

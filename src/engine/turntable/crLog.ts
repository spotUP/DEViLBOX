/**
 * Correctly rounded natural logarithm of a positive finite double, by 110-bit BigInt fixed point
 * (ln m = 2 atanh((m-1)/(m+1)) on m in [0.707, 1.414), plus e ln 2). numpy's randn takes its `log` from the host libm,
 * which on the reference machine agrees with the correctly rounded value; V8's Math.log (fdlibm) and plog differ from
 * it by one ulp on a few percent of inputs, and randn amplifies that into visible last-digit differences.
 */
const BITS = 110n;
const ONE = 1n << BITS;

/** 2 atanh(num / den) at BITS fractional bits, for |num/den| < 0.2. */
function twoAtanh(num: bigint, den: bigint): bigint {
  const neg = num < 0n;
  const z = ((neg ? -num : num) << BITS) / den; // magnitude only: BigInt >> floors negatives and would never reach 0
  const zz = (z * z) >> BITS;
  let term = z, sum = 0n;
  for (let k = 1n; term !== 0n; k += 2n) {
    sum += term / k;
    term = (term * zz) >> BITS;
  }
  return neg ? -2n * sum : 2n * sum;
}

const LN2 = twoAtanh(1n, 3n);
const F64 = new Float64Array(1);
const U64 = new BigUint64Array(F64.buffer);

function toDouble(v: bigint): number {
  const neg = v < 0n;
  if (neg) v = -v;
  if (v === 0n) return 0;
  const bl = v.toString(2).length;
  let q = v, sh = 0;
  if (bl > 53) {
    sh = bl - 53;
    const s = BigInt(sh);
    q = v >> s;
    const rem = v & ((1n << s) - 1n), half = 1n << (s - 1n);
    if (rem > half || (rem === half && (q & 1n) === 1n)) q += 1n;
  }
  const out = Number(q) * 2 ** (sh - Number(BITS));
  return neg ? -out : out;
}

export function crLog(x: number): number {
  if (!(x > 0) || !Number.isFinite(x)) return Math.log(x);
  F64[0] = x;
  const bits = U64[0]!;
  let e = Number((bits >> 52n) & 0x7ffn);
  let mi = bits & 0xfffffffffffffn;
  if (e === 0) return Math.log(x); // subnormal: not reachable from randn
  mi |= 1n << 52n;
  e -= 1023;
  // m = mi / 2^52 in [1, 2); fold to [0.707, 1.414) by halving when m > sqrt 2
  let shift = 52n;
  if (mi * mi > 2n << 104n) { shift = 53n; e += 1; }
  const m = mi << (BITS - shift);
  const lnm = twoAtanh(m - ONE, m + ONE);
  return toDouble(BigInt(e) * LN2 + lnm);
}

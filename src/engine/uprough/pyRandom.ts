/**
 * CPython 3.11 `random.Random` (MT19937), bit-exact (plan 2026-10-19 O6d-0). `Random(n)` for an int seeds through
 * `init_by_array` over the 32-bit little-endian words of abs(n); this is NOT numpy's `init_genrand(n)` path, so the
 * state differs from `NumpyRandomState`.
 *
 * Seeds can exceed 2^31 and 2^32 (`seed ^ 0x4A77`, `(seed << 4) ^ i`). Callers MUST compute such seeds with Python
 * int semantics (BigInt: `(BigInt(seed) << 4n) ^ BigInt(i)`), never JS int32 `<<` / `^`, then pass the bigint.
 */

const N = 624;
const M = 397;

export class PyRandom {
  private readonly mt = new Uint32Array(N);
  private mti = N + 1;

  constructor(seed: number | bigint) {
    if (typeof seed === 'number' && !Number.isInteger(seed)) throw new RangeError('PyRandom seeds are integers');
    let n = BigInt(seed);
    if (n < 0n) n = -n;
    const key: number[] = [];
    while (n > 0n) { key.push(Number(n & 0xffffffffn)); n >>= 32n; }
    if (key.length === 0) key.push(0);
    this.initByArray(key);
  }

  private initGenrand(s: number): void {
    const mt = this.mt;
    mt[0] = s >>> 0;
    for (let i = 1; i < N; i++) {
      const prev = mt[i - 1]! ^ (mt[i - 1]! >>> 30);
      mt[i] = (Math.imul(1812433253, prev) + i) >>> 0;
    }
    this.mti = N;
  }

  private initByArray(key: number[]): void {
    const mt = this.mt;
    this.initGenrand(19650218);
    let i = 1, j = 0;
    for (let k = Math.max(N, key.length); k > 0; k--) {
      const prev = mt[i - 1]! ^ (mt[i - 1]! >>> 30);
      mt[i] = ((mt[i]! ^ Math.imul(prev, 1664525)) + key[j]! + j) >>> 0;
      i++; j++;
      if (i >= N) { mt[0] = mt[N - 1]!; i = 1; }
      if (j >= key.length) j = 0;
    }
    for (let k = N - 1; k > 0; k--) {
      const prev = mt[i - 1]! ^ (mt[i - 1]! >>> 30);
      mt[i] = ((mt[i]! ^ Math.imul(prev, 1566083941)) - i) >>> 0;
      i++;
      if (i >= N) { mt[0] = mt[N - 1]!; i = 1; }
    }
    mt[0] = 0x80000000;
    this.mti = N;
  }

  private genrand(): number {
    const mt = this.mt;
    if (this.mti >= N) {
      for (let k = 0; k < N; k++) {
        const y = (mt[k]! & 0x80000000) | (mt[(k + 1) % N]! & 0x7fffffff);
        mt[k] = (mt[(k + M) % N]! ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0)) >>> 0;
      }
      this.mti = 0;
    }
    let y = mt[this.mti++]!;
    y ^= y >>> 11;
    y = (y ^ ((y << 7) & 0x9d2c5680)) >>> 0;
    y = (y ^ ((y << 15) & 0xefc60000)) >>> 0;
    y ^= y >>> 18;
    return y >>> 0;
  }

  /** `random()`: 53-bit double in [0, 1). */
  random(): number {
    const a = this.genrand() >>> 5, b = this.genrand() >>> 6;
    return (a * 67108864 + b) / 9007199254740992;
  }

  /** `getrandbits(k)`: a number when the result is a safe integer, else a bigint (k > 53 only). */
  getrandbits(k: number): number | bigint {
    if (!Number.isInteger(k) || k < 0) throw new RangeError('number of bits must be non-negative');
    if (k === 0) return 0;
    if (k <= 32) return this.genrand() >>> (32 - k);
    // k > 32: words little-endian, the last word shifted down (CPython _random_Random_getrandbits_impl)
    let r = 0n, shift = 0n;
    for (let rem = k; rem > 0; rem -= 32, shift += 32n) {
      let w = this.genrand();
      if (rem < 32) w >>>= 32 - rem;
      r |= BigInt(w) << shift;
    }
    return r <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(r) : r;
  }

  /** `_randbelow_with_getrandbits(n)`, n >= 1 and < 2^32 here. */
  private randbelow(n: number): number {
    if (n <= 0) throw new RangeError('empty range');
    const k = 32 - Math.clz32(n); // int.bit_length(); 3.11 uses n, not n - 1
    let r = this.getrandbits(k) as number;
    while (r >= n) r = this.getrandbits(k) as number;
    return r;
  }

  /** `randrange(stop)` / `randrange(start, stop)` (step 1). Widths up to 2^32. */
  randrange(a: number, b?: number): number {
    const start = b === undefined ? 0 : a;
    const stop = b === undefined ? a : b;
    const width = stop - start;
    if (width <= 0) throw new RangeError('empty range for randrange()');
    if (width > 0xffffffff) throw new RangeError('PyRandom.randrange supports widths up to 2^32 - 1');
    return start + this.randbelow(width);
  }

  /** `uniform(a, b)` = `a + (b - a) * random()`. */
  uniform(a: number, b: number): number {
    return a + (b - a) * this.random();
  }
}

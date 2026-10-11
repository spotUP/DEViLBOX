/**
 * Deterministic random for the placement brain (owner plan section 36; D6;
 * ledger SCR-P4.3). The reference `tools/scratch.py _lfsr`: a 31-bit
 * xorshift whose output is `(s & 0xFFFF) / 65535`. The same seed gives the
 * same events in the browser and in the Python generator, so the reference's
 * output is the test fixture.
 */

const MASK = 0x7fffffff;

export type ScratchRandom = () => number;

/** `_lfsr(seed)`: seed 0 becomes 1; JS shifts are 32-bit, masked to 31 bits like the reference. */
export function lfsr(seed: number): ScratchRandom {
  let s = (Math.trunc(seed) & MASK) || 1;
  return () => {
    s ^= (s << 13) & MASK;
    s ^= s >>> 17;
    s ^= (s << 5) & MASK;
    return (s & 0xffff) / 65535;
  };
}

/** zlib.crc32 of an ASCII string (the reference seeds with `crc32(section) % 97`). */
export function crc32(text: string): number {
  let c = ~0;
  for (let i = 0; i < text.length; i++) {
    c ^= text.charCodeAt(i) & 0xff;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

/** The reference's per-bar seed: `seed*71 + bar*7 + crc32(section) % 97`. */
export function barSeed(seed: number, bar: number, section: string): number {
  return seed * 71 + bar * 7 + (crc32(section) % 97);
}

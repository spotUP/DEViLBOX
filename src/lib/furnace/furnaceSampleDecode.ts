/**
 * Decode a Furnace sample to linear 16-bit PCM, the way Furnace's
 * DivSample::render() fills data16 before a chip plays it.
 *
 * FurnaceSongParser keeps depths other than 8 and 16 as the raw codec bytes
 * (about length/2 bytes for 4-bit codecs), so an exporter that reads
 * `data[i]` as PCM plays codec bytes for the first half and silence after.
 * Ports of third-party/furnace-master/extern/adpcm/{ymb,bs}_codec.c.
 */
import type { FurnaceSample } from '../import/formats/FurnaceSongParser';

const clamp = (x: number, lo: number, hi: number) => (x > hi ? hi : x < lo ? lo : x);

/** Signed 4-bit nibbles, high nibble first (as the C `(int8)byte << nibble >> 4`). */
function nibbles(bytes: Uint8Array, len: number, step: (n: number) => number): Int16Array {
  const out = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    const b = bytes[i >> 1] ?? 0;
    const n = (i & 1) ? b & 15 : b >> 4;
    out[i] = step(n >= 8 ? n - 16 : n);
  }
  return out;
}

const YMB_STEP = [57, 57, 57, 57, 77, 102, 128, 153];
function ymbDecode(bytes: Uint8Array, len: number): Int16Array {
  let stepSize = 127, hist = 0;
  return nibbles(bytes, len, (s) => {
    const delta = s & 7, diff = ((1 + (delta << 1)) * stepSize) >> 3;
    const v = (s & 8) ? hist - diff : hist + diff;
    stepSize = clamp((YMB_STEP[delta] * stepSize) >> 6, 127, 24576);
    return (hist = clamp(v, -32768, 32767));
  });
}

const BS_TABLE = [154, 154, 128, 102, 77, 58, 58, 58, 58, 58, 58, 58, 77, 102, 128, 154];
function bsDecode(bytes: Uint8Array, len: number): Int16Array {
  let scale = 10, hist = 0;
  return nibbles(bytes, len, (s) => {
    let delta = ((1 + Math.abs(s << 1)) * scale) >> 1;
    if (s <= 0) delta = -delta;
    hist = clamp(hist + delta, -32768, 32767);
    scale = clamp((scale * BS_TABLE[8 + s]) >> 6, 1, 2000);
    return hist;
  });
}

/**
 * PCM for the sample (Int8Array / Int16Array), or null for a codec not ported yet.
 * Depth 8 / 16 are returned as stored.
 */
export function furnaceSamplePcm(smp: FurnaceSample): Int8Array | Int16Array | null {
  const d = smp.data;
  if (d instanceof Int16Array || d instanceof Int8Array) return d;
  if (smp.depth === 6) return ymbDecode(d, smp.length); // ADPCM-B
  if (smp.depth === 4) return bsDecode(d, smp.length); // QSound ADPCM
  return null;
}

/**
 * Digital Symphony LZW: a chunk the exporter compresses must read back whole
 * AND end where the next chunk starts. The reader knows each chunk's size and
 * stops at it, so it never reads an end code; a compressor that appended one
 * made the stream a word longer and shifted every later chunk (a Digital
 * Symphony export reopened as nothing).
 */
import { describe, it, expect } from 'vitest';
import { compressDSymLZW, decompressDSymLZW } from '../DSymLZW';

function trackLike(len: number, seed: number): Uint8Array {
  const out = new Uint8Array(len);
  let s = seed;
  for (let i = 0; i < len; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    // Mostly empty rows with some cells, like DSym track data.
    out[i] = (s >>> 24) < 40 ? (s >>> 16) & 0xff : 0;
  }
  return out;
}

describe('compressDSymLZW', () => {
  it.each([4, 112, 256, 1000, 11008, 40000, 120000])('a %i-byte chunk reads back whole and ends where the next chunk starts', (len) => {
    for (let seed = 1; seed <= 5; seed++) {
      const raw = trackLike(len, seed);
      const packed = compressDSymLZW(raw);
      // A following chunk's packing byte sits right after this one.
      const file = new Uint8Array(packed.length + 1);
      file.set(packed);
      file[packed.length] = 0xaa;
      const { output, endPos } = decompressDSymLZW(file, 0, len);
      expect(Array.from(output)).toEqual(Array.from(raw));
      expect(endPos, `len ${len} seed ${seed}`).toBe(packed.length);
    }
  });
});

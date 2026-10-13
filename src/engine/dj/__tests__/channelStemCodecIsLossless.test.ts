/**
 * The cached channel stems are lossless FLAC (2026-10-12: raw int16 stems were
 * ~4x the WAV and filled the cache). A stem decodes back to exactly its integer
 * samples (the decoder's scale is v / 32767), and an L == R stem (UADE, libopenmpt) costs about
 * what a mono one would.
 */
import { describe, it, expect } from 'vitest';
import { encodeStemFlac, decodeStemsFlac } from '../channelStemCodec';

describe('channel stem FLAC', () => {
  it('round-trips every sample exactly and stores an L == R stem at under a third of its int16 size', async () => {
    const n = 44100;
    const stem = new Int16Array(n * 2);
    let seed = 1;
    for (let i = 0; i < n; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const v = Math.round(8000 * Math.sin(i / 20) + ((seed >> 16) % 64) - 32);
      stem[2 * i] = v; stem[2 * i + 1] = v;
    }
    stem[0] = 32767; stem[1] = 32767; stem[2] = -32767; stem[3] = -32767;
    const flac = await encodeStemFlac(stem, 44100, 2); // a stereo stem (render version 4)
    expect(flac.byteLength).toBeLessThan(stem.byteLength / 3);
    const [decoded, silent] = await decodeStemsFlac([flac, new Uint8Array(0)]);
    expect(silent).toBeNull();
    expect(decoded![0].length).toBe(n);
    for (let i = 0; i < n; i++) {
      if (Math.round(decoded![0][i] * 32767) !== stem[2 * i] || Math.round(decoded![1][i] * 32767) !== stem[2 * i + 1]) {
        throw new Error(`sample ${i}: ${decoded![0][i] * 32767} / ${decoded![1][i] * 32767} vs ${stem[2 * i]}`);
      }
    }
  });

  it('round-trips a mono stem (render version 5: one channel per stem) exactly', async () => {
    const mono = Int16Array.from({ length: 4410 }, (_, i) => Math.round(12000 * Math.sin(i / 7)));
    const [decoded] = await decodeStemsFlac([await encodeStemFlac(mono, 44100)]);
    expect(decoded!.length).toBe(1);
    expect(Array.from(decoded![0], (v) => Math.round(v * 32767))).toEqual(Array.from(mono));
  });
});

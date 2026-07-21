import { describe, it, expect } from 'vitest';
import { encodeFlac, encodeOgg } from '../audioEncoders';

/**
 * Regression: FLAC + OGG export encoders produce decodable, sane audio.
 * Round-trips through the app's bundled DECODERS (@wasm-audio-decoders/*) so a
 * broken encoder (wrong layout, wrong scale, truncated stream) fails here.
 */

const SR = 44100;
const N = SR; // 1 s

function sine(freq: number, amp: number): [Float32Array, Float32Array] {
  const l = new Float32Array(N);
  const r = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    l[i] = amp * Math.sin((2 * Math.PI * freq * i) / SR);
    r[i] = l[i];
  }
  return [l, r];
}

function findSeq(hay: Uint8Array, needle: number[]): number {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

describe('audioEncoders — FLAC', () => {
  it('encodes a valid FLAC stream (magic + size)', async () => {
    const [l, r] = sine(440, 0.5);
    const bytes = await encodeFlac([l, r], SR, 16);
    expect(bytes.length).toBeGreaterThan(1000);
    expect(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])).toBe('fLaC');
  });

  it('round-trips losslessly within 16-bit quantization', async () => {
    const [l, r] = sine(440, 0.5);
    const bytes = await encodeFlac([l, r], SR, 16);
    const { FLACDecoder } = await import('@wasm-audio-decoders/flac');
    const decoder = new FLACDecoder();
    await decoder.ready;
    const decoded = await decoder.decodeFile(new Uint8Array(bytes));
    decoder.free();

    expect(decoded.sampleRate).toBe(SR);
    expect(decoded.channelData.length).toBe(2);
    expect(decoded.channelData[0].length).toBe(N);
    // Lossless: per-sample max error bounded by one 16-bit quantization step.
    let maxErr = 0;
    const d = decoded.channelData[0];
    for (let i = 0; i < N; i++) {
      const e = Math.abs(d[i] - l[i]);
      if (e > maxErr) maxErr = e;
    }
    expect(maxErr).toBeLessThan(1 / 32768 + 1e-6);
  });
});

describe('audioEncoders — OGG Vorbis', () => {
  it('encodes a structurally valid Ogg Vorbis stream', async () => {
    // NOTE: @wasm-audio-decoders/ogg-vorbis cannot instantiate under node 24
    // (instantiateStreaming Response quirk), so this asserts stream structure
    // instead of PCM round-trip: capture pattern header, identification packet
    // with our exact channel count + sample rate, and an end-of-stream page.
    const [l, r] = sine(440, 0.5);
    const bytes = await encodeOgg([l, r], SR, 5);
    expect(bytes.length).toBeGreaterThan(1000);
    const ascii = (off: number, len: number) => String.fromCharCode(...bytes.subarray(off, off + len));
    expect(ascii(0, 4)).toBe('OggS');

    // First packet: type 0x01 + "vorbis" identification header.
    const idIdx = findSeq(bytes, [0x01, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73]); // \x01vorbis
    expect(idIdx).toBeGreaterThan(-1);
    // Identification header layout: [type(1)][vorbis(6)][version(4)][channels(1)][sampleRate(4 LE)]
    expect(bytes[idIdx + 11]).toBe(2); // channels
    const sr = bytes[idIdx + 12] | (bytes[idIdx + 13] << 8) | (bytes[idIdx + 14] << 16) | (bytes[idIdx + 15] << 24);
    expect(sr).toBe(SR);

    // Multiple Ogg pages + a final end-of-stream page (header_type bit 0x04).
    let pages = 0;
    let sawEos = false;
    for (let i = 0; i + 5 < bytes.length; i++) {
      if (bytes[i] === 0x4f && bytes[i + 1] === 0x67 && bytes[i + 2] === 0x67 && bytes[i + 3] === 0x53) {
        pages++;
        if (bytes[i + 5] & 0x04) sawEos = true;
      }
    }
    expect(pages).toBeGreaterThan(2);
    expect(sawEos).toBe(true);
  });

  it('rejects empty input', async () => {
    await expect(encodeOgg([], SR)).rejects.toThrow();
    await expect(encodeFlac([], SR)).rejects.toThrow();
  });
});

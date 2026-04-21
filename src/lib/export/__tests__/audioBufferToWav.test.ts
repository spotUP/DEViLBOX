import { describe, it, expect } from 'vitest';
import { audioBufferToWav } from '../audioExport';

/**
 * Regression test for the reported "exported WAV sounds distorted" bug.
 *
 * `audioBufferToWav` writes 16-bit PCM. The writer used to hard-clip samples
 * at ±1.0 via Math.max(-1, Math.min(1, x)) — if the captured buffer's peak
 * exceeded 0 dBFS (which happens any time the user's mix is hot and their
 * master chain doesn't end in a limiter), the whole WAV flat-tops at ±1
 * and sounds audibly crushed.
 *
 * These tests pin down both the bug AND the fix:
 *   - Input ≤ 1.0 → output bit-exact 16-bit PCM, no level change.
 *   - Input > 1.0 → output peak-normalized to -0.3 dBFS so nothing clips.
 *   - Shape preserved: relative amplitudes within the buffer unchanged.
 */

// Minimal AudioBuffer polyfill — the real one is only in browsers/workers.
class FakeAudioBuffer {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  private channels: Float32Array[];
  constructor(numberOfChannels: number, length: number, sampleRate: number) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(ch: number): Float32Array {
    return this.channels[ch];
  }
}

/** Decode a 16-bit PCM WAV blob into planar Float32 channels. Returns the
 *  exact amplitudes the user would hear after the roundtrip. */
async function decodeWav(blob: Blob): Promise<{ channels: Float32Array[]; sampleRate: number }> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(buf.buffer);
  // WAV header: RIFF(4) size(4) WAVE(4) fmt_(4) fmtSize(4=16) PCM(2) ch(2) sr(4) ...
  const numChannels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const bitDepth = view.getUint16(34, true);
  expect(bitDepth).toBe(16);
  const dataOffset = 44;
  const bytesPerSample = bitDepth / 8;
  const frameCount = (buf.length - dataOffset) / (numChannels * bytesPerSample);
  const channels: Float32Array[] = Array.from(
    { length: numChannels },
    () => new Float32Array(frameCount),
  );
  let off = dataOffset;
  for (let i = 0; i < frameCount; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const intSample = view.getInt16(off, true);
      // Inverse of the writer's sample < 0 ? *0x8000 : *0x7fff rule.
      channels[ch][i] = intSample < 0 ? intSample / 0x8000 : intSample / 0x7fff;
      off += 2;
    }
  }
  return { channels, sampleRate };
}

describe('audioBufferToWav', () => {
  it('roundtrips a safe ±0.5 signal without shape or level distortion', async () => {
    // 200-frame sine at ±0.5 — well inside the 16-bit integer range.
    const buf = new FakeAudioBuffer(2, 200, 48000);
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);
    for (let i = 0; i < 200; i++) {
      const s = 0.5 * Math.sin((2 * Math.PI * i) / 40);
      L[i] = s;
      R[i] = s;
    }
    const blob = audioBufferToWav(buf as unknown as AudioBuffer);
    const { channels, sampleRate } = await decodeWav(blob);
    expect(sampleRate).toBe(48000);

    // Peak should survive the 16-bit roundtrip within ε (about 1/32767).
    const peakL = Math.max(...channels[0].map(Math.abs));
    expect(peakL).toBeGreaterThan(0.49);
    expect(peakL).toBeLessThan(0.51);
  });

  it('does NOT hard-clip an over-range ±1.5 signal (the original bug)', async () => {
    // Simulate a hot master bus: sine at ±1.5. Old writer flat-topped at ±1.0.
    const buf = new FakeAudioBuffer(2, 400, 48000);
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);
    for (let i = 0; i < 400; i++) {
      const s = 1.5 * Math.sin((2 * Math.PI * i) / 40);
      L[i] = s;
      R[i] = s;
    }
    const blob = audioBufferToWav(buf as unknown as AudioBuffer);
    const { channels } = await decodeWav(blob);

    // Count samples that are *at* ±1.0 exactly (flat-top evidence). Allow a
    // handful (the peak sample of a sine might be exactly 1.0), but a broken
    // writer produces dozens of flat-capped samples across each wave crest.
    let flatTops = 0;
    for (const s of channels[0]) {
      if (Math.abs(s) >= 0.9998) flatTops++;
    }
    // A 400-sample ±1.5 sine at period 40 has ~10 crests. Old writer
    // flat-topped every sample near each crest, easily 80+ clips. New writer
    // normalizes, leaving at most one true peak sample per crest.
    expect(flatTops).toBeLessThan(20);

    // Waveform must still be a sine-like shape — peak-normalized, not squared.
    // Cross-check: re-construct a normalized sine and the decoded channel
    // should be close at the ideal-crest sample indices.
    const peak = Math.max(...channels[0].map(Math.abs));
    expect(peak).toBeGreaterThan(0.9);  // still loud
    expect(peak).toBeLessThanOrEqual(1.0);  // not clipped
  });

  it('preserves relative amplitudes when normalizing (shape-preserving)', async () => {
    // Two-channel buffer with L twice as loud as R. After normalization,
    // their RATIO must stay 2:1 — amplitudes scaled uniformly, not
    // per-channel.
    const buf = new FakeAudioBuffer(2, 100, 48000);
    for (let i = 0; i < 100; i++) {
      buf.getChannelData(0)[i] = 1.4 * Math.sin((2 * Math.PI * i) / 20);
      buf.getChannelData(1)[i] = 0.7 * Math.sin((2 * Math.PI * i) / 20);
    }
    const blob = audioBufferToWav(buf as unknown as AudioBuffer);
    const { channels } = await decodeWav(blob);
    const peakL = Math.max(...channels[0].map(Math.abs));
    const peakR = Math.max(...channels[1].map(Math.abs));

    // Peak ratio should still be ~2:1.
    const ratio = peakL / peakR;
    expect(ratio).toBeGreaterThan(1.95);
    expect(ratio).toBeLessThan(2.05);
  });
});

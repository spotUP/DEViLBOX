/**
 * Leading-silence trim unit tests.
 *
 * Fixes user-reported regression: live-capture WAVs had silence at the start
 * because the replayer's async play() takes 50–300 ms to get WASM engines
 * flowing audio, while the capture tap connects immediately. Post-hoc trim
 * is the robust fix (works across every replayer / every startup latency).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { trimLeadingSilence } from '../audioExport';

// happy-dom doesn't ship an AudioBuffer constructor. Fake it just enough
// for trimLeadingSilence to work — it only reads channelData, length,
// numberOfChannels, sampleRate, and writes via new buffers created through
// OfflineAudioContext (which we stub separately).
class FakeAudioBuffer {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  private channels: Float32Array[];

  constructor(opts: { numberOfChannels: number; length: number; sampleRate: number }) {
    this.numberOfChannels = opts.numberOfChannels;
    this.length = opts.length;
    this.sampleRate = opts.sampleRate;
    this.channels = Array.from({ length: opts.numberOfChannels }, () => new Float32Array(opts.length));
  }
  getChannelData(ch: number): Float32Array {
    return this.channels[ch];
  }
}

class FakeOfflineAudioContext {
  private numChan: number; private len: number; private sr: number;
  constructor(numChan: number, len: number, sr: number) {
    this.numChan = numChan; this.len = len; this.sr = sr;
  }
  createBuffer(numChan: number, len: number, sr: number): FakeAudioBuffer {
    void this.numChan; void this.len; void this.sr;
    return new FakeAudioBuffer({ numberOfChannels: numChan, length: len, sampleRate: sr });
  }
}

beforeAll(() => {
  (globalThis as unknown as { OfflineAudioContext: typeof FakeOfflineAudioContext }).OfflineAudioContext =
    FakeOfflineAudioContext;
});

function mkBuffer(samples: number, sampleRate = 44100): FakeAudioBuffer {
  return new FakeAudioBuffer({ numberOfChannels: 2, length: samples, sampleRate });
}

function fill(buf: FakeAudioBuffer, startSample: number, endSample: number, value: number): void {
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = startSample; i < endSample; i++) data[i] = value;
  }
}

describe('trimLeadingSilence', () => {
  it('strips silence up to the first audible sample minus pre-roll', () => {
    const sr = 44100;
    const buf = mkBuffer(sr * 2, sr);               // 2s buffer
    // 500 ms of true silence, then steady tone at amplitude 0.5.
    fill(buf, sr / 2, sr * 2, 0.5);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const trimmed = trimLeadingSilence(buf as any) as unknown as FakeAudioBuffer;

    // Pre-roll default is 10 ms = 441 samples.
    const expectedLength = sr * 2 - (sr / 2 - 441);
    expect(trimmed.length).toBe(expectedLength);
    // First sample should land within the pre-roll window (still silent).
    expect(trimmed.getChannelData(0)[0]).toBe(0);
    // Audio should appear by the end of the pre-roll.
    expect(trimmed.getChannelData(0)[500]).toBeCloseTo(0.5, 5);
  });

  it('leaves an all-silence buffer untouched within the scan window', () => {
    const sr = 44100;
    const buf = mkBuffer(sr, sr);                    // 1 s of pure silence
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const trimmed = trimLeadingSilence(buf as any) as unknown as FakeAudioBuffer;
    // Identity — same buffer ref, same length.
    expect(trimmed).toBe(buf as unknown);
  });

  it('leaves audio that starts immediately untouched', () => {
    const sr = 44100;
    const buf = mkBuffer(sr, sr);
    fill(buf, 0, sr, 0.3);                           // tone from sample 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const trimmed = trimLeadingSilence(buf as any) as unknown as FakeAudioBuffer;
    expect(trimmed).toBe(buf as unknown);
  });

  it('honours the maxTrimSec cap so deliberate long intros survive', () => {
    const sr = 44100;
    const buf = mkBuffer(sr * 6, sr);                // 6 s buffer
    // Audio starts at 4 s — well past the default 2 s cap.
    fill(buf, sr * 4, sr * 6, 0.5);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const trimmed = trimLeadingSilence(buf as any) as unknown as FakeAudioBuffer;
    // Nothing crossed the threshold within the 2 s scan window — original
    // returned untouched so a 4-second silent intro survives.
    expect(trimmed).toBe(buf as unknown);
  });

  it('threshold excludes DC bias / denormals', () => {
    const sr = 44100;
    const buf = mkBuffer(sr, sr);
    // 500 ms of tiny amplitude (−80 dB ≈ 0.0001), then real audio.
    fill(buf, 0, sr / 2, 0.0001);
    fill(buf, sr / 2, sr, 0.5);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const trimmed = trimLeadingSilence(buf as any) as unknown as FakeAudioBuffer;
    // Default threshold is −60 dB (0.001), so 0.0001 is correctly ignored.
    expect(trimmed.length).toBeLessThan(buf.length);
    expect(trimmed.length).toBeGreaterThan(sr / 2 - 1000); // close to 500 ms trimmed
  });

  it('custom thresholdDb overrides the default', () => {
    const sr = 44100;
    const buf = mkBuffer(sr, sr);
    fill(buf, 0, sr, 0.0005);                        // everywhere at ~−66 dB
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const strict = trimLeadingSilence(buf as any, { thresholdDb: -80 }) as unknown as FakeAudioBuffer;
    // A looser −80 dB threshold picks up 0.0005 immediately → no trim.
    expect(strict).toBe(buf as unknown);
  });
});

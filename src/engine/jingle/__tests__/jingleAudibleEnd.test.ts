/**
 * The jingle asset has about 5 s of near-silent tail after the music. The
 * engine plays only the audible part so onEnd (boot prompts, lips teardown)
 * runs when the sound stops (JMA-3).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { JingleEngine, audibleDurationSeconds } from '../JingleEngine';

function bufferWithTail(rate = 1000, loudSeconds = 2, tailSeconds = 3, tailLevel = 0.001): AudioBuffer {
  const data = new Float32Array(rate * (loudSeconds + tailSeconds));
  for (let i = 0; i < data.length; i++) data[i] = i < rate * loudSeconds ? 0.5 : tailLevel;
  return {
    numberOfChannels: 1,
    sampleRate: rate,
    length: data.length,
    duration: data.length / rate,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

class FakeAudioContext {
  static startArgs: unknown[] | null = null;
  state = 'running';
  destination = {};
  createAnalyser() { return { fftSize: 0, connect: () => undefined }; }
  createBufferSource() {
    return {
      buffer: null as AudioBuffer | null,
      onended: null,
      connect: () => undefined,
      start: (...args: unknown[]) => { FakeAudioContext.startArgs = args; },
      stop: () => undefined,
    };
  }
  resume() { return Promise.resolve(); }
  async decodeAudioData() { return bufferWithTail(); }
  close() { return Promise.resolve(); }
}

afterEach(() => { vi.unstubAllGlobals(); FakeAudioContext.startArgs = null; });

describe('startup jingle plays only its audible part', () => {
  it('audibleDurationSeconds ends at the last sample above the floor', () => {
    expect(audibleDurationSeconds(bufferWithTail())).toBeCloseTo(2, 3);
    expect(audibleDurationSeconds(bufferWithTail(1000, 2, 3, 0.1))).toBeCloseTo(5, 3);
    expect(audibleDurationSeconds(bufferWithTail(1000, 0, 3))).toBe(0);
  });

  it('play() stops the source at the audible end, not the decoded end', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(8), {
      status: 200, headers: { 'content-type': 'audio/mpeg' },
    })));
    const engine = new JingleEngine();
    await engine.preload('/x.mp3');
    engine.play();
    expect(FakeAudioContext.startArgs).toEqual([0, 0, expect.closeTo(2, 3)]);
  });
});

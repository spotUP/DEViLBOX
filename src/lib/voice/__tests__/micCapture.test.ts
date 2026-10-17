import { describe, it, expect, vi, afterEach } from 'vitest';
import { FLUSH_TIMEOUT_MS, createMicCapture } from '../micCapture';

/** A worklet port: the test decides what it does with each message the capture posts. */
interface FakePort {
  onmessage: ((e: { data: unknown }) => void) | null;
  postMessage: (m: unknown) => void;
}

function installFakeAudio(onPost: (port: FakePort, m: unknown) => void): void {
  const node = () => ({ connect: () => {}, disconnect: () => {} });
  class FakeAudioContext {
    currentTime = 0;
    destination = {};
    audioWorklet = { addModule: async () => {} };
    resume = async () => {};
    close = async () => {};
    createMediaStreamSource = node;
  }
  class FakeWorkletNode {
    port: FakePort;
    disconnect = () => {};
    constructor() {
      const port: FakePort = { onmessage: null, postMessage: (m) => onPost(port, m) };
      this.port = port;
    }
  }
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('AudioWorkletNode', FakeWorkletNode);
}

const stream = { getTracks: () => [] } as unknown as MediaStream;

describe('createMicCapture stop flushes the worklet (TE-1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('delivers the blocks the worklet posts after stop is called, before stop resolves', async () => {
    installFakeAudio((port, m) => {
      if (m !== 'flush') return;
      // In flight when stop was called: one more block, then the answer.
      setTimeout(() => {
        port.onmessage?.({ data: new Float32Array(128).fill(0.3) });
        port.onmessage?.({ data: 'flushed' });
      }, 5);
    });
    const blocks: Float32Array[] = [];
    const capture = createMicCapture(stream);
    await capture.start((b) => blocks.push(b));
    await capture.stop();
    expect(blocks).toHaveLength(1);
    expect(blocks[0][0]).toBeCloseTo(0.3, 6);
  });

  it('gives up after the timeout when the worklet never answers', async () => {
    vi.useFakeTimers();
    installFakeAudio(() => {});
    const capture = createMicCapture(stream);
    await capture.start(() => {});
    let done = false;
    const stopped = capture.stop().then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(FLUSH_TIMEOUT_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await stopped;
    expect(done).toBe(true);
  });
});

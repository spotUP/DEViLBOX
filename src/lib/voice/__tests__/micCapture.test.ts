import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

  it('drains a backlog that takes longer than the timeout: every block before flushed is kept (VNR-18)', async () => {
    vi.useFakeTimers();
    const gap = FLUSH_TIMEOUT_MS - 50;
    const late = 8;
    installFakeAudio((port, m) => {
      if (m !== 'flush') return;
      // A busy main thread: queued blocks land one by one, gap ms apart, well past 200 ms in total.
      for (let k = 1; k <= late; k++) setTimeout(() => port.onmessage?.({ data: new Float32Array(2048).fill(k) }), k * gap);
      setTimeout(() => port.onmessage?.({ data: 'flushed' }), (late + 1) * gap);
    });
    const blocks: Float32Array[] = [];
    const capture = createMicCapture(stream);
    await capture.start((b) => blocks.push(b));
    const stopped = capture.stop();
    await vi.advanceTimersByTimeAsync((late + 1) * gap);
    await stopped;
    expect(blocks.map((b) => b[0])).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('voice-recorder worklet batches its posts (VNR-18)', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Load the worklet source with stub AudioWorkletProcessor / registerProcessor globals. */
  function loadProcessor(): { process: (inputs: Float32Array[][]) => boolean; port: FakePort; posted: unknown[] } {
    const posted: unknown[] = [];
    let ctor: (new () => { process: (inputs: Float32Array[][]) => boolean; port: FakePort }) | null = null;
    class Base {
      port: FakePort = { onmessage: null, postMessage: (m) => posted.push(m) };
    }
    vi.stubGlobal('AudioWorkletProcessor', Base);
    vi.stubGlobal('registerProcessor', (_name: string, c: typeof ctor) => { ctor = c; });
    const src = readFileSync(join(__dirname, '../../../../public/worklets/voice-recorder.worklet.js'), 'utf8');
    new Function(src)();
    if (!ctor) throw new Error('worklet did not register');
    const proc = new (ctor as new () => { process: (inputs: Float32Array[][]) => boolean; port: FakePort })();
    return { process: (i) => proc.process(i), port: proc.port, posted };
  }

  it('posts 2048-sample batches, then the partial batch and flushed on flush, losing no sample', () => {
    const w = loadProcessor();
    const blocks = 40; // 5120 samples: two full batches and 1024 left over
    for (let b = 0; b < blocks; b++) {
      const ch = new Float32Array(128);
      for (let i = 0; i < 128; i++) ch[i] = b * 128 + i;
      expect(w.process([[ch]])).toBe(true);
    }
    expect(w.posted).toHaveLength(2);
    w.port.onmessage?.({ data: 'flush' });
    expect(w.posted).toHaveLength(4);
    expect(w.posted[3]).toBe('flushed');
    const all = (w.posted.slice(0, 3) as Float32Array[]).flatMap((a) => Array.from(a));
    expect(all.map((v, i) => v - i).every((d) => d === 0)).toBe(true);
    expect(all).toHaveLength(blocks * 128);
  });
});

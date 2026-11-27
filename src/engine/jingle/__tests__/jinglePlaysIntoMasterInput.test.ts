/**
 * STARTUP-JINGLE-MISSING: the jingle played on its own AudioContext, so it
 * bypassed the master chain, the master volume and the app meters. It must
 * play on the app's shared context (getDevilboxAudioContext) into
 * ToneEngine.masterInput, and never create or close a context of its own.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const connections: Array<[string, unknown]> = [];
const masterInputNative = { name: 'masterInput' };

function node(name: string) {
  return {
    name,
    fftSize: 0,
    buffer: null as AudioBuffer | null,
    onended: null as (() => void) | null,
    connect(target: unknown) { connections.push([name, target]); },
    disconnect() { /* noop */ },
    start() { /* noop */ },
    stop() { /* noop */ },
  };
}

const analyser = node('analyser');
const shared = {
  state: 'running',
  destination: { name: 'destination' },
  createAnalyser: () => analyser,
  createBufferSource: () => node('source'),
  resume: vi.fn(() => Promise.resolve()),
  close: vi.fn(() => Promise.resolve()),
  decodeAudioData: async () => ({
    numberOfChannels: 1, sampleRate: 1000, length: 1000, duration: 1,
    getChannelData: () => new Float32Array(1000).fill(0.5),
  }) as unknown as AudioBuffer,
};
const masterInputTone = { input: masterInputNative };

vi.mock('@engine/ToneEngine', () => ({
  getToneEngine: () => ({ masterInput: masterInputTone }),
}));
vi.mock('@/utils/audio-context', () => ({
  getDevilboxAudioContext: () => shared,
  getNativeAudioNode: (n: unknown) => (n === masterInputTone ? masterInputNative : null),
}));

afterEach(() => { vi.unstubAllGlobals(); connections.length = 0; });

describe('startup jingle plays through the app master input', () => {
  it('source -> analyser -> masterInput on the shared context', async () => {
    const ownContext = vi.fn();
    vi.stubGlobal('AudioContext', ownContext);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(8), {
      status: 200, headers: { 'content-type': 'audio/mpeg' },
    })));
    const { JingleEngine } = await import('../JingleEngine');
    const engine = new JingleEngine();
    await engine.preload('/x.mp3');
    engine.play();

    expect(ownContext).not.toHaveBeenCalled();
    expect(connections).toContainEqual(['analyser', masterInputNative]);
    expect(connections).toContainEqual(['source', analyser]);
    expect(connections.some(([, t]) => t === shared.destination)).toBe(false);

    engine.dispose();
    expect(shared.close).not.toHaveBeenCalled();
  });
});

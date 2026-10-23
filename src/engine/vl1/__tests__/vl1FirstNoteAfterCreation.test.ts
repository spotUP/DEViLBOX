// @vitest-environment node
/**
 * Regression: "VL1 first note after creation sounds". ensureInitialized() used
 * to resolve as soon as the worklet node existed, before the worklet reported
 * 'ready'. Callers that awaited it then applied config / played notes while
 * applyConfig() was still a no-op. It must resolve only after ready, and by
 * then the full parameter set must have reached the worklet.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/utils/audio-context', () => {
  const node = () => ({ connect() {}, disconnect() {}, gain: { value: 0 } });
  const ctx = {
    sampleRate: 48000,
    destination: {},
    createGain: node,
    audioWorklet: { addModule: async () => {} },
  };
  return { getDevilboxAudioContext: () => ctx, noteToMidi: () => 60 };
});

describe('VL1 first note after creation sounds', () => {
  it('ensureInitialized resolves only after the worklet is ready and configured', async () => {
    const sent: Array<{ type: string }> = [];
    const g = globalThis as Record<string, unknown>;
    g.AudioWorkletNode = class {
      port: { postMessage(m: { type: string }): void; onmessage: ((e: { data: unknown }) => void) | null };
      constructor() {
        const node = this;
        this.port = { onmessage: null, postMessage: (m) => { sent.push(m); } };
        setTimeout(() => node.port.onmessage?.({ data: { type: 'ready' } }), 20);
      }
      connect() {}
      disconnect() {}
    };
    const { VL1SynthEngine } = await import('../VL1Synth');
    const synth = new VL1SynthEngine();
    await synth.ensureInitialized();
    expect(sent.some((m) => m.type === 'setParam')).toBe(true);
  });
});

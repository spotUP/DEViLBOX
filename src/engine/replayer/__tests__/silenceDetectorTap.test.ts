/**
 * A disposed SilenceDetector left its tap on the engine output: the output
 * node kept an edge to the detector's AnalyserNode, so after ~30 song loads
 * 19 analysers were still alive.
 */
import { describe, it, expect } from 'vitest';
import { SilenceDetector } from '../SilenceDetector';

function fakeContext() {
  const analyser = { fftSize: 0, context: { state: 'running' }, disconnect() {}, getFloatTimeDomainData() {} };
  return { analyser, ctx: { createAnalyser: () => analyser, sampleRate: 44100 } as unknown as AudioContext };
}

describe('SilenceDetector', () => {
  it('disposing a detector removes the tap from the engine output', () => {
    const edges = new Set<unknown>();
    const source = {
      connect: (n: unknown) => { edges.add(n); },
      disconnect: (n: unknown) => { edges.delete(n); },
    } as unknown as AudioNode;
    const gain = { context: { currentTime: 0 }, gain: { value: 1 } } as unknown as GainNode;

    for (let i = 0; i < 5; i++) {
      const { ctx } = fakeContext();
      const d = new SilenceDetector(ctx);
      d.start(source, gain, () => {});
      d.dispose();
    }
    expect(edges.size).toBe(0);
  });
});

// @vitest-environment node
/**
 * Regression: VL1 was silent through the app engine path (synth tester:
 * loaded=true, producedSound=false). On worklet 'ready' the engine used a
 * diffing applyConfig() against a config that already equalled the defaults,
 * so no parameter was ever sent and the worklet ran on its hardcoded envelope
 * defaults, which produce no audible output.
 *
 * Runs the real VL1SynthEngine against the real VL1.worklet.js, wiring the
 * engine's MessagePort traffic straight into the processor.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/utils/audio-context', () => {
  const node = () => ({ connect() {}, disconnect() {}, gain: { value: 0 } });
  const ctx = {
    sampleRate: 48000,
    destination: {},
    createGain: node,
    audioWorklet: { addModule: async () => {} },
  };
  return {
    getDevilboxAudioContext: () => ctx,
    noteToMidi: (n: string) => (n === 'C4' ? 60 : 69),
  };
});

interface Processor {
  port: { postMessage(m: unknown): void };
  handleMessage(e: { data: unknown }): void;
  process(i: unknown[], o: Float32Array[][]): boolean;
}

async function peakAfterNoteOn(): Promise<number> {
  let processor!: Processor;
  let ProcessorClass!: new (o: object) => Processor;
  const g = globalThis as Record<string, unknown>;
  g.sampleRate = 48000;
  g.AudioWorkletProcessor = class {
    port = { postMessage(_m: unknown) {} };
  };
  g.registerProcessor = (_n: string, c: new (o: object) => Processor) => { ProcessorClass = c; };
  (0, eval)(readFileSync(resolve(__dirname, '../../../../public/vl1/VL1.worklet.js'), 'utf8'));

  g.AudioWorkletNode = class {
    port: { postMessage(m: unknown): void; onmessage: ((e: { data: unknown }) => void) | null };
    constructor() {
      const node = this;
      this.port = {
        onmessage: null,
        postMessage: (m) => processor.handleMessage({ data: m }),
      };
      processor = new ProcessorClass({ processorOptions: { sampleRate: 48000 } });
      processor.port.postMessage = (m) => queueMicrotask(() => node.port.onmessage?.({ data: m }));
      processor.port.postMessage({ type: 'ready' });
    }
    connect() {}
    disconnect() {}
  };

  const { VL1SynthEngine } = await import('../VL1Synth');
  const synth = new VL1SynthEngine();
  await synth.ensureInitialized();
  await new Promise((r) => setTimeout(r, 0));
  synth.triggerAttack('C4', undefined, 0.8);
  let peak = 0;
  for (let b = 0; b < 300; b++) {
    const out = [[new Float32Array(128), new Float32Array(128)]];
    processor.process([], out);
    for (const x of out[0][0]) peak = Math.max(peak, Math.abs(x));
  }
  return peak;
}

describe('VL1 through the engine path', () => {
  it('renders a non-silent signal after a note on', async () => {
    expect(await peakAfterNoteOn()).toBeGreaterThan(0.01);
  });
});

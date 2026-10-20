// @vitest-environment node
/**
 * Regression: OpenWurli was silent through the app engine path (synth tester:
 * loaded=true, producedSound=false). The engine had no ensureInitialized() and
 * dropped any note sent before its worklet node existed (the node is created
 * after an async addModule + fetch), so a note triggered right after the
 * instrument was created never reached the WASM engine.
 *
 * Runs the real OpenWurliSynth against the real OpenWurli.worklet.js and WASM,
 * wiring the engine's MessagePort traffic into the processor.
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
  port: { postMessage(m: unknown): void; onmessage?: (e: { data: unknown }) => void };
  process(i: unknown[], o: Float32Array[][]): boolean;
}

const PUBLIC = resolve(__dirname, '../../../../public/openwurli');

async function peakAfterImmediateNote(): Promise<number> {
  let processor!: Processor;
  let ProcessorClass!: new (o: object) => Processor;
  const g = globalThis as Record<string, unknown>;
  g.sampleRate = 48000;
  g.AudioWorkletProcessor = class {
    port: Processor['port'] = { postMessage(_m: unknown) {} };
  };
  g.registerProcessor = (_n: string, c: new (o: object) => Processor) => { ProcessorClass = c; };
  (0, eval)(readFileSync(resolve(PUBLIC, 'OpenWurli.worklet.js'), 'utf8'));

  g.AudioWorkletNode = class {
    port: { postMessage(m: unknown): void; onmessage: ((e: { data: unknown }) => void) | null };
    constructor() {
      const node = this;
      this.port = {
        onmessage: null,
        postMessage: (m) => processor.port.onmessage?.({ data: m }),
      };
      processor = new ProcessorClass({});
      processor.port.postMessage = (m) => queueMicrotask(() => node.port.onmessage?.({ data: m }));
    }
    connect() {}
    disconnect() {}
  };

  g.fetch = async (url: string) => {
    const buf = readFileSync(resolve(PUBLIC, url.split('openwurli/')[1]));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return { ok: true, status: 200, arrayBuffer: async () => ab, text: async () => buf.toString('utf8') };
  };

  const { OpenWurliSynth } = await import('../OpenWurliSynth');
  const synth = new OpenWurliSynth();
  // Same order as the app/tester: trigger straight after construction.
  synth.triggerAttack('C4', undefined, 0.8);
  await (synth as unknown as { ensureInitialized(): Promise<void> }).ensureInitialized?.();
  await new Promise((r) => setTimeout(r, 50));
  let peak = 0;
  for (let b = 0; b < 300; b++) {
    const out = [[new Float32Array(128), new Float32Array(128)]];
    processor.process([], out);
    for (const x of out[0][0]) peak = Math.max(peak, Math.abs(x));
  }
  return peak;
}

describe('OpenWurli through the engine path', () => {
  it('renders a non-silent signal for a note triggered before the worklet is ready', async () => {
    expect(await peakAfterImmediateNote()).toBeGreaterThan(0.01);
  }, 30000);
});

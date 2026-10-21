// @vitest-environment node
/**
 * Regression: FluidSynth was silent through the app engine path (synth tester:
 * loaded=true, producedSound=false). The engine flushed queued notes on the
 * worklet 'ready' message, but the default SoundFont is fetched and loaded
 * afterwards; FluidSynth renders silence for a note-on with no SoundFont, so
 * the first notes were lost. ensureInitialized() also resolved before the
 * SoundFont was in.
 *
 * Runs the real FluidSynthSynthEngine (a facade over the shared
 * FluidSynthHost) against the real FluidSynth.worklet.js and WASM, wiring the
 * host's MessagePort traffic into the processor, and reads the dry output of
 * the engine's own slot.
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

const PUBLIC = resolve(__dirname, '../../../../public/fluidsynth');

async function render(triggerAfterEnsure: boolean): Promise<number> {
  let processor!: Processor;
  let ProcessorClass!: new (o: object) => Processor;
  const g = globalThis as Record<string, unknown>;
  g.sampleRate = 48000;
  g.AudioWorkletProcessor = class {
    port: Processor['port'] = { postMessage(_m: unknown) {} };
  };
  g.registerProcessor = (_n: string, c: new (o: object) => Processor) => { ProcessorClass = c; };
  (0, eval)(readFileSync(resolve(PUBLIC, 'FluidSynth.worklet.js'), 'utf8'));

  g.AudioWorkletNode = class {
    port: { postMessage(m: unknown): void; onmessage: ((e: { data: unknown }) => void) | null };
    constructor(_ctx: unknown, _name: string, options: object) {
      const node = this;
      this.port = {
        onmessage: null,
        postMessage: (m) => processor.port.onmessage?.({ data: m }),
      };
      processor = new ProcessorClass(options);
      processor.port.postMessage = (m) => queueMicrotask(() => node.port.onmessage?.({ data: m }));
    }
    connect() {}
    disconnect() {}
  };

  g.fetch = async (url: string) => {
    const file = resolve(PUBLIC, url.split('fluidsynth/')[1]);
    const buf = readFileSync(file);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return { ok: true, status: 200, arrayBuffer: async () => ab, text: async () => buf.toString('utf8') };
  };

  const { FluidSynthSynthEngine } = await import('../FluidSynthSynth');
  const synth = new FluidSynthSynthEngine();
  if (triggerAfterEnsure) await synth.ensureInitialized();
  synth.triggerAttack('C4', undefined, 0.8);
  // Let the SoundFont load and queued notes flush.
  for (let i = 0; i < 200; i++) await new Promise((r) => setTimeout(r, 5));
  const { FLUID_GROUPS } = await import('../FluidSynthHost');
  let peak = 0;
  for (let b = 0; b < 300; b++) {
    const out = Array.from({ length: FLUID_GROUPS + 1 }, () => [new Float32Array(128), new Float32Array(128)]);
    processor.process([], out);
    for (const x of out[synth.slot][0]) peak = Math.max(peak, Math.abs(x));
  }
  return peak;
}

describe('FluidSynth through the engine path', () => {
  it('renders a non-silent signal for a note triggered right after ensureInitialized', async () => {
    expect(await render(true)).toBeGreaterThan(0.01);
  }, 30000);
});

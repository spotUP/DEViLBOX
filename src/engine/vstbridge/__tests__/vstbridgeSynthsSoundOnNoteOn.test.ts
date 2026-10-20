// @vitest-environment node
/**
 * Regression: Vital and Odin2 were silent through the app engine path
 * (synth tester: loaded=true, producedSound=false).
 *
 * Drives the same WASM entry points VSTBridge.worklet.js uses: construct the
 * synth class, initialize(sampleRate), noteOn, process into malloc'ed buffers.
 * Asserts the synth does not trap during initialize and renders a non-zero
 * signal after a note on.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, it, expect } from 'vitest';

interface SynthInstance {
  initialize(sampleRate: number): boolean | void;
  noteOn(note: number, velocity: number): void;
  process(l: number, r: number, n: number): void;
  delete?(): void;
}
interface WasmModule {
  _malloc(n: number): number;
  [key: string]: unknown;
}

async function peakAfterNoteOn(dir: string, file: string, factory: string, cls: string): Promise<number> {
  const root = resolve(__dirname, '../../../../public', dir);
  const wasmBinary = readFileSync(resolve(root, `${file}.wasm`));
  let memory: WebAssembly.Memory | null = null;
  const orig = WebAssembly.instantiate;
  WebAssembly.instantiate = (async (...args: unknown[]) => {
    const result = await (orig as (...a: unknown[]) => Promise<unknown>).apply(WebAssembly, args);
    const instance = (result as { instance?: WebAssembly.Instance }).instance ?? (result as WebAssembly.Instance);
    for (const v of Object.values(instance.exports)) {
      if (v instanceof WebAssembly.Memory) memory = v;
    }
    return result;
  }) as typeof WebAssembly.instantiate;
  let mod: WasmModule;
  try {
    const imported = await import(/* @vite-ignore */ pathToFileURL(resolve(root, `${file}.js`)).href);
    const create = (imported.default ?? imported[factory]) as (o: object) => Promise<WasmModule>;
    mod = await create({ wasmBinary });
  } finally {
    WebAssembly.instantiate = orig;
  }
  const Synth = mod[cls] as new () => SynthInstance;
  const synth = new Synth();
  synth.initialize(48000);
  const frames = 128;
  const l = mod._malloc(frames * 4);
  const r = mod._malloc(frames * 4);
  synth.noteOn(60, 100);
  let peak = 0;
  for (let block = 0; block < 200; block++) {
    synth.process(l, r, frames);
    const buf = (memory as WebAssembly.Memory | null)!.buffer;
    const out = new Float32Array(buf, l, frames);
    for (let i = 0; i < frames; i++) peak = Math.max(peak, Math.abs(out[i]));
  }
  return peak;
}

describe('VSTBridge WASM synths render sound after a note on', () => {
  it('Vital initializes without trapping and renders a signal', async () => {
    expect(await peakAfterNoteOn('vital', 'Vital', 'createVitalModule', 'VitalSynth')).toBeGreaterThan(0.001);
  }, 60000);
  it('Odin2 initializes without trapping and renders a signal', async () => {
    expect(await peakAfterNoteOn('odin2', 'Odin2', 'createOdin2Module', 'Odin2Synth')).toBeGreaterThan(0.001);
  }, 60000);
});

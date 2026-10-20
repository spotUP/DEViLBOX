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
  noteOff(note: number): void;
  process(l: number, r: number, n: number): void;
  delete?(): void;
}
interface WasmModule {
  _malloc(n: number): number;
  [key: string]: unknown;
}

async function renderAfterNoteOff(dir: string, file: string, factory: string, cls: string): Promise<{ held: number; tail: number }> {
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
  const peakOf = (blocks: number): number => {
    let peak = 0;
    for (let block = 0; block < blocks; block++) {
      synth.process(l, r, frames);
      const buf = (memory as WebAssembly.Memory | null)!.buffer;
      const out = new Float32Array(buf, l, frames);
      for (let i = 0; i < frames; i++) peak = Math.max(peak, Math.abs(out[i]));
    }
    return peak;
  };
  const held = peakOf(200);
  synth.noteOff(60);
  peakOf(375); // ~1s release window
  const tail = peakOf(50);
  return { held, tail };
}

async function peakAfterNoteOn(dir: string, file: string, factory: string, cls: string): Promise<number> {
  return (await renderAfterNoteOff(dir, file, factory, cls)).held;
}

describe('VSTBridge WASM synths render sound after a note on', () => {
  it('Vital initializes without trapping and renders a signal', async () => {
    expect(await peakAfterNoteOn('vital', 'Vital', 'createVitalModule', 'VitalSynth')).toBeGreaterThan(0.001);
  }, 60000);
  it('Odin2 initializes without trapping and renders a signal', async () => {
    expect(await peakAfterNoteOn('odin2', 'Odin2', 'createOdin2Module', 'Odin2Synth')).toBeGreaterThan(0.001);
  }, 60000);
});

describe('VSTBridge WASM synths go silent after a note off', () => {
  it('Vital falls silent after release', async () => {
    const { held, tail } = await renderAfterNoteOff('vital', 'Vital', 'createVitalModule', 'VitalSynth');
    expect(tail).toBeLessThan(held * 0.01);
  }, 60000);
  it('Odin2 falls silent after release', async () => {
    const { held, tail } = await renderAfterNoteOff('odin2', 'Odin2', 'createOdin2Module', 'Odin2Synth');
    expect(tail).toBeLessThan(held * 0.01);
  }, 60000);
});

/**
 * Per-block peaks for the first blocks after noteOn, then a long hold.
 * Odin2 once returned ~1e33 from block 0 on because the wrapper never gave the
 * oscillators a WavetableContainer (their table pointers were never set).
 */
async function blockPeaks(dir: string, file: string, factory: string, cls: string, velocity: number, sampleRate: number): Promise<{ early: number[]; steady: number; nan: boolean; longMax: number }> {
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
  synth.initialize(sampleRate);
  const frames = 128;
  const l = mod._malloc(frames * 4);
  const r = mod._malloc(frames * 4);
  synth.noteOn(60, velocity);
  let nan = false;
  const block = (): number => {
    synth.process(l, r, frames);
    const out = new Float32Array((memory as WebAssembly.Memory | null)!.buffer, l, frames);
    let peak = 0;
    for (let i = 0; i < frames; i++) {
      if (!Number.isFinite(out[i])) nan = true;
      else peak = Math.max(peak, Math.abs(out[i]));
    }
    return peak;
  };
  const early = Array.from({ length: 20 }, block);
  let steady = 0;
  let longMax = 0;
  for (let b = 20; b < 1000; b++) {
    const p = block();
    longMax = Math.max(longMax, p);
    if (b >= 100 && b < 200) steady = Math.max(steady, p);
  }
  return { early, steady, nan, longMax };
}

describe('Odin2 note start is clean (no noise burst)', () => {
  for (const [velocity, sampleRate] of [[100, 48000], [127, 44100]] as const) {
    it(`first blocks stay within 2x steady level and finite, velocity ${velocity} at ${sampleRate} Hz`, async () => {
      const { early, steady, nan, longMax } = await blockPeaks('odin2', 'Odin2', 'createOdin2Module', 'Odin2Synth', velocity, sampleRate);
      expect(nan).toBe(false);
      expect(steady).toBeGreaterThan(0.001);
      expect(steady).toBeLessThan(2); // a sane synth level; the broken build sat at ~1e33 from block 0
      for (const p of early) expect(p).toBeLessThanOrEqual(steady * 2);
      expect(longMax).toBeLessThanOrEqual(steady * 2);
    }, 60000);
  }
});

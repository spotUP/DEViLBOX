/**
 * odin2Wasm.ts - Node-only harness around public/odin2/Odin2.wasm.
 *
 * Shared by tools/convertOdinPresets.ts (loudness measurement) and the Odin2 vitest files, so the
 * render that sets a preset's gainTrimDb is the same render the tests check.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export interface Odin2Instance {
  initialize(sampleRate: number): boolean;
  noteOn(note: number, velocity: number): void;
  noteOff(note: number): void;
  allNotesOff(): void;
  getParameterCount(): number;
  getParameterName(id: number): string;
  getParameter(id: number): number;
  setParameter(id: number, value: number): void;
  getStateLoadCount(): number;
  handleCommand(type: string, data: Uint8Array): boolean;
  process(left: number, right: number, frames: number): void;
  delete(): void;
}

interface Odin2Module {
  Odin2Synth: new () => Odin2Instance;
  _malloc(bytes: number): number;
  _free(ptr: number): void;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const WASM_DIR = join(HERE, '../../public/odin2');
export const ODIN2_WASM_PRESENT = ((): boolean => {
  try { readFileSync(join(WASM_DIR, 'Odin2.wasm')); return true; } catch { return false; }
})();

export const SAMPLE_RATE = 48000;
export const BLOCK = 128;

let modulePromise: Promise<{ mod: Odin2Module; memory: WebAssembly.Memory }> | null = null;

/** Load (once) the Odin2 module, capturing its WebAssembly.Memory (the build does not export HEAPF32). */
export function loadOdin2(): Promise<{ mod: Odin2Module; memory: WebAssembly.Memory }> {
  if (modulePromise) return modulePromise;
  modulePromise = (async () => {
    let memory: WebAssembly.Memory | undefined;
    const original = WebAssembly.instantiate.bind(WebAssembly) as (...a: unknown[]) => Promise<unknown>;
    (WebAssembly as unknown as { instantiate: unknown }).instantiate = async (...args: unknown[]) => {
      const res = await original(...args);
      const inst = ((res as { instance?: WebAssembly.Instance }).instance ?? res) as WebAssembly.Instance;
      memory = Object.values(inst.exports).find((e): e is WebAssembly.Memory => e instanceof WebAssembly.Memory);
      return res;
    };
    try {
      const factory = (await import(/* @vite-ignore */ pathToFileURL(join(WASM_DIR, 'Odin2.js')).href)).default as
        (o: { wasmBinary: Buffer }) => Promise<Odin2Module>;
      const mod = await factory({ wasmBinary: readFileSync(join(WASM_DIR, 'Odin2.wasm')) });
      if (!memory) throw new Error('Odin2.wasm exposes no WebAssembly.Memory');
      return { mod, memory };
    } finally {
      (WebAssembly as unknown as { instantiate: unknown }).instantiate = original;
    }
  })();
  return modulePromise;
}

export async function createOdin2(): Promise<Odin2Instance> {
  const { mod } = await loadOdin2();
  const synth = new mod.Odin2Synth();
  synth.initialize(SAMPLE_RATE);
  return synth;
}

/** Name -> engine parameter id, read from the engine (never hardcoded indexes). */
export function parameterIds(synth: Odin2Instance): Map<string, number> {
  const ids = new Map<string, number>();
  for (let i = 0; i < synth.getParameterCount(); i++) ids.set(synth.getParameterName(i), i);
  return ids;
}

export interface RenderOptions {
  /** Raw .odin bytes loaded with the loadPreset command first. */
  preset?: Uint8Array;
  /** setValueTreeProperty payloads ("osc.osc1_type=3") applied after the preset. */
  valueTree?: string[];
  seconds?: number;
  note?: number;
  velocity?: number;
}

export interface RenderResult { peak: number; peakDb: number; energy: number; stateLoads: number }

/** Render one held note on a fresh synth and report the peak and energy of the left channel. */
export async function renderOdin2(opts: RenderOptions = {}): Promise<RenderResult> {
  const { mod, memory } = await loadOdin2();
  const synth = await createOdin2();
  try {
    if (opts.preset && !synth.handleCommand('loadPreset', opts.preset)) throw new Error('loadPreset rejected');
    const enc = new TextEncoder();
    for (const c of opts.valueTree ?? []) {
      if (!synth.handleCommand('setValueTreeProperty', enc.encode(c))) throw new Error(`setValueTreeProperty rejected: ${c}`);
    }
    const l = mod._malloc(BLOCK * 4);
    const r = mod._malloc(BLOCK * 4);
    synth.noteOn(opts.note ?? 60, opts.velocity ?? 127);
    const blocks = Math.ceil(((opts.seconds ?? 3) * SAMPLE_RATE) / BLOCK);
    let peak = 0;
    let energy = 0;
    for (let b = 0; b < blocks; b++) {
      synth.process(l, r, BLOCK);
      const out = new Float32Array(memory.buffer, l, BLOCK);
      for (const v of out) { const a = Math.abs(v); if (a > peak) peak = a; energy += v * v; }
    }
    mod._free(l);
    mod._free(r);
    return { peak, peakDb: peak > 0 ? 20 * Math.log10(peak) : -Infinity, energy, stateLoads: synth.getStateLoadCount() };
  } finally {
    synth.delete();
  }
}

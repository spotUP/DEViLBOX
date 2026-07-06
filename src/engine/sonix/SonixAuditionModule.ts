/**
 * SonixAuditionModule — main-thread, offline single-note synth render.
 *
 * The editor auditions a Sonix synth instrument by rendering ONE note through the
 * REAL Sonix synth path (blend/ring + 64-band envelope-swept filter + volume/pitch
 * envelope) via the WASM `sonix_render_synth_note` entry, so every knob audibly
 * changes the preview. This runs the Emscripten module on the main thread (not the
 * AudioWorklet) because it's an offline buffer render, not streaming playback.
 *
 * A single shared WASM instance backs every SonixSynth voice. Renders are
 * synchronous once the module is loaded and share the global scratch song
 * (`sonix_init_scratch` allocates it fresh each call), so sequential renders on
 * the single JS thread never clash.
 */

import { defaultWASMTransform } from '@/engine/wasm/WASMSingletonBase';
import type { SonixSynthParams } from './SonixEngine';

interface SonixWasmModule {
  _malloc(n: number): number;
  _free(p: number): void;
  _sonix_set_sample_rate(rate: number): void;
  _sonix_init_scratch(numInstruments: number): number;
  _sonix_render_synth_note(inst: number, note: number, velocity: number, numFrames: number, out: number): number;
  _sonix_synth_set_is_synth(i: number, v: number): void;
  _sonix_synth_set_vol_params(i: number, baseVol: number, portFlag: number): void;
  _sonix_synth_set_blend_params(i: number, c2: number, c4: number): void;
  _sonix_synth_set_filter_params(i: number, base: number, range: number, envSens: number): void;
  _sonix_synth_set_env_params(
    i: number,
    scan: number,
    loop: number,
    delay: number,
    volScale: number,
    pitchScale: number,
  ): void;
  _sonix_synth_set_slide_rate(i: number, rate: number): void;
  _sonix_synth_set_wave(i: number, ptr: number): void;
  _sonix_synth_set_env_table(i: number, ptr: number): void;
  _sonix_synth_set_lfo_wave(i: number, ptr: number): void;
  _sonix_synth_set_eg_level(i: number, j: number, v: number): void;
  _sonix_synth_set_eg_rate(i: number, j: number, v: number): void;
  HEAPF32: Float32Array;
  HEAPU8: Uint8Array;
  wasmMemory?: WebAssembly.Memory;
}

type SonixFactory = (config: Record<string, unknown>) => Promise<SonixWasmModule>;

let modulePromise: Promise<SonixWasmModule | null> | null = null;

/** Lazily fetch + instantiate the Sonix WASM module on the main thread (once). */
function ensureModule(): Promise<SonixWasmModule | null> {
  if (modulePromise) return modulePromise;
  modulePromise = (async () => {
    try {
      const baseUrl = import.meta.env.BASE_URL || '/';
      const [jsRes, wasmRes] = await Promise.all([
        fetch(`${baseUrl}sonix/Sonix.js`),
        fetch(`${baseUrl}sonix/Sonix.wasm`),
      ]);
      if (!jsRes.ok || !wasmRes.ok) {
        console.warn('[SonixAudition] WASM fetch failed', jsRes.status, wasmRes.status);
        return null;
      }
      const rawJs = await jsRes.text();
      const wasmBinary = await wasmRes.arrayBuffer();
      const jsCode = defaultWASMTransform(rawJs);
      // Same load shape the worklet uses: wrap the Emscripten glue, return the factory.
      const factory = new Function(`${jsCode}\nreturn createSonix;`)() as SonixFactory | undefined;
      if (typeof factory !== 'function') {
        console.warn('[SonixAudition] createSonix factory not found after transform');
        return null;
      }
      return await factory({ wasmBinary });
    } catch (err) {
      console.warn('[SonixAudition] module load failed — fell back to base-waveform preview:', err);
      return null;
    }
  })();
  return modulePromise;
}

/** Write a 128-byte signed table into WASM heap and invoke `setter(i, ptr)`. */
function writeTable(
  m: SonixWasmModule,
  setter: (i: number, ptr: number) => void,
  i: number,
  table: number[],
): void {
  const ptr = m._malloc(128);
  if (!ptr) return;
  const heap = m.HEAPU8; // re-read after malloc in case memory grew
  for (let k = 0; k < 128; k++) heap[ptr + k] = (table[k] ?? 0) & 0xff;
  setter(i, ptr);
  m._free(ptr);
}

/** Push a full param set onto instrument slot 0 of the scratch song. */
function applyParams(m: SonixWasmModule, p: SonixSynthParams): void {
  const i = 0;
  m._sonix_synth_set_is_synth(i, 1);
  m._sonix_synth_set_vol_params(i, p.baseVol | 0, p.portFlag | 0);
  m._sonix_synth_set_blend_params(i, p.c2 | 0, p.c4 | 0);
  m._sonix_synth_set_filter_params(i, p.filterBase | 0, p.filterRange | 0, p.filterEnvSens | 0);
  m._sonix_synth_set_env_params(
    i,
    p.envScanRate | 0,
    p.envLoopMode | 0,
    p.envDelayInit | 0,
    p.envVolScale | 0,
    p.envPitchScale | 0,
  );
  m._sonix_synth_set_slide_rate(i, p.slideRate | 0);
  // set_wave MUST run before render — it (re)builds the 64-band filter bank.
  if (Array.isArray(p.wave)) writeTable(m, m._sonix_synth_set_wave.bind(m), i, p.wave);
  if (Array.isArray(p.envTable)) writeTable(m, m._sonix_synth_set_env_table.bind(m), i, p.envTable);
  if (Array.isArray(p.lfoWave)) writeTable(m, m._sonix_synth_set_lfo_wave.bind(m), i, p.lfoWave);
  if (Array.isArray(p.egLevels)) p.egLevels.forEach((v, j) => m._sonix_synth_set_eg_level(i, j, v | 0));
  if (Array.isArray(p.egRates)) p.egRates.forEach((v, j) => m._sonix_synth_set_eg_rate(i, j, v | 0));
}

export interface SonixRenderRequest {
  params: SonixSynthParams;
  note: number; // MIDI note to render at
  velocity: number; // 0-255
  sampleRate: number;
  frames: number;
}

/**
 * Render one synth note offline through the real Sonix synth path.
 * Returns a mono Float32Array of `frames` samples, or null if the module or
 * render failed (caller falls back to the base-waveform preview).
 */
export async function renderSonixNote(req: SonixRenderRequest): Promise<Float32Array | null> {
  const m = await ensureModule();
  if (!m) return null;
  try {
    m._sonix_set_sample_rate(req.sampleRate);
    if (m._sonix_init_scratch(1) !== 0) return null;
    applyParams(m, req.params);

    const outPtr = m._malloc(req.frames * 4);
    if (!outPtr) return null;
    const written = m._sonix_render_synth_note(0, req.note | 0, req.velocity | 0, req.frames, outPtr);
    if (written <= 0) {
      m._free(outPtr);
      return null;
    }
    // Re-read HEAPF32 after malloc (ALLOW_MEMORY_GROWTH may have detached the view).
    const heap = m.HEAPF32;
    const base = outPtr >> 2;
    const out = new Float32Array(written);
    out.set(heap.subarray(base, base + written));
    m._free(outPtr);
    return out;
  } catch {
    return null;
  }
}

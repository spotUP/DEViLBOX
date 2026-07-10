/**
 * uadeRenderCore.ts — headless UADE WASM render core (single source of truth)
 *
 * Loads DEViLBOX's UADE WASM bundle (public/uade/UADE.js + .wasm) OUTSIDE a browser
 * — no AudioWorklet, no DOM audio — and renders a module file to raw interleaved
 * float32 samples. Both the render-devilbox CLI (WAV output) and the MaxTrax
 * playback regression test consume this, so the node-environment patching and the
 * IPC render loop live in exactly one place.
 *
 * UADE.js targets ENVIRONMENT='web,worker' and throws when it detects Node. We patch
 * the two Node version checks and provide the `self`/`WorkerGlobalScope` globals it
 * probes before executing it via vm.runInThisContext (avoids esbuild template mangling).
 */

import { readFileSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { runInThisContext } from 'vm';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = join(HERE, '../..');
const UADE_JS_PATH = join(PROJECT_ROOT, 'public/uade/UADE.js');
const UADE_WASM_PATH = join(PROJECT_ROOT, 'public/uade/UADE.wasm');

const DEFAULT_CHUNK_SIZE = 4096; // frames per render call

export interface UADEModule {
  _uade_wasm_init(sampleRate: number): number;
  _uade_wasm_load(ptr: number, len: number, hintPtr: number): number;
  _uade_wasm_render(ptrL: number, ptrR: number, frames: number): number;
  _uade_wasm_stop(): void;
  _uade_wasm_cleanup(): void;
  _uade_wasm_set_looping(loop: number): void;
  _uade_wasm_set_one_subsong(on: number): void;
  _uade_wasm_get_total_frames(): number;
  _malloc(size: number): number;
  _free(ptr: number): void;
  HEAPU8: Uint8Array;
  HEAPF32: Float32Array;
  stringToUTF8(str: string, ptr: number, maxBytes: number): void;
}

/**
 * Load a FRESH UADE WASM module instance. Every call is independent — some
 * eagleplayers call unguarded exit(1) which corrupts Emscripten module state, so a
 * per-file instance guarantees clean IPC state.
 */
export async function loadUADEModule(verbose = false): Promise<UADEModule> {
  const wasmBuf = readFileSync(UADE_WASM_PATH);
  const wasmBinary = wasmBuf.buffer.slice(
    wasmBuf.byteOffset,
    wasmBuf.byteOffset + wasmBuf.byteLength,
  );

  let jsCode = readFileSync(UADE_JS_PATH, 'utf8');

  // Patch out both Node.js environment checks (exact strings — regex fails due to
  // special chars inside the error message literals).
  const NODE_CHECK1 = 'if(currentNodeVersion<TARGET_NOT_SUPPORTED){throw new Error("not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)")}';
  // eslint-disable-next-line no-template-curly-in-string
  const NODE_CHECK2 = 'if(currentNodeVersion<2147483647){throw new Error(`This emscripten-generated code requires node v${packedVersionToHumanReadable(2147483647)} (detected v${packedVersionToHumanReadable(currentNodeVersion)})`)}';
  jsCode = jsCode.replace(NODE_CHECK1, '/* patched: allow node.js headless */');
  jsCode = jsCode.replace(NODE_CHECK2, '/* patched: allow node.js headless */');

  // Intercept WebAssembly.instantiate to capture the memory export (heap views must
  // be re-derived from it because Emscripten may not wire HEAPF32 under this loader).
  let capturedMemory: WebAssembly.Memory | null = null;
  const origInstantiate = WebAssembly.instantiate;
  (WebAssembly as unknown as Record<string, unknown>).instantiate = async (
    source: Parameters<typeof WebAssembly.instantiate>[0],
    imports: Parameters<typeof WebAssembly.instantiate>[1],
  ) => {
    const result = await origInstantiate(source, imports);
    const instance = ('instance' in result ? result.instance : result) as WebAssembly.Instance;
    if (instance.exports.memory) {
      capturedMemory = instance.exports.memory as WebAssembly.Memory;
    }
    return result;
  };

  // Browser globals UADE.js probes.
  const g = globalThis as Record<string, unknown>;
  if (typeof g['self'] === 'undefined') g['self'] = globalThis;
  if (!(g['self'] as Record<string, unknown>)['location']) {
    (g['self'] as Record<string, unknown>)['location'] = { href: UADE_JS_PATH };
  }
  if (typeof g['WorkerGlobalScope'] === 'undefined') {
    g['WorkerGlobalScope'] = class FakeWorkerGlobalScope {};
  }

  runInThisContext(jsCode);
  const createUADE = (globalThis as Record<string, unknown>)['createUADE'] as (
    opts: Record<string, unknown>,
  ) => Promise<UADEModule>;
  if (typeof createUADE !== 'function') {
    throw new Error('createUADE not found after loading UADE.js');
  }

  let mod: UADEModule;
  try {
    mod = await createUADE({
      wasmBinary,
      locateFile: (path: string) => (path.endsWith('.wasm') ? UADE_WASM_PATH : path),
      print: (text: string) => { if (verbose) console.log('[UADE]', text); },
      printErr: (text: string) => { if (verbose) console.error('[UADE ERR]', text); },
      onAbort: (reason: string) => { console.error('[UADE ABORT]', reason); },
    });
  } finally {
    WebAssembly.instantiate = origInstantiate;
  }

  if (capturedMemory) {
    const buf = (capturedMemory as WebAssembly.Memory).buffer;
    if (!mod.HEAPU8 || mod.HEAPU8.buffer !== buf) {
      mod.HEAPU8 = new Uint8Array(buf);
      mod.HEAPF32 = new Float32Array(buf);
    }
    (mod as unknown as Record<string, unknown>)._wasmMemory = capturedMemory;
  }

  return mod;
}

/** Refresh heap views if WASM memory grew. */
function refreshHeap(mod: UADEModule): void {
  const mem = (mod as unknown as Record<string, unknown>)._wasmMemory as WebAssembly.Memory | undefined;
  if (!mem) return;
  const buf = mem.buffer;
  if (mod.HEAPU8.buffer !== buf) {
    mod.HEAPU8 = new Uint8Array(buf);
    mod.HEAPF32 = new Float32Array(buf);
  }
}

export interface RenderResult {
  /** Interleaved L+R float32 samples. */
  samples: Float32Array;
  sampleRate: number;
  frames: number;
}

/**
 * Render `data` (a module file) to interleaved float32 samples. Loads into a
 * caller-supplied module instance (use a fresh one per file). One-subsong mode with
 * looping off, matching uade123 -1.
 */
export async function renderToSamples(
  mod: UADEModule,
  data: Uint8Array,
  filename: string,
  opts: { sampleRate: number; seconds: number; chunkSize?: number },
): Promise<RenderResult> {
  const { sampleRate, seconds } = opts;
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;

  const ptr = mod._malloc(data.byteLength);
  if (!ptr) throw new Error('malloc failed for file data');
  refreshHeap(mod);
  mod.HEAPU8.set(data, ptr);

  const hintLen = filename.length * 4 + 1;
  const hintPtr = mod._malloc(hintLen);
  if (!hintPtr) { mod._free(ptr); throw new Error('malloc failed for filename hint'); }
  mod.stringToUTF8(filename, hintPtr, hintLen);

  mod._uade_wasm_stop();
  mod._uade_wasm_set_looping(0);
  mod._uade_wasm_set_one_subsong(1);

  const loadRet = mod._uade_wasm_load(ptr, data.byteLength, hintPtr);
  mod._free(ptr);
  mod._free(hintPtr);
  if (loadRet !== 0) throw new Error(`_uade_wasm_load failed (ret=${loadRet})`);

  const ptrL = mod._malloc(chunkSize * 4);
  const ptrR = mod._malloc(chunkSize * 4);
  if (!ptrL || !ptrR) {
    if (ptrL) mod._free(ptrL);
    if (ptrR) mod._free(ptrR);
    throw new Error('malloc failed for audio buffers');
  }

  const maxFrames = sampleRate * seconds;
  const allSamples: number[] = [];
  let totalFrames = 0;

  // _uade_wasm_render(): 1=ok, 0=song-ended, <0=error. L and R identical (mono mix).
  while (totalFrames < maxFrames) {
    const chunk = Math.min(chunkSize, maxFrames - totalFrames);
    const ret = mod._uade_wasm_render(ptrL, ptrR, chunk);
    if (ret <= 0) break;
    refreshHeap(mod);
    const heapF32 = new Float32Array(mod.HEAPU8.buffer);
    const indexL = ptrL >> 2;
    const indexR = ptrR >> 2;
    for (let i = 0; i < chunk; i++) {
      allSamples.push(heapF32[indexL + i]);
      allSamples.push(heapF32[indexR + i]);
    }
    totalFrames += chunk;
  }

  mod._free(ptrL);
  mod._free(ptrR);

  return { samples: new Float32Array(allSamples), sampleRate, frames: totalFrames };
}

/**
 * Convenience: load a fresh module, init, render a file to samples, cleanup.
 * The heavy path used by tests — one call, one throwaway module instance.
 */
export async function renderFileToSamples(
  data: Uint8Array,
  filename: string,
  opts: { sampleRate: number; seconds: number; verbose?: boolean },
): Promise<RenderResult> {
  const mod = await loadUADEModule(opts.verbose);
  const initRet = mod._uade_wasm_init(opts.sampleRate);
  if (initRet !== 0) throw new Error(`_uade_wasm_init failed (ret=${initRet})`);
  try {
    return await renderToSamples(mod, data, filename, opts);
  } finally {
    try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
  }
}

/** Read a file from disk and render it. */
export async function renderPathToSamples(
  inputPath: string,
  opts: { sampleRate: number; seconds: number; verbose?: boolean },
): Promise<RenderResult> {
  return renderFileToSamples(readFileSync(inputPath), basename(inputPath), opts);
}

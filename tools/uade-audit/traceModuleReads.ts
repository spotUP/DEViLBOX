/**
 * traceModuleReads.ts — capture which module-file bytes the emulated 68k player
 * reads as note/sequence data during playback.
 *
 * The UADE WASM build instruments chipmem_{b,w,l}get: when module tracing is
 * enabled it marks a coverage bitmap of every file offset read inside the loaded
 * module region (see uade-wasm/src/entry.c uade_wasm_log_module_read + memory.c).
 * After rendering the song we drain the bitmap as contiguous [start,end) file
 * ranges — those ranges are exactly the bytes the player consumes.
 *
 * This is the discovery engine for the opaque "256-cell stub" formats: instead of
 * hand-reading the eagleplayer ASM to locate the on-disk score region, we let the
 * real player tell us. A contiguous traced range feeds the existing fixed-layout
 * carrier recipe directly (point the layout at [start,end), 1 byte/cell).
 *
 * NOTE: the trace includes ALL module reads, which for in-file-sample formats also
 * covers sample PCM fetched by Paula DMA. For region DISCOVERY that is fine (the
 * score region is a subset). Sample exclusion (subtract Paula-sourced reads via
 * the Paula log) is a later refinement, only needed to isolate note bytes from
 * interleaved samples — see the plan Phase D.
 */

import { loadUADEModule, type UADEModule } from './uadeRenderCore';

export interface TraceModuleModule extends UADEModule {
  _uade_wasm_init(sampleRate: number): number;
  _uade_wasm_enable_module_trace(enable: number): void;
  _uade_wasm_get_module_bounds(outPtr: number): void;
  _uade_wasm_get_module_ranges(outPtr: number, maxPairs: number): number;
  _uade_wasm_set_one_subsong(on: number): void;
}

export interface TracedRange {
  /** module-relative (== file) offset of first read byte, inclusive */
  start: number;
  /** module-relative (== file) offset one past last read byte, exclusive */
  end: number;
}

export interface ModuleTraceResult {
  /** module load base in chip RAM (for reverse-mapping Paula source addrs) */
  moduleBase: number;
  /** module size in bytes (the file length as loaded) */
  moduleSize: number;
  /** contiguous file-offset ranges the player read during the trace window */
  ranges: TracedRange[];
  /** total bytes covered (sum of range lengths) */
  coverageBytes: number;
  /** how many render frames were produced */
  frames: number;
}

const MAX_PAIRS = 8192; // ring cap for drained ranges

/**
 * Load `data`, render `seconds` of audio with module tracing on, and return the
 * set of file-offset ranges the 68k player read. Uses a fresh WASM instance.
 */
export async function traceModuleReads(
  data: Uint8Array,
  filename: string,
  opts: { sampleRate: number; seconds: number; chunkSize?: number; verbose?: boolean },
): Promise<ModuleTraceResult> {
  const { sampleRate, seconds } = opts;
  const chunkSize = opts.chunkSize ?? 4096;

  const mod = (await loadUADEModule(opts.verbose)) as TraceModuleModule;
  const initRet = mod._uade_wasm_init(sampleRate);
  if (initRet !== 0) throw new Error(`_uade_wasm_init failed (ret=${initRet})`);

  try {
    // ── Load the module ──────────────────────────────────────────────────
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

    // ── Enable tracing (captures module base/size from the score struct) ──
    mod._uade_wasm_enable_module_trace(1);

    // ── Render ───────────────────────────────────────────────────────────
    const ptrL = mod._malloc(chunkSize * 4);
    const ptrR = mod._malloc(chunkSize * 4);
    if (!ptrL || !ptrR) {
      if (ptrL) mod._free(ptrL);
      if (ptrR) mod._free(ptrR);
      throw new Error('malloc failed for audio buffers');
    }

    const maxFrames = sampleRate * seconds;
    let totalFrames = 0;
    while (totalFrames < maxFrames) {
      const chunk = Math.min(chunkSize, maxFrames - totalFrames);
      const ret = mod._uade_wasm_render(ptrL, ptrR, chunk);
      if (ret <= 0) break;
      totalFrames += chunk;
    }
    mod._free(ptrL);
    mod._free(ptrR);

    // ── Drain bounds + ranges ────────────────────────────────────────────
    refreshHeap(mod);
    const boundsPtr = mod._malloc(8);
    mod._uade_wasm_get_module_bounds(boundsPtr);
    const b = new Uint32Array(mod.HEAPU8.buffer, boundsPtr, 2);
    const moduleBase = b[0];
    const moduleSize = b[1];
    mod._free(boundsPtr);

    const rangesPtr = mod._malloc(MAX_PAIRS * 8);
    const pairCount = mod._uade_wasm_get_module_ranges(rangesPtr, MAX_PAIRS);
    const r = new Uint32Array(mod.HEAPU8.buffer, rangesPtr, pairCount * 2);
    const ranges: TracedRange[] = [];
    let coverageBytes = 0;
    for (let i = 0; i < pairCount; i++) {
      const start = r[i * 2 + 0];
      const end = r[i * 2 + 1];
      ranges.push({ start, end });
      coverageBytes += end - start;
    }
    mod._free(rangesPtr);

    // Disable so a subsequent instance reuse (none here) stays clean.
    mod._uade_wasm_enable_module_trace(0);

    return { moduleBase, moduleSize, ranges, coverageBytes, frames: totalFrames };
  } finally {
    try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
  }
}

/** Refresh heap views if WASM memory grew (mirrors uadeRenderCore). */
function refreshHeap(mod: UADEModule): void {
  const mem = (mod as unknown as Record<string, unknown>)._wasmMemory as WebAssembly.Memory | undefined;
  if (!mem) return;
  const buf = mem.buffer;
  if (mod.HEAPU8.buffer !== buf) {
    mod.HEAPU8 = new Uint8Array(buf);
    mod.HEAPF32 = new Float32Array(buf);
  }
}

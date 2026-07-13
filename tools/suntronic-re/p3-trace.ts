/**
 * p3-trace.ts — Probe P3: UADE dynamic-trace confirmation of the score region.
 *
 * Replicates the traceModuleReads flow (load → enable trace → render → drain
 * ranges) but adds the SUNTronic instr/*.x companions to MEMFS BEFORE load —
 * traceModuleReads itself has no companion hook, and V1.3 modules are silent
 * without their external samples.
 *
 * NOTE (recorded expectation): V1.3 modules are relocated hunk EXECUTABLES.
 * If UADE's loader relocates the image away from the raw file bytes, module
 * reads will not map back to file offsets (the known coreDesign/fredGray
 * tracer limitation) and this probe reports zero/garbage coverage; the
 * decisive score confirmation then falls to P4 byte-poke render-compare.
 *
 * Usage: npx tsx tools/suntronic-re/p3-trace.ts [module] [seconds]
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import type { TraceModuleModule } from '../uade-audit/traceModuleReads';
import { CORPUS_DIR, addCompanions, loadInstrCompanions, rms } from './suntronicLib';

function refreshHeapU8(mod: TraceModuleModule): Uint8Array {
  return mod.HEAPU8;
}

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'mule.src';
  const seconds = Number(process.argv[3] ?? '4');
  const sampleRate = 44100;
  const data = readFileSync(join(CORPUS_DIR, name));

  const mod = (await loadUADEModule()) as TraceModuleModule;
  const initRet = mod._uade_wasm_init(sampleRate);
  if (initRet !== 0) throw new Error(`init failed ${initRet}`);
  try {
    addCompanions(mod, loadInstrCompanions());

    // ── load (mirrors traceModuleReads) ─────────────────────────────────
    const ptr = mod._malloc(data.byteLength);
    refreshHeapU8(mod).set(data, ptr);
    const hintLen = name.length * 4 + 1;
    const hintPtr = mod._malloc(hintLen);
    mod.stringToUTF8(name, hintPtr, hintLen);
    mod._uade_wasm_stop();
    mod._uade_wasm_set_looping(0);
    mod._uade_wasm_set_one_subsong(1);
    const loadRet = mod._uade_wasm_load(ptr, data.byteLength, hintPtr);
    mod._free(ptr);
    mod._free(hintPtr);
    if (loadRet !== 0) throw new Error(`load failed ${loadRet}`);

    mod._uade_wasm_enable_module_trace(1);

    // ── render ──────────────────────────────────────────────────────────
    const chunkSize = 4096;
    const ptrL = mod._malloc(chunkSize * 4);
    const ptrR = mod._malloc(chunkSize * 4);
    const maxFrames = sampleRate * seconds;
    const collected = new Float32Array(maxFrames);
    let totalFrames = 0;
    while (totalFrames < maxFrames) {
      const chunk = Math.min(chunkSize, maxFrames - totalFrames);
      const ret = mod._uade_wasm_render(ptrL, ptrR, chunk);
      if (ret <= 0) break;
      collected.set(new Float32Array(mod.HEAPU8.buffer, ptrL, chunk), totalFrames);
      totalFrames += chunk;
    }
    mod._free(ptrL);
    mod._free(ptrR);
    console.log(`[p3] ${name}: frames=${totalFrames} rms=${rms(collected.subarray(0, totalFrames)).toFixed(5)}`);

    // ── drain bounds + ranges ───────────────────────────────────────────
    const boundsPtr = mod._malloc(8);
    mod._uade_wasm_get_module_bounds(boundsPtr);
    const b = new Uint32Array(mod.HEAPU8.buffer, boundsPtr, 2);
    const moduleBase = b[0];
    const moduleSize = b[1];
    mod._free(boundsPtr);
    console.log(`[p3] module base=0x${moduleBase.toString(16)} size=${moduleSize} (file size ${data.byteLength})`);

    const MAX_PAIRS = 8192;
    const rangesPtr = mod._malloc(MAX_PAIRS * 8);
    const pairCount = mod._uade_wasm_get_module_ranges(rangesPtr, MAX_PAIRS);
    const r = new Uint32Array(mod.HEAPU8.buffer, rangesPtr, pairCount * 2);
    let coverage = 0;
    const ranges: string[] = [];
    for (let i = 0; i < pairCount; i++) {
      const s = r[i * 2], e = r[i * 2 + 1];
      coverage += e - s;
      if (ranges.length < 80) ranges.push(`0x${s.toString(16)}-0x${e.toString(16)}`);
    }
    mod._free(rangesPtr);
    mod._uade_wasm_enable_module_trace(0);
    console.log(`[p3] traced ranges: ${pairCount}, coverage ${coverage} bytes`);
    console.log(`[p3] ${ranges.join(' ')}${pairCount > 80 ? ' …' : ''}`);
  } finally {
    try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

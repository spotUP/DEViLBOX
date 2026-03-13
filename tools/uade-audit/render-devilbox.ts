/**
 * render-devilbox.ts — Render UADE modules to WAV using DEViLBOX's UADE WASM
 *
 * Drives the UADE WASM module headlessly (no AudioWorklet, no browser) to
 * produce WAV files that can be compared against uade123 reference renders.
 *
 * The UADE.js Emscripten bundle targets the web (ENVIRONMENT='web') and throws
 * when it detects Node.js. We patch out that check before loading.
 *
 * Usage:
 *   npx tsx tools/uade-audit/render-devilbox.ts <file>            # render one
 *   npx tsx tools/uade-audit/render-devilbox.ts <file> <out.wav>  # custom output path
 *   npx tsx tools/uade-audit/render-devilbox.ts --batch           # render all .test-formats/
 *   npx tsx tools/uade-audit/render-devilbox.ts --batch --force   # re-render existing
 *
 * Output: test-data/uade-devilbox/<name>.wav
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync } from 'fs';
import { join, basename, dirname } from 'path';
import { runInThisContext } from 'vm';

// ── Constants ─────────────────────────────────────────────────────────────────

const SAMPLE_RATE = 44100;
const RENDER_SECONDS = 30;
const CHUNK_SIZE = 4096; // frames per render call
const PROJECT_ROOT = join(dirname(new URL(import.meta.url).pathname), '../..');
const UADE_JS_PATH = join(PROJECT_ROOT, 'public/uade/UADE.js');
const UADE_WASM_PATH = join(PROJECT_ROOT, 'public/uade/UADE.wasm');
const TEST_FORMATS_DIR = join(PROJECT_ROOT, '.test-formats');
const OUTPUT_DIR = join(PROJECT_ROOT, 'test-data/uade-devilbox');

// ── WASM Module Types ─────────────────────────────────────────────────────────

interface UADEModule {
  _uade_wasm_init(sampleRate: number): number;
  _uade_wasm_load(ptr: number, len: number, hintPtr: number): number;
  _uade_wasm_render(ptrL: number, ptrR: number, frames: number): number;
  _uade_wasm_stop(): void;
  _uade_wasm_cleanup(): void;
  _uade_wasm_set_looping(loop: number): void;
  _uade_wasm_get_total_frames(): number;
  _malloc(size: number): number;
  _free(ptr: number): void;
  HEAPU8: Uint8Array;
  HEAPF32: Float32Array;
  stringToUTF8(str: string, ptr: number, maxBytes: number): void;
}

// ── WASM Loader ───────────────────────────────────────────────────────────────

async function loadUADEModule(): Promise<UADEModule> {
  const wasmBuf = readFileSync(UADE_WASM_PATH);
  const wasmBinary = wasmBuf.buffer.slice(
    wasmBuf.byteOffset,
    wasmBuf.byteOffset + wasmBuf.byteLength,
  );

  let jsCode = readFileSync(UADE_JS_PATH, 'utf8');

  // Patch out the Node.js environment check — UADE.js targets ENVIRONMENT='web'
  // and throws when process.versions.node is detected.
  // Use exact string replacement (regex fails due to ) inside the error message).
  // Exact string patches for both Node.js environment checks (regex fails due to
  // special chars inside the error message strings).
  const NODE_CHECK1 = 'if(currentNodeVersion<TARGET_NOT_SUPPORTED){throw new Error("not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)")}';
  // eslint-disable-next-line no-template-curly-in-string
  const NODE_CHECK2 = 'if(currentNodeVersion<2147483647){throw new Error(`This emscripten-generated code requires node v${packedVersionToHumanReadable(2147483647)} (detected v${packedVersionToHumanReadable(currentNodeVersion)})`)}';
  jsCode = jsCode.replace(NODE_CHECK1, '/* patched: allow node.js headless */');
  jsCode = jsCode.replace(NODE_CHECK2, '/* patched: allow node.js headless */');

  // Intercept WebAssembly.instantiate to capture memory exports (same as furnace renderer)
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

  // Provide browser globals that UADE.js expects (built for ENVIRONMENT='web,worker')
  const g = globalThis as Record<string, unknown>;
  // self = window/WorkerGlobalScope in browsers
  if (typeof g['self'] === 'undefined') g['self'] = globalThis;
  // UADE.js checks self.location.href for script path resolution
  if (!(g['self'] as Record<string, unknown>)['location']) {
    (g['self'] as Record<string, unknown>)['location'] = { href: UADE_JS_PATH };
  }
  // UADE.js checks globalThis.window||globalThis.WorkerGlobalScope to detect browser
  if (typeof g['WorkerGlobalScope'] === 'undefined') {
    g['WorkerGlobalScope'] = class FakeWorkerGlobalScope {};
  }

  // Execute via vm.runInThisContext — avoids tsx/esbuild template-literal mangling.
  // runInThisContext executes in the current V8 context so createUADE becomes
  // a global variable accessible via globalThis after execution.
  runInThisContext(jsCode);
  const createUADE = (globalThis as Record<string, unknown>)['createUADE'] as (
    opts: Record<string, unknown>,
  ) => Promise<UADEModule>;
  if (typeof createUADE !== 'function') {
    throw new Error('createUADE not found after loading UADE.js');
  }

  let mod: UADEModule;
  try {
    const factory = createUADE;

    mod = await factory({
      wasmBinary,
      locateFile: (path: string) => {
        if (path.endsWith('.wasm')) return UADE_WASM_PATH;
        return path;
      },
      print: (text: string) => {
        if (process.env.UADE_VERBOSE) console.log('[UADE]', text);
      },
      printErr: (text: string) => {
        if (process.env.UADE_VERBOSE) console.error('[UADE ERR]', text);
      },
      onAbort: (reason: string) => {
        console.error('[UADE ABORT]', reason);
      },
    });
  } finally {
    WebAssembly.instantiate = origInstantiate;
  }

  // Patch HEAP views from captured memory if needed
  if (capturedMemory) {
    const buf = (capturedMemory as WebAssembly.Memory).buffer;
    if (!mod.HEAPU8 || mod.HEAPU8.buffer !== buf) {
      mod.HEAPU8 = new Uint8Array(buf);
      mod.HEAPF32 = new Float32Array(buf);
    }
    (mod as Record<string, unknown>)._wasmMemory = capturedMemory;
  }

  return mod;
}

/** Refresh heap views if WASM memory grew */
function refreshHeap(mod: UADEModule): void {
  const mem = (mod as Record<string, unknown>)._wasmMemory as WebAssembly.Memory | undefined;
  if (!mem) return;
  const buf = mem.buffer;
  if (mod.HEAPU8.buffer !== buf) {
    mod.HEAPU8 = new Uint8Array(buf);
    mod.HEAPF32 = new Float32Array(buf);
  }
}

// ── WAV Writer ────────────────────────────────────────────────────────────────

function writeWav(outputPath: string, samples: Float32Array, sampleRate: number): void {
  const numChannels = 2;
  const bitsPerSample = 16;
  const numSamples = samples.length; // interleaved L+R
  const dataSize = numSamples * (bitsPerSample / 8);
  const buf = Buffer.alloc(44 + dataSize);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);           // fmt chunk size
  buf.writeUInt16LE(1, 20);            // PCM
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28); // byte rate
  buf.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);              // block align
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  let off = 44;
  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(clamped * 32767), off);
    off += 2;
  }

  writeFileSync(outputPath, buf);
}

// ── Render a single file ──────────────────────────────────────────────────────

async function renderFile(
  mod: UADEModule,
  inputPath: string,
  outputPath: string,
): Promise<{ ok: boolean; frames: number; error?: string }> {
  const data = readFileSync(inputPath);
  const filename = basename(inputPath);

  // Allocate WASM buffers
  const ptr = mod._malloc(data.byteLength);
  if (!ptr) return { ok: false, frames: 0, error: 'malloc failed for file data' };
  refreshHeap(mod);
  mod.HEAPU8.set(data, ptr);

  const hintLen = filename.length * 4 + 1;
  const hintPtr = mod._malloc(hintLen);
  if (!hintPtr) {
    mod._free(ptr);
    return { ok: false, frames: 0, error: 'malloc failed for filename hint' };
  }
  mod.stringToUTF8(filename, hintPtr, hintLen);

  // Stop any previous song
  mod._uade_wasm_stop();
  mod._uade_wasm_set_looping(0);

  const loadRet = mod._uade_wasm_load(ptr, data.byteLength, hintPtr);
  mod._free(ptr);
  mod._free(hintPtr);

  if (loadRet !== 0) {
    return { ok: false, frames: 0, error: `_uade_wasm_load failed (ret=${loadRet})` };
  }

  // Allocate audio output buffers
  const ptrL = mod._malloc(CHUNK_SIZE * 4);
  const ptrR = mod._malloc(CHUNK_SIZE * 4);
  if (!ptrL || !ptrR) {
    if (ptrL) mod._free(ptrL);
    if (ptrR) mod._free(ptrR);
    return { ok: false, frames: 0, error: 'malloc failed for audio buffers' };
  }

  const maxFrames = SAMPLE_RATE * RENDER_SECONDS;
  const allSamples: number[] = [];
  let totalFrames = 0;

  // _uade_wasm_render() returns 1=ok, 0=song-ended, negative=error.
  // When it returns 1, exactly `chunk` float32 samples have been written to ptrL/ptrR.
  // WASM panning is set to 1.0 (full mono mix to center): L and R are identical.
  // Use ptrL >> 2 (not / 4) to get the correct float32 array index.
  while (totalFrames < maxFrames) {
    const chunk = Math.min(CHUNK_SIZE, maxFrames - totalFrames);
    const ret = mod._uade_wasm_render(ptrL, ptrR, chunk);
    if (ret === 0) break; // song ended normally
    if (ret < 0) break;  // error

    refreshHeap(mod);

    // Read L+R from HEAPF32 (use >> 2 for byte-to-float32-index conversion)
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

  if (allSamples.length === 0) {
    return { ok: false, frames: 0, error: 'No audio rendered (silence or immediate stop)' };
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeWav(outputPath, new Float32Array(allSamples), SAMPLE_RATE);

  return { ok: true, frames: totalFrames };
}

// ── CLI Entry Point ───────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const batchMode = args.includes('--batch');
  const force = args.includes('--force');
  const files = args.filter(a => !a.startsWith('--'));

  console.log('[uade-render] Loading UADE WASM module...');
  const mod = await loadUADEModule();

  // Initialize UADE engine
  const initRet = mod._uade_wasm_init(SAMPLE_RATE);
  if (initRet !== 0) {
    console.error(`[uade-render] _uade_wasm_init failed (ret=${initRet})`);
    process.exit(1);
  }
  console.log('[uade-render] UADE engine initialized');

  mkdirSync(OUTPUT_DIR, { recursive: true });

  if (batchMode) {
    // Render all files in .test-formats/
    const formatFiles = readdirSync(TEST_FORMATS_DIR)
      .filter(f => statSync(join(TEST_FORMATS_DIR, f)).isFile())
      .sort();

    let success = 0, fail = 0, skip = 0;

    for (const name of formatFiles) {
      const inputPath = join(TEST_FORMATS_DIR, name);
      const outputPath = join(OUTPUT_DIR, `${name}.wav`);

      if (!force && existsSync(outputPath)) {
        console.log(`[skip] ${name}`);
        skip++;
        continue;
      }

      process.stdout.write(`[render] ${name}... `);
      const result = await renderFile(mod, inputPath, outputPath);
      if (result.ok) {
        const sizeKb = Math.round(statSync(outputPath).size / 1024);
        console.log(`OK (${result.frames} frames, ${sizeKb}KB)`);
        success++;
      } else {
        console.log(`FAIL: ${result.error}`);
        fail++;
      }
    }

    console.log(`\n[uade-render] Done. OK=${success}, FAIL=${fail}, SKIP=${skip}`);

  } else if (files.length >= 1) {
    // Render single file
    let inputPath = files[0];
    if (!existsSync(inputPath)) {
      inputPath = join(TEST_FORMATS_DIR, files[0]);
    }
    if (!existsSync(inputPath)) {
      console.error(`File not found: ${files[0]}`);
      process.exit(1);
    }

    const name = basename(inputPath);
    const outputPath = files[1] ?? join(OUTPUT_DIR, `${name}.wav`);

    console.log(`[render] ${name}...`);
    const result = await renderFile(mod, inputPath, outputPath);
    if (result.ok) {
      console.log(`[OK] ${outputPath} (${result.frames} frames)`);
    } else {
      console.error(`[FAIL] ${result.error}`);
      process.exit(1);
    }

  } else {
    console.log('Usage:');
    console.log('  npx tsx tools/uade-audit/render-devilbox.ts <file>            # single file');
    console.log('  npx tsx tools/uade-audit/render-devilbox.ts --batch           # all .test-formats/');
    console.log('  npx tsx tools/uade-audit/render-devilbox.ts --batch --force   # re-render all');
    process.exit(1);
  }

  try { mod._uade_wasm_cleanup(); } catch { /* ignore cleanup errors */ }
}

main().catch(err => {
  console.error('[uade-render] Fatal:', err);
  process.exit(1);
});

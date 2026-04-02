/**
 * Server-side render + analysis route.
 *
 * POST /api/render/analyze
 *   Body: multipart/form-data with field "file" (the module binary) and "filename" (string)
 *   Returns: { bpm, musicalKey, energy, duration }
 *
 * Uses the UADE WASM headless renderer in Node.js to bypass the broken
 * render worker IPC. The UADE worklet works in AudioWorklet context but
 * the Emscripten `new Function()` glue in Web Workers has a persistent
 * fd_write routing bug that prevents the IPC ring buffer from working.
 *
 * This endpoint is called by DJPlaylistAnalyzer when the browser-side
 * render worker fails for UADE formats.
 */

/// <reference lib="dom" />
import { Router, Request, Response } from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';
import { runInThisContext } from 'vm';

const router = Router();

// ── UADE WASM types ─────────────────────────────────────────────────────────

interface UADEModule {
  _uade_wasm_init(sampleRate: number): number;
  _uade_wasm_load(ptr: number, len: number, hintPtr: number): number;
  _uade_wasm_render(ptrL: number, ptrR: number, frames: number): number;
  _uade_wasm_stop(): void;
  _uade_wasm_set_looping(loop: number): void;
  _uade_wasm_set_one_subsong(on: number): void;
  _uade_wasm_add_extra_file(namePtr: number, dataPtr: number, len: number): number;
  _malloc(size: number): number;
  _free(ptr: number): void;
  HEAPU8: Uint8Array;
  HEAPF32: Float32Array;
  stringToUTF8(str: string, ptr: number, maxBytes: number): void;
  [key: string]: unknown;
}

// ── Constants ────────────────────────────────────────────────────────────────

const SAMPLE_RATE = 44100;
const RENDER_SECONDS = 60; // Render up to 60s for analysis
const CHUNK_SIZE = 4096;
const PROJECT_ROOT = join(__dirname, '../../..');
const UADE_JS_PATH = join(PROJECT_ROOT, 'public/uade/UADE.js');
const UADE_WASM_PATH = join(PROJECT_ROOT, 'public/uade/UADE.wasm');

// ── UADE module singleton ────────────────────────────────────────────────────

let uadeModule: UADEModule | null = null;
let uadeInitializing = false;

function refreshHeap(mod: UADEModule): void {
  const mem = (mod as unknown as Record<string, unknown>)._wasmMemory as WebAssembly.Memory | undefined;
  if (!mem) return;
  const buf = mem.buffer;
  if (mod.HEAPU8.buffer !== buf) {
    mod.HEAPU8 = new Uint8Array(buf);
    mod.HEAPF32 = new Float32Array(buf);
  }
}

async function getUADEModule(): Promise<UADEModule> {
  if (uadeModule) return uadeModule;
  if (uadeInitializing) {
    // Wait for in-flight init
    while (uadeInitializing) {
      await new Promise(r => setTimeout(r, 100));
    }
    if (uadeModule) return uadeModule;
  }

  uadeInitializing = true;
  try {
    const wasmBuf = readFileSync(UADE_WASM_PATH);
    const wasmBinary = wasmBuf.buffer.slice(
      wasmBuf.byteOffset,
      wasmBuf.byteOffset + wasmBuf.byteLength,
    );

    let jsCode = readFileSync(UADE_JS_PATH, 'utf8');

    // Patch Node.js env checks (same as render-devilbox.ts)
    const NODE_CHECK1 = 'if(currentNodeVersion<TARGET_NOT_SUPPORTED){throw new Error("not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)")}';
    // eslint-disable-next-line no-template-curly-in-string
    const NODE_CHECK2 = 'if(currentNodeVersion<2147483647){throw new Error(`This emscripten-generated code requires node v${packedVersionToHumanReadable(2147483647)} (detected v${packedVersionToHumanReadable(currentNodeVersion)})`)}';
    jsCode = jsCode.replace(NODE_CHECK1, '/* patched */');
    jsCode = jsCode.replace(NODE_CHECK2, '/* patched */');

    // Capture WASM memory for heap refresh
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

    // Browser globals
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

    const mod = await createUADE({
      wasmBinary,
      locateFile: (path: string) => {
        if (path.endsWith('.wasm')) return UADE_WASM_PATH;
        return path;
      },
      print: (msg: string) => { if (process.env.UADE_VERBOSE) console.log('[UADE]', msg); },
      printErr: (msg: string) => console.warn('[UADE-ERR]', msg),
    });

    WebAssembly.instantiate = origInstantiate;

    if (capturedMemory) {
      const mem = capturedMemory as WebAssembly.Memory;
      const buf = mem.buffer;
      if (!mod.HEAPU8 || mod.HEAPU8.buffer !== buf) {
        mod.HEAPU8 = new Uint8Array(buf);
        mod.HEAPF32 = new Float32Array(buf);
      }
      (mod as unknown as Record<string, unknown>)._wasmMemory = mem;
    }

    const initRet = mod._uade_wasm_init(SAMPLE_RATE);
    if (initRet !== 0) throw new Error(`uade_wasm_init failed: ${initRet}`);

    uadeModule = mod;
    console.log('[RenderRoute] UADE headless renderer initialized');
    return mod;
  } finally {
    uadeInitializing = false;
  }
}

// ── Render a buffer to audio ─────────────────────────────────────────────────

function addCompanionFile(mod: UADEModule, filename: string, data: Buffer): void {
  const nameLen = filename.length * 4 + 1;
  const namePtr = mod._malloc(nameLen);
  if (!namePtr) return;
  mod.stringToUTF8(filename, namePtr, nameLen);
  const dataPtr = mod._malloc(data.byteLength);
  if (!dataPtr) { mod._free(namePtr); return; }
  refreshHeap(mod);
  mod.HEAPU8.set(data, dataPtr);
  mod._uade_wasm_add_extra_file(namePtr, dataPtr, data.byteLength);
  mod._free(namePtr);
  mod._free(dataPtr);
}

function renderBuffer(
  mod: UADEModule,
  fileData: Buffer,
  filename: string,
  companionFiles?: Array<{ name: string; data: Buffer }>,
): { samples: Float32Array; duration: number } | null {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);

  // Write companion files BEFORE loading (e.g. TFMX smpl.* for mdat.*)
  if (companionFiles) {
    for (const cf of companionFiles) {
      const safeCfName = cf.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
      addCompanionFile(mod, safeCfName, cf.data);
    }
  }

  const ptr = mod._malloc(fileData.byteLength);
  if (!ptr) return null;
  refreshHeap(mod);
  mod.HEAPU8.set(fileData, ptr);

  const hintLen = safeName.length * 4 + 1;
  const hintPtr = mod._malloc(hintLen);
  if (!hintPtr) { mod._free(ptr); return null; }
  mod.stringToUTF8(safeName, hintPtr, hintLen);

  mod._uade_wasm_stop();
  mod._uade_wasm_set_looping(0);
  mod._uade_wasm_set_one_subsong(1);

  console.log(`[RenderRoute] Loading ${safeName} (${fileData.byteLength} bytes)...`);
  const loadRet = mod._uade_wasm_load(ptr, fileData.byteLength, hintPtr);
  mod._free(ptr);
  mod._free(hintPtr);

  if (loadRet !== 0) {
    console.error(`[RenderRoute] _uade_wasm_load failed for ${safeName}: ret=${loadRet}`);
    return null;
  }

  const ptrL = mod._malloc(CHUNK_SIZE * 4);
  const ptrR = mod._malloc(CHUNK_SIZE * 4);
  if (!ptrL || !ptrR) {
    if (ptrL) mod._free(ptrL);
    if (ptrR) mod._free(ptrR);
    return null;
  }

  const maxFrames = SAMPLE_RATE * RENDER_SECONDS;
  const allSamples: number[] = [];
  let totalFrames = 0;
  let silentFrames = 0;
  const SILENCE_THRESHOLD = 0.0001;

  while (totalFrames < maxFrames) {
    const chunk = Math.min(CHUNK_SIZE, maxFrames - totalFrames);
    const ret = mod._uade_wasm_render(ptrL, ptrR, chunk);
    if (ret <= 0) break;

    refreshHeap(mod);
    const heapF32 = new Float32Array(mod.HEAPU8.buffer);
    const indexL = ptrL >> 2;
    const indexR = ptrR >> 2;

    let chunkSilent = true;
    for (let i = 0; i < chunk; i++) {
      const l = heapF32[indexL + i];
      const r = heapF32[indexR + i];
      allSamples.push(l, r);
      if (Math.abs(l) > SILENCE_THRESHOLD || Math.abs(r) > SILENCE_THRESHOLD) {
        chunkSilent = false;
      }
    }

    totalFrames += chunk;
    if (chunkSilent) {
      silentFrames += chunk;
      if (silentFrames > SAMPLE_RATE * 4 && totalFrames > SAMPLE_RATE) break;
    } else {
      silentFrames = 0;
    }
  }

  mod._free(ptrL);
  mod._free(ptrR);
  mod._uade_wasm_stop();

  if (totalFrames === 0) {
    console.error(`[RenderRoute] 0 frames rendered for ${safeName}`);
    return null;
  }

  console.log(`[RenderRoute] Rendered ${safeName}: ${totalFrames} frames (${(totalFrames / SAMPLE_RATE).toFixed(1)}s)`);
  return {
    samples: new Float32Array(allSamples),
    duration: totalFrames / SAMPLE_RATE,
  };
}

// ── Simple BPM detection (autocorrelation) ──────────────────────────────────

function detectBPMFromSamples(samples: Float32Array, sampleRate: number): number {
  // Mix to mono
  const mono = new Float32Array(samples.length / 2);
  for (let i = 0; i < mono.length; i++) {
    mono[i] = (samples[i * 2] + samples[i * 2 + 1]) * 0.5;
  }

  // Energy onset detection
  const hopSize = 512;
  const energies: number[] = [];
  for (let i = 0; i < mono.length - hopSize; i += hopSize) {
    let sum = 0;
    for (let j = 0; j < hopSize; j++) sum += mono[i + j] * mono[i + j];
    energies.push(sum / hopSize);
  }

  // Onset flux
  const flux: number[] = [0];
  for (let i = 1; i < energies.length; i++) {
    flux.push(Math.max(0, energies[i] - energies[i - 1]));
  }

  // Autocorrelation on onset flux
  const minLag = Math.floor(sampleRate / hopSize * 60 / 200); // 200 BPM
  const maxLag = Math.floor(sampleRate / hopSize * 60 / 60);  // 60 BPM
  let bestLag = minLag;
  let bestCorr = -Infinity;

  for (let lag = minLag; lag <= maxLag && lag < flux.length; lag++) {
    let corr = 0;
    const n = Math.min(flux.length - lag, 1000);
    for (let i = 0; i < n; i++) {
      corr += flux[i] * flux[i + lag];
    }
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  const bpm = (sampleRate / hopSize * 60) / bestLag;
  // Normalize to 60-200 range
  let normalized = bpm;
  while (normalized > 200) normalized /= 2;
  while (normalized < 60) normalized *= 2;
  return Math.round(normalized * 10) / 10;
}

// ── Simple key detection (chroma) ───────────────────────────────────────────

const KEY_NAMES = [
  'C major', 'C# major', 'D major', 'D# major', 'E major', 'F major',
  'F# major', 'G major', 'G# major', 'A major', 'A# major', 'B major',
  'C minor', 'C# minor', 'D minor', 'D# minor', 'E minor', 'F minor',
  'F# minor', 'G minor', 'G# minor', 'A minor', 'A# minor', 'B minor',
];

// Krumhansl-Schmuckler key profiles
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function detectKeyFromSamples(samples: Float32Array, sampleRate: number): string {
  // Mix to mono
  const mono = new Float32Array(samples.length / 2);
  for (let i = 0; i < mono.length; i++) {
    mono[i] = (samples[i * 2] + samples[i * 2 + 1]) * 0.5;
  }

  // Simple chroma extraction via DFT at chromatic frequencies
  const chroma = new Float32Array(12);
  const windowSize = 8192;
  const numWindows = Math.min(20, Math.floor(mono.length / windowSize));

  for (let w = 0; w < numWindows; w++) {
    const offset = Math.floor(w * (mono.length - windowSize) / Math.max(1, numWindows - 1));
    for (let note = 0; note < 12; note++) {
      // Check octaves 2-6
      for (let octave = 2; octave <= 6; octave++) {
        const freq = 440 * Math.pow(2, (note - 9 + (octave - 4) * 12) / 12);
        // Goertzel-like: compute magnitude at this frequency
        const k = Math.round(freq * windowSize / sampleRate);
        if (k <= 0 || k >= windowSize / 2) continue;
        let realPart = 0, imagPart = 0;
        const omega = 2 * Math.PI * k / windowSize;
        for (let i = 0; i < windowSize; i++) {
          realPart += mono[offset + i] * Math.cos(omega * i);
          imagPart += mono[offset + i] * Math.sin(omega * i);
        }
        chroma[note] += Math.sqrt(realPart * realPart + imagPart * imagPart);
      }
    }
  }

  // Normalize chroma
  const maxChroma = Math.max(...chroma);
  if (maxChroma > 0) {
    for (let i = 0; i < 12; i++) chroma[i] /= maxChroma;
  }

  // Correlate with Krumhansl-Schmuckler profiles
  let bestKey = 0;
  let bestCorr = -Infinity;

  for (let key = 0; key < 24; key++) {
    const profile = key < 12 ? MAJOR_PROFILE : MINOR_PROFILE;
    const shift = key % 12;
    let corr = 0;
    for (let i = 0; i < 12; i++) {
      corr += chroma[(i + shift) % 12] * profile[i];
    }
    if (corr > bestCorr) {
      bestCorr = corr;
      bestKey = key;
    }
  }

  return KEY_NAMES[bestKey];
}

// ── Simple energy detection ─────────────────────────────────────────────────

function detectEnergy(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  const rms = Math.sqrt(sum / samples.length);
  // Map RMS to 0-1 (typical tracker modules: 0.01-0.3 RMS)
  return Math.min(1, Math.max(0, rms / 0.2));
}

// ── POST /api/render/analyze ─────────────────────────────────────────────────

router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const filename = req.query.filename as string || 'unknown.mod';
    const companionPath = req.query.companion as string | undefined;

    // express.raw() middleware puts the binary in req.body as a Buffer
    const fileData = req.body as Buffer;

    if (!fileData || fileData.length === 0) {
      return res.status(400).json({ error: 'Empty file body — send as application/octet-stream' });
    }

    // Download companion file if specified (e.g. TFMX smpl.* for mdat.*)
    let companions: Array<{ name: string; data: Buffer }> | undefined;
    if (companionPath) {
      try {
        const companionUrl = `https://modland.com/pub/modules/${companionPath}`;
        const cfResp = await fetch(companionUrl);
        if (cfResp.ok) {
          const cfData = Buffer.from(await cfResp.arrayBuffer());
          const cfName = companionPath.split('/').pop() || 'companion';
          companions = [{ name: cfName, data: cfData }];
          console.log(`[RenderRoute] Downloaded companion: ${cfName} (${cfData.byteLength} bytes)`);
        }
      } catch (cfErr) {
        console.warn(`[RenderRoute] Failed to download companion ${companionPath}:`, cfErr);
      }
    }

    const mod = await getUADEModule();
    const result = renderBuffer(mod, fileData, filename, companions);

    if (!result) {
      return res.status(422).json({ error: `Failed to render ${filename}` });
    }

    const bpm = detectBPMFromSamples(result.samples, SAMPLE_RATE);
    const musicalKey = detectKeyFromSamples(result.samples, SAMPLE_RATE);
    const energy = detectEnergy(result.samples);

    res.json({
      bpm,
      musicalKey,
      energy,
      duration: result.duration,
    });
  } catch (err) {
    console.error('[RenderRoute] Analysis failed:', err);
    res.status(500).json({ error: 'Render failed' });
  }
});

export default router;

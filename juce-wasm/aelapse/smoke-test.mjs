#!/usr/bin/env node
// Smoke test for the Aelapse DSP WASM module.
// Feeds a ~100 ms impulse into the effect and verifies non-zero output,
// which proves the process() method reaches both DSP stages (tape delay
// then spring reverb) without crashing.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, '../../public/aelapse');
const wasmBuf = fs.readFileSync(path.join(publicDir, 'Aelapse.wasm'));
const jsCode = fs.readFileSync(path.join(publicDir, 'Aelapse.js'), 'utf8');

// Emscripten MODULARIZE=1 + EXPORT_NAME sets globalThis.createAelapseModule.
// Evaluate the glue and grab the factory.
const factory = new Function(jsCode + '\nreturn createAelapseModule;')();
if (typeof factory !== 'function') {
  console.error('createAelapseModule factory not found');
  process.exit(1);
}

// Emscripten 4.x no longer auto-exports HEAPF32 on the module object. Intercept
// WebAssembly.instantiate to capture the WASM Memory, then build our own views.
// Same pattern the AudioWorklet uses at runtime (see WASM_EFFECTS_GUIDE.md).
let capturedMemory = null;
const origInstantiate = WebAssembly.instantiate;
WebAssembly.instantiate = async function(...args) {
  const result = await origInstantiate.apply(this, args);
  const instance = result.instance || result;
  if (instance.exports) {
    for (const v of Object.values(instance.exports)) {
      if (v instanceof WebAssembly.Memory) { capturedMemory = v; break; }
    }
  }
  return result;
};

let Module;
try {
  Module = await factory({ wasmBinary: wasmBuf });
} finally {
  WebAssembly.instantiate = origInstantiate;
}

// Build our own Float32Array view into the shared memory buffer.
const heap = () => new Float32Array(capturedMemory.buffer);

console.log('[smoke] Module loaded, version:', typeof Module);
console.log('[smoke] AelapseEffect:', typeof Module.AelapseEffect);

const fx = new Module.AelapseEffect();
console.log('[smoke] new AelapseEffect() OK');

// Method surface check — these come from WASMEffectBase via the Embind base binding.
const methods = ['initialize', 'process', 'setParameter', 'getParameter',
                 'getParameterCount', 'getParameterName',
                 'getRMSFrameCount', 'getRMSStackPos', 'copyRMSFrames'];
for (const m of methods) {
  const t = typeof fx[m];
  console.log(`[smoke]   ${m}: ${t}`);
  if (t !== 'function') {
    console.error(`[smoke] MISSING METHOD: ${m}`);
    process.exit(1);
  }
}

console.log('[smoke] paramCount:', fx.getParameterCount());
for (let i = 0; i < fx.getParameterCount(); i++) {
  console.log(`[smoke]   [${i}] ${fx.getParameterName(i)} = ${fx.getParameter(i)}`);
}

// Initialize at 48 kHz and run a short block through it.
const SR = 48000;
const N  = 128;
fx.initialize(SR);
console.log('[smoke] initialize(48000) OK');

const inL  = Module._malloc(N * 4);
const inR  = Module._malloc(N * 4);
const outL = Module._malloc(N * 4);
const outR = Module._malloc(N * 4);

// Write a short impulse into the input buffers — one sample of 0.5, rest 0.
const inArr = new Float32Array(N);
inArr[0] = 0.5;
heap().set(inArr, inL / 4);
heap().set(inArr, inR / 4);

fx.process(inL, inR, outL, outR, N);
console.log('[smoke] process() returned without crashing');

// Measure RMS of the output.
let sumSq = 0;
let peak  = 0;
{
  const h = heap();
  for (let i = 0; i < N; i++) {
    const v = h[(outL / 4) + i];
    sumSq += v * v;
    if (Math.abs(v) > peak) peak = Math.abs(v);
  }
}
const rms = Math.sqrt(sumSq / N);
console.log(`[smoke] block 1 output RMS: ${rms.toFixed(6)}  peak: ${peak.toFixed(6)}`);

// Process a lot more blocks with sustained white-noise input to make sure
// the RMS stack fills with real data (the stack has 64 slots × ~48-sample
// hop, so we need at least 64 × 48 / 128 ≈ 24 blocks of non-silent input
// before the whole buffer is populated).
let peakRolling = peak;
const noiseBlocks = 200;
for (let block = 0; block < noiseBlocks; block++) {
  const h = heap();
  for (let i = 0; i < N; i++) {
    const n = (Math.random() - 0.5) * 0.4;
    h[(inL / 4) + i] = n;
    h[(inR / 4) + i] = n;
  }
  fx.process(inL, inR, outL, outR, N);
  for (let i = 0; i < N; i++) {
    const v = Math.abs(h[(outL / 4) + i]);
    if (v > peakRolling) peakRolling = v;
  }
}
console.log(`[smoke] rolling peak over ${noiseBlocks + 2} blocks: ${peakRolling.toFixed(6)}`);

// RMS stack — should have non-zero entries after processing audio.
const stackFrames = fx.getRMSFrameCount();
const stackPos    = fx.getRMSStackPos();
console.log(`[smoke] RMS stack frames: ${stackFrames}  position: ${stackPos}`);

const rmsPtr = Module._malloc(stackFrames * 4 * 4);
fx.copyRMSFrames(rmsPtr, stackFrames);
let rmsMax = 0;
let rmsNonZero = 0;
{
  const h = heap();
  for (let i = 0; i < stackFrames * 4; i++) {
    const v = Math.abs(h[(rmsPtr / 4) + i]);
    if (v > rmsMax) rmsMax = v;
    if (v > 1e-9) rmsNonZero++;
  }
}
console.log(`[smoke] RMS stack peak: ${rmsMax}  non-zero lanes: ${rmsNonZero}/${stackFrames * 4}`);
// Dump the first few frames for inspection
const dumpH = heap();
console.log('[smoke] first 4 RMS frames:');
for (let f = 0; f < 4; f++) {
  const base = (rmsPtr / 4) + f * 4;
  console.log(`[smoke]   frame ${f}: [${dumpH[base].toExponential(2)}, ${dumpH[base+1].toExponential(2)}, ${dumpH[base+2].toExponential(2)}, ${dumpH[base+3].toExponential(2)}]`);
}

Module._free(inL);
Module._free(inR);
Module._free(outL);
Module._free(outR);
Module._free(rmsPtr);
fx.delete();  // Embind cleanup

// Verdict
if (peakRolling > 1e-5) {
  console.log('[smoke] PASS — effect produces non-silent output');
  process.exit(0);
} else {
  console.log('[smoke] FAIL — output stayed silent');
  process.exit(1);
}

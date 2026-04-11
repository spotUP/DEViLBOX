#!/usr/bin/env node
// Smoke-test the Geonkick WASM build: create an instance, trigger a note,
// render 2 seconds of audio, and verify the output is non-silent.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', 'public', 'geonkick');

const wasmBinary = fs.readFileSync(path.join(PUBLIC, 'Geonkick.wasm'));
const jsCode = fs.readFileSync(path.join(PUBLIC, 'Geonkick.js'), 'utf8');

// The Emscripten glue exports createGeonkickModule but the MODULARIZE JS is
// a UMD/commonjs shell — evaluate it as a function that returns the factory.
const factory = new Function(jsCode + '\nreturn createGeonkickModule;')();

const Module = await factory({ wasmBinary });

// Cwrap the exported C functions.
const gk = {
  create:       Module.cwrap('gk_wasm_create',       'number', ['number']),
  destroy:      Module.cwrap('gk_wasm_destroy',      null,     ['number']),
  keyPressed:   Module.cwrap('gk_wasm_key_pressed',  null,     ['number', 'number', 'number', 'number']),
  renderMono:   Module.cwrap('gk_wasm_render_mono',  null,     ['number', 'number', 'number']),
  getLength:    Module.cwrap('gk_wasm_get_length',   'number', ['number']),
  setLength:    Module.cwrap('gk_wasm_set_length',   null,     ['number', 'number']),
  setLimiter:   Module.cwrap('gk_wasm_set_limiter',  null,     ['number', 'number']),
};

const SAMPLE_RATE = 48000;
const DURATION_SEC = 2;
const N = SAMPLE_RATE * DURATION_SEC;

console.log('[smoke] creating instance...');
const handle = gk.create(SAMPLE_RATE);
if (!handle) throw new Error('gk_wasm_create returned null');
console.log('[smoke] handle:', handle);

console.log('[smoke] default kick length (sec):', gk.getLength(handle));

// Allocate an output buffer in WASM heap.
const bufPtr = Module._malloc(N * 4);
const bufView = new Float32Array(Module.HEAPF32.buffer, bufPtr, N);

// Trigger: note 69 (A4), velocity 127.
console.log('[smoke] triggering note...');
gk.keyPressed(handle, 1, 69, 127);

// Render the whole window.
console.log('[smoke] rendering', N, 'samples...');
gk.renderMono(handle, bufPtr, N);

// Quick stats.
let peak = 0, sumSq = 0, nonZero = 0;
for (let i = 0; i < N; i++) {
  const v = bufView[i];
  const a = Math.abs(v);
  if (a > peak) peak = a;
  sumSq += v * v;
  if (a > 1e-6) nonZero++;
}
const rms = Math.sqrt(sumSq / N);

console.log('[smoke] samples:', N);
console.log('[smoke] non-zero count:', nonZero, '(' + ((nonZero / N) * 100).toFixed(1) + '%)');
console.log('[smoke] peak:', peak.toFixed(4));
console.log('[smoke] rms:',  rms.toFixed(4));

// Dump to WAV for listening.
function writeWavMono(filepath, samples, sampleRate) {
  const byteRate = sampleRate * 2;
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  let p = 0;
  buf.write('RIFF', p); p += 4;
  buf.writeUInt32LE(36 + dataSize, p); p += 4;
  buf.write('WAVE', p); p += 4;
  buf.write('fmt ', p); p += 4;
  buf.writeUInt32LE(16, p); p += 4;
  buf.writeUInt16LE(1, p); p += 2;       // PCM
  buf.writeUInt16LE(1, p); p += 2;       // mono
  buf.writeUInt32LE(sampleRate, p); p += 4;
  buf.writeUInt32LE(byteRate, p); p += 4;
  buf.writeUInt16LE(2, p); p += 2;       // block align
  buf.writeUInt16LE(16, p); p += 2;      // bits per sample
  buf.write('data', p); p += 4;
  buf.writeUInt32LE(dataSize, p); p += 4;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), p);
    p += 2;
  }
  fs.writeFileSync(filepath, buf);
}

const wavPath = path.join(__dirname, 'smoke-out.wav');
// Copy out of WASM heap (the bufView is a live HEAPF32 slice).
const outCopy = new Float32Array(N);
outCopy.set(bufView);
writeWavMono(wavPath, outCopy, SAMPLE_RATE);
console.log('[smoke] wav written:', wavPath);

Module._free(bufPtr);
gk.destroy(handle);

// Pass/fail gate.
if (rms > 0.001 && peak > 0.01) {
  console.log('[smoke] PASS — non-silent output');
  process.exit(0);
} else {
  console.log('[smoke] FAIL — output too quiet (silent default kick?)');
  process.exit(1);
}

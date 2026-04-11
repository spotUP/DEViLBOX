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
  create:               Module.cwrap('gk_wasm_create',                'number', ['number']),
  destroy:              Module.cwrap('gk_wasm_destroy',               null,     ['number']),
  keyPressed:           Module.cwrap('gk_wasm_key_pressed',           null,     ['number', 'number', 'number', 'number']),
  renderMono:           Module.cwrap('gk_wasm_render_mono',           null,     ['number', 'number', 'number']),
  getLength:            Module.cwrap('gk_wasm_get_length',            'number', ['number']),
  setLength:            Module.cwrap('gk_wasm_set_length',            null,     ['number', 'number']),
  setLimiter:           Module.cwrap('gk_wasm_set_limiter',           null,     ['number', 'number']),
  setFilterEnabled:     Module.cwrap('gk_wasm_set_filter_enabled',    null,     ['number', 'number']),
  setFilterCutoff:      Module.cwrap('gk_wasm_set_filter_cutoff',     null,     ['number', 'number']),
  setFilterFactor:      Module.cwrap('gk_wasm_set_filter_factor',     null,     ['number', 'number']),
  setFilterType:        Module.cwrap('gk_wasm_set_filter_type',       null,     ['number', 'number']),
  setDistortionEnabled: Module.cwrap('gk_wasm_set_distortion_enabled', null,    ['number', 'number']),
  setDistortionDrive:   Module.cwrap('gk_wasm_set_distortion_drive',  null,     ['number', 'number']),
  setDistortionVolume:  Module.cwrap('gk_wasm_set_distortion_volume', null,     ['number', 'number']),
  enableOsc:            Module.cwrap('gk_wasm_enable_osc',            null,     ['number', 'number', 'number']),
  setOscAmplitude:      Module.cwrap('gk_wasm_set_osc_amplitude',     null,     ['number', 'number', 'number']),
  setOscFrequency:      Module.cwrap('gk_wasm_set_osc_frequency',     null,     ['number', 'number', 'number']),
  setOscFunction:       Module.cwrap('gk_wasm_set_osc_function',      null,     ['number', 'number', 'number']),
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

function renderAndStat(label) {
  gk.keyPressed(handle, 1, 69, 127);
  gk.renderMono(handle, bufPtr, N);
  let peak = 0, sumSq = 0, nonZero = 0;
  for (let i = 0; i < N; i++) {
    const v = bufView[i];
    const a = Math.abs(v);
    if (a > peak) peak = a;
    sumSq += v * v;
    if (a > 1e-6) nonZero++;
  }
  const rms = Math.sqrt(sumSq / N);
  console.log(
    '[smoke]', label.padEnd(22),
    'nonZero=' + String(nonZero).padStart(6),
    'peak=' + peak.toFixed(4),
    'rms=' + rms.toFixed(4),
  );
  return { peak, rms };
}

// Variant 1: out-of-the-box default kick.
const a = renderAndStat('default');

// Variant 2: add filter at 200 Hz with resonance.
gk.setFilterEnabled(handle, 1);
gk.setFilterType(handle, 0);          // 0 = LP
gk.setFilterCutoff(handle, 200);
gk.setFilterFactor(handle, 10);
const b = renderAndStat('LP 200Hz Q=10');

// Variant 3: disable filter, crank up osc 0 frequency + distortion.
gk.setFilterEnabled(handle, 0);
gk.setOscFrequency(handle, 0, 600);   // way above the default
gk.setDistortionEnabled(handle, 1);
gk.setDistortionDrive(handle, 2.0);
gk.setDistortionVolume(handle, 1.0);
const c = renderAndStat('600 Hz + drive');

// Variant 4: switch osc 0 to sawtooth.
gk.setOscFunction(handle, 0, 3);      // 3 = sawtooth
const d = renderAndStat('saw @600 Hz');

// Pass gate: all variants produced sound AND at least two variants
// differ from each other (params actually change the audio).
const allPlayed = a.peak > 0.01 && b.peak > 0.01 && c.peak > 0.01 && d.peak > 0.01;
const differs = Math.abs(a.rms - b.rms) > 0.005 || Math.abs(a.rms - c.rms) > 0.005 || Math.abs(c.rms - d.rms) > 0.005;

console.log('\n[smoke] all variants played:', allPlayed);
console.log('[smoke] rms differs across variants:', differs);

// Reset state for the final dump.
const peak = d.peak;
const rms = d.rms;

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
if (allPlayed && differs && rms > 0.001 && peak > 0.01) {
  console.log('[smoke] PASS — all variants audible and params change the audio');
  process.exit(0);
} else {
  console.log('[smoke] FAIL — allPlayed=' + allPlayed + ' differs=' + differs);
  process.exit(1);
}

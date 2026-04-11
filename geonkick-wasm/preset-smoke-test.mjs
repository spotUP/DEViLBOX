#!/usr/bin/env node
/**
 * Drives the WASM bridge directly (no AudioWorklet) to verify a real
 * .gkick preset loads cleanly through the same C functions the
 * GeonkickPresetLoader.ts will call. We can't import the TS loader from
 * Node, so this duplicates the field/setter mapping enough to validate
 * that bridge accepts every key path the loader emits.
 *
 * Pass criteria: the preset's audio differs from the default kick AND
 * the rendered output is non-silent.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', 'public', 'geonkick');

// CLI: optional path to a .gkick file
const presetPath = process.argv[2] ||
  '/tmp/gkick-extract/UnfaTutorial/808.gkick';

if (!fs.existsSync(presetPath)) {
  console.error('[preset] file not found:', presetPath);
  process.exit(2);
}
const preset = JSON.parse(fs.readFileSync(presetPath, 'utf8'));
console.log('[preset] loaded:', presetPath);

// Boot the WASM module.
const wasmBinary = fs.readFileSync(path.join(PUBLIC, 'Geonkick.wasm'));
const jsCode = fs.readFileSync(path.join(PUBLIC, 'Geonkick.js'), 'utf8');
const factory = new Function(jsCode + '\nreturn createGeonkickModule;')();
const Module = await factory({ wasmBinary });

const SAMPLE_RATE = 48000;
const N = SAMPLE_RATE * 2;

// Cwrap the bridge surface (mirrors what the worklet message handler does).
const c = (n, r, a) => Module.cwrap(n, r, a);
const num = 'number';
const gk = {
  create:           c('gk_wasm_create',                num, [num]),
  destroy:          c('gk_wasm_destroy',               null, [num]),
  keyPressed:       c('gk_wasm_key_pressed',           null, [num, num, num, num]),
  renderMono:       c('gk_wasm_render_mono',           null, [num, num, num]),
  setLength:        c('gk_wasm_set_length',            null, [num, num]),
  setLimiter:       c('gk_wasm_set_limiter',           null, [num, num]),
  setFilterEnabled: c('gk_wasm_set_filter_enabled',    null, [num, num]),
  setFilterCutoff:  c('gk_wasm_set_filter_cutoff',     null, [num, num]),
  setFilterFactor:  c('gk_wasm_set_filter_factor',     null, [num, num]),
  setFilterType:    c('gk_wasm_set_filter_type',       null, [num, num]),
  setDistEnabled:   c('gk_wasm_set_distortion_enabled', null, [num, num]),
  setDistDrive:     c('gk_wasm_set_distortion_drive',  null, [num, num]),
  setDistVolume:    c('gk_wasm_set_distortion_volume', null, [num, num]),
  enableOsc:        c('gk_wasm_enable_osc',            null, [num, num, num]),
  setOscAmplitude:  c('gk_wasm_set_osc_amplitude',     null, [num, num, num]),
  setOscFrequency:  c('gk_wasm_set_osc_frequency',     null, [num, num, num]),
  setOscFunction:   c('gk_wasm_set_osc_function',      null, [num, num, num]),
  setKickEnvelope:  c('gk_wasm_set_kick_envelope',     null, [num, num, num, num]),
  setOscEnvelope:   c('gk_wasm_set_osc_envelope',      null, [num, num, num, num, num]),
  enableGroup:      c('gk_wasm_enable_group',          null, [num, num, num]),
};

const handle = gk.create(SAMPLE_RATE);
if (!handle) throw new Error('gk_wasm_create failed');

const outPtr = Module._malloc(N * 4);
const outView = new Float32Array(Module.HEAPF32.buffer, outPtr, N);

function rms() {
  gk.keyPressed(handle, 1, 69, 127);
  gk.renderMono(handle, outPtr, N);
  let sumSq = 0;
  for (let i = 0; i < N; i++) sumSq += outView[i] * outView[i];
  return Math.sqrt(sumSq / N);
}

const baselineRms = rms();
console.log('[preset] default kick rms:', baselineRms.toFixed(4));

// ── Apply preset (mirrors GeonkickPresetLoader.ts) ─────────────────────
function uploadPoints(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const filtered = arr.filter((p) => Array.isArray(p) && p.length >= 2);
  if (filtered.length === 0) return null;
  const ptr = Module._malloc(filtered.length * 3 * 4);
  const view = new Float32Array(Module.HEAPF32.buffer, ptr, filtered.length * 3);
  for (let i = 0; i < filtered.length; i++) {
    view[i * 3 + 0] = filtered[i][0];
    view[i * 3 + 1] = filtered[i][1];
    view[i * 3 + 2] = 0;
  }
  return { ptr, count: filtered.length };
}

gk.enableGroup(handle, 0, 1);
gk.enableGroup(handle, 1, 1);
gk.enableGroup(handle, 2, 1);

if (preset.kick) {
  const k = preset.kick;
  if (k.ampl_env) {
    if (typeof k.ampl_env.length === 'number') gk.setLength(handle, k.ampl_env.length / 1000);
    const p = uploadPoints(k.ampl_env.points);
    if (p) { gk.setKickEnvelope(handle, 0, p.ptr, p.count); Module._free(p.ptr); }
  }
  if (typeof k.limiter === 'number') gk.setLimiter(handle, k.limiter);
  if (k.filter) {
    if (typeof k.filter.enabled === 'boolean') gk.setFilterEnabled(handle, k.filter.enabled ? 1 : 0);
    if (typeof k.filter.type === 'number') gk.setFilterType(handle, k.filter.type);
    if (typeof k.filter.cutoff === 'number') gk.setFilterCutoff(handle, k.filter.cutoff);
    if (typeof k.filter.factor === 'number') gk.setFilterFactor(handle, k.filter.factor);
    const p = uploadPoints(k.filter.cutoff_env);
    if (p) { gk.setKickEnvelope(handle, 2, p.ptr, p.count); Module._free(p.ptr); }
  }
  if (k.distortion) {
    if (typeof k.distortion.enabled === 'boolean') gk.setDistEnabled(handle, k.distortion.enabled ? 1 : 0);
    if (typeof k.distortion.drive === 'number') gk.setDistDrive(handle, k.distortion.drive);
    if (typeof k.distortion.volume === 'number') gk.setDistVolume(handle, k.distortion.volume);
  }
}

for (let i = 0; i < 9; i++) {
  const osc = preset['osc' + i];
  if (!osc) continue;
  if (typeof osc.enabled === 'boolean') gk.enableOsc(handle, i, osc.enabled ? 1 : 0);
  if (typeof osc.function === 'number') gk.setOscFunction(handle, i, osc.function);
  if (osc.ampl_env) {
    if (typeof osc.ampl_env.amplitude === 'number') gk.setOscAmplitude(handle, i, osc.ampl_env.amplitude);
    const p = uploadPoints(osc.ampl_env.points);
    if (p) { gk.setOscEnvelope(handle, i, 0, p.ptr, p.count); Module._free(p.ptr); }
  }
  if (osc.freq_env) {
    if (typeof osc.freq_env.amplitude === 'number') gk.setOscFrequency(handle, i, osc.freq_env.amplitude);
    const p = uploadPoints(osc.freq_env.points);
    if (p) { gk.setOscEnvelope(handle, i, 1, p.ptr, p.count); Module._free(p.ptr); }
  }
  if (osc.pitchshift_env) {
    const p = uploadPoints(osc.pitchshift_env.points);
    if (p) { gk.setOscEnvelope(handle, i, 3, p.ptr, p.count); Module._free(p.ptr); }
  }
}

const presetRms = rms();
console.log('[preset] after loading "' + (preset.kick?.name ?? '?') + '" rms:', presetRms.toFixed(4));
console.log('[preset] differs from default by', Math.abs(presetRms - baselineRms).toFixed(4));

const audible = presetRms > 0.001;
const differs = Math.abs(presetRms - baselineRms) > 0.005;

Module._free(outPtr);
gk.destroy(handle);

if (audible && differs) {
  console.log('[preset] PASS — preset audibly altered the kick');
  process.exit(0);
} else {
  console.log('[preset] FAIL — audible=' + audible + ' differs=' + differs);
  process.exit(1);
}

#!/usr/bin/env node
/**
 * test-spring-reverb-node.mjs — Isolated spring reverb WASM test (no browser)
 *
 * Loads the Aelapse WASM directly in Node.js, feeds white noise through
 * the spring reverb DSP, and measures output levels with different presets.
 * Tests the mute/unmute mechanism by zeroing input buffers.
 *
 * Usage: node test-spring-reverb-node.mjs
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE_RATE = 48000;
const BLOCK_SIZE = 128;

// Param IDs (from AelapseEffect.ts)
const P = {
  DELAY_ACTIVE: 0, DELAY_DRYWET: 1,
  SPRINGS_ACTIVE: 9, SPRINGS_DRYWET: 10,
  SPRINGS_LENGTH: 12, SPRINGS_DECAY: 13, SPRINGS_DAMP: 14,
  SPRINGS_TONE: 16, SPRINGS_SCATTER: 17, SPRINGS_CHAOS: 18,
};

const PRESETS = {
  tubby:        { length: 0.35, damp: 0.55, chaos: 0.20, scatter: 0.60, tone: 0.55, wet: 0.60 },
  madProfessor: { length: 0.55, damp: 0.45, chaos: 0.10, scatter: 0.55, tone: 0.65, wet: 0.68 },
  scientist:    { length: 0.55, damp: 0.25, chaos: 0.40, scatter: 0.40, tone: 0.70, wet: 0.40 },
  perry:        { length: 0.65, damp: 0.10, chaos: 0.85, scatter: 0.85, tone: 0.35, wet: 0.75 },
};

const DEFAULT = { length: 0.50, damp: 0.30, chaos: 0.10, scatter: 0.50, tone: 0.50, wet: 0.50 };

// ── Helpers ──────────────────────────────────────────────────────────────────

function rms(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}
function peak(buf) {
  let m = 0;
  for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > m) m = a; }
  return m;
}
function dB(v) { return v > 1e-10 ? (20 * Math.log10(v)).toFixed(1) : '-Inf'; }

function makeNoise(n, amp = 0.3) {
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) buf[i] = (Math.random() * 2 - 1) * amp;
  return buf;
}

// ── Load WASM ────────────────────────────────────────────────────────────────

async function loadModule() {
  const wasmPath = join(__dirname, 'public/aelapse/Aelapse.wasm');
  const jsPath = join(__dirname, 'public/aelapse/Aelapse.js');

  const wasmBinary = readFileSync(wasmPath);
  const jsCode = readFileSync(jsPath, 'utf-8');

  // Evaluate the Emscripten factory
  const wrappedCode = jsCode + '; return createAelapseModule;';
  const createModule = new Function(wrappedCode)();

  // Intercept WebAssembly.instantiate to capture WASM memory
  // (same pattern as Aelapse.worklet.js — HEAPF32 isn't exported)
  let capturedMemory = null;
  const origInstantiate = WebAssembly.instantiate;
  WebAssembly.instantiate = async function(...args) {
    const result = await origInstantiate.apply(this, args);
    const instance = result.instance || result;
    if (instance.exports) {
      for (const value of Object.values(instance.exports)) {
        if (value instanceof WebAssembly.Memory) {
          capturedMemory = value;
          break;
        }
      }
    }
    return result;
  };

  let Module;
  try {
    Module = await createModule({ wasmBinary });
  } finally {
    WebAssembly.instantiate = origInstantiate;
  }

  if (capturedMemory) Module.wasmMemory = capturedMemory;
  console.log('WASM loaded ✓');
  console.log(`  Memory: ${capturedMemory ? 'captured' : 'NOT FOUND'}`);
  console.log('');
  return Module;
}

// ── DSP wrapper ──────────────────────────────────────────────────────────────

class SpringTest {
  constructor(Module) {
    this.M = Module;
    this.effect = new Module.AelapseEffect();
    this.effect.initialize(SAMPLE_RATE);

    const bytes = BLOCK_SIZE * 4;
    this.inLPtr  = Module._malloc(bytes);
    this.inRPtr  = Module._malloc(bytes);
    this.outLPtr = Module._malloc(bytes);
    this.outRPtr = Module._malloc(bytes);

    const heapBuffer = Module.HEAPF32
      ? Module.HEAPF32.buffer
      : (Module.wasmMemory ? Module.wasmMemory.buffer : null);
    if (!heapBuffer) throw new Error('Cannot access WASM memory buffer');

    this.inL  = new Float32Array(heapBuffer, this.inLPtr, BLOCK_SIZE);
    this.inR  = new Float32Array(heapBuffer, this.inRPtr, BLOCK_SIZE);
    this.outL = new Float32Array(heapBuffer, this.outLPtr, BLOCK_SIZE);
    this.outR = new Float32Array(heapBuffer, this.outRPtr, BLOCK_SIZE);

    // Disable delay, enable springs
    this.effect.setParameter(P.DELAY_ACTIVE, 0);
    this.effect.setParameter(P.SPRINGS_ACTIVE, 1);
    // Track last values for ramped writes
    this._last = new Map();
  }

  setParam(id, val) {
    this.effect.setParameter(id, val);
    this._last.set(id, val);
  }

  /** Apply preset params with optional per-param smoothing (simulates worklet ramp) */
  applyPreset(p, smooth = false) {
    const params = [
      [P.SPRINGS_LENGTH,  p.length],
      [P.SPRINGS_DAMP,    p.damp],
      [P.SPRINGS_CHAOS,   p.chaos],
      [P.SPRINGS_SCATTER, p.scatter],
      [P.SPRINGS_TONE,    p.tone],
      [P.SPRINGS_DRYWET,  p.wet],
    ];
    if (!smooth) {
      for (const [id, val] of params) this.setParam(id, val);
    } else {
      // Ramp over 16 blocks like the worklet does
      const ramps = params.map(([id, target]) => ({
        id, start: this._last.get(id) ?? target, target, step: 0,
      }));
      for (let block = 0; block < 16; block++) {
        for (const r of ramps) {
          r.step++;
          const t = r.step / 16;
          const v = r.start + (r.target - r.start) * t;
          this.effect.setParameter(r.id, v);
        }
        // Process a silent block to let ramps settle
        this.inL.fill(0);
        this.inR.fill(0);
        this.effect.process(this.inLPtr, this.inRPtr, this.outLPtr, this.outRPtr, BLOCK_SIZE);
      }
      for (const [id, val] of params) this._last.set(id, val);
    }
  }

  /** Process N blocks of noise input, return per-block RMS/peak measurements */
  processNoise(blocks, inputAmp = 0.3) {
    const results = [];
    for (let b = 0; b < blocks; b++) {
      const noise = makeNoise(BLOCK_SIZE, inputAmp);
      this.inL.set(noise);
      this.inR.set(noise);
      this.effect.process(this.inLPtr, this.inRPtr, this.outLPtr, this.outRPtr, BLOCK_SIZE);
      // Refresh views if memory grew
      const curBuf = this.M.wasmMemory ? this.M.wasmMemory.buffer
                   : (this.M.HEAPF32 ? this.M.HEAPF32.buffer : null);
      if (curBuf && this.outL.buffer !== curBuf) {
        this.outL = new Float32Array(curBuf, this.outLPtr, BLOCK_SIZE);
        this.outR = new Float32Array(curBuf, this.outRPtr, BLOCK_SIZE);
        this.inL  = new Float32Array(curBuf, this.inLPtr, BLOCK_SIZE);
        this.inR  = new Float32Array(curBuf, this.inRPtr, BLOCK_SIZE);
      }
      const combined = new Float32Array(BLOCK_SIZE * 2);
      combined.set(this.outL);
      combined.set(this.outR, BLOCK_SIZE);
      results.push({ block: b, rms: rms(combined), peak: peak(combined) });
    }
    return results;
  }

  /** Process N blocks of silence */
  processSilence(blocks) {
    const results = [];
    for (let b = 0; b < blocks; b++) {
      this.inL.fill(0);
      this.inR.fill(0);
      this.effect.process(this.inLPtr, this.inRPtr, this.outLPtr, this.outRPtr, BLOCK_SIZE);
      if (this.outL.buffer !== (this.M.wasmMemory?.buffer ?? this.M.HEAPF32?.buffer)) {
        const b = this.M.wasmMemory?.buffer ?? this.M.HEAPF32?.buffer;
        this.outL = new Float32Array(b, this.outLPtr, BLOCK_SIZE);
        this.outR = new Float32Array(b, this.outRPtr, BLOCK_SIZE);
      }
      const combined = new Float32Array(BLOCK_SIZE * 2);
      combined.set(this.outL);
      combined.set(this.outR, BLOCK_SIZE);
      results.push({ block: b, rms: rms(combined), peak: peak(combined) });
    }
    return results;
  }

  dispose() {
    this.effect.delete();
    this.M._free(this.inLPtr);
    this.M._free(this.inRPtr);
    this.M._free(this.outLPtr);
    this.M._free(this.outRPtr);
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

function printMeasurements(label, results, everyN = 1) {
  console.log(`\n  ${label}:`);
  console.log('  Block    Time(ms)  RMS          Peak         RMS(dB)  Peak(dB)');
  console.log('  ──────── ──────── ──────────── ──────────── ──────── ────────');
  for (let i = 0; i < results.length; i += everyN) {
    const r = results[i];
    const ms = ((r.block + 1) * BLOCK_SIZE / SAMPLE_RATE * 1000).toFixed(0);
    console.log(`  ${String(r.block).padStart(6)}   ${ms.padStart(6)}   ${r.rms.toFixed(6).padStart(10)}   ${r.peak.toFixed(6).padStart(10)}   ${dB(r.rms).padStart(6)}   ${dB(r.peak).padStart(6)}`);
  }
}

function blocksForMs(ms) { return Math.ceil(ms * SAMPLE_RATE / 1000 / BLOCK_SIZE); }

async function main() {
  const Module = await loadModule();
  let totalPass = 0, totalFail = 0;

  // ── Test 1: Each preset — raw switch (no smoothing, no mute) ──────────
  console.log('═'.repeat(70));
  console.log('TEST 1: RAW PRESET SWITCH (no smoothing, no mute)');
  console.log('  Measures the transient boom when params change abruptly.');
  console.log('═'.repeat(70));

  for (const [name, preset] of Object.entries(PRESETS)) {
    const spring = new SpringTest(Module);
    spring.applyPreset(DEFAULT, false);

    // Feed noise for 500ms to fill the delay lines
    spring.processNoise(blocksForMs(500));

    // Abruptly switch preset
    spring.applyPreset(preset, false);

    // Measure 2 seconds post-switch
    const results = spring.processNoise(blocksForMs(2000));
    const maxPeak = Math.max(...results.map(r => r.peak));
    const steadyRms = results[results.length - 1].rms;

    printMeasurements(`${name} — raw switch`, results, blocksForMs(200));

    console.log(`\n  ${name}: peak=${maxPeak.toFixed(2)} (${dB(maxPeak)}dB) steady=${steadyRms.toFixed(6)} (${dB(steadyRms)}dB)`);
    if (maxPeak > 2.0) {
      console.log(`  ❌ BOOM: peak ${maxPeak.toFixed(2)} would kill sidechain compressor`);
      totalFail++;
    } else {
      console.log(`  ✅ Peak ${maxPeak.toFixed(2)} — manageable`);
      totalPass++;
    }
    spring.dispose();
  }

  // ── Test 2: Smoothed switch (worklet ramp, no input mute) ─────────────
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 2: SMOOTHED PRESET SWITCH (43ms ramp, no input mute)');
  console.log('  Simulates the worklet per-param smoothing.');
  console.log('═'.repeat(70));

  for (const [name, preset] of Object.entries(PRESETS)) {
    const spring = new SpringTest(Module);
    spring.applyPreset(DEFAULT, false);
    spring.processNoise(blocksForMs(500));

    // Smoothed switch (16-block ramp during silence, then noise)
    spring.applyPreset(preset, true);
    const results = spring.processNoise(blocksForMs(2000));
    const maxPeak = Math.max(...results.map(r => r.peak));
    const steadyRms = results[results.length - 1].rms;

    printMeasurements(`${name} — smoothed`, results, blocksForMs(200));

    console.log(`\n  ${name}: peak=${maxPeak.toFixed(2)} (${dB(maxPeak)}dB) steady=${steadyRms.toFixed(6)} (${dB(steadyRms)}dB)`);
    if (maxPeak > 2.0) {
      console.log(`  ❌ STILL BOOMS even with smoothing: peak ${maxPeak.toFixed(2)}`);
      totalFail++;
    } else {
      console.log(`  ✅ Peak ${maxPeak.toFixed(2)} — smoothing works`);
      totalPass++;
    }
    spring.dispose();
  }

  // ── Test 3: Full mute approach (input+output mute during switch) ──────
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 3: MUTED SWITCH (input silence + smoothed ramp + 600ms drain)');
  console.log('  Simulates the current DubBus approach.');
  console.log('═'.repeat(70));

  for (const [name, preset] of Object.entries(PRESETS)) {
    const spring = new SpringTest(Module);
    spring.applyPreset(DEFAULT, false);
    spring.processNoise(blocksForMs(500));

    // Mute phase: feed silence while ramping params
    spring.applyPreset(preset, true);  // smoothed ramp (43ms of silence)
    // Continue feeding silence for remaining 557ms of the 600ms mute window
    const drainResults = spring.processSilence(blocksForMs(557));

    // Unmute: feed noise
    const postResults = spring.processNoise(blocksForMs(3000));
    const maxPeak = Math.max(...postResults.map(r => r.peak));
    const steadyRms = postResults[postResults.length - 1].rms;
    const avgRms = postResults.slice(-blocksForMs(1000)).reduce((s, r) => s + r.rms, 0)
                   / blocksForMs(1000);

    // Show drain decay
    printMeasurements(`${name} — drain (silence)`, drainResults, blocksForMs(100));
    // Show post-unmute recovery
    printMeasurements(`${name} — post-unmute (noise)`, postResults, blocksForMs(200));

    console.log(`\n  ${name}:`);
    console.log(`    Post-unmute peak:  ${maxPeak.toFixed(4)} (${dB(maxPeak)}dB)`);
    console.log(`    Steady-state RMS:  ${steadyRms.toFixed(6)} (${dB(steadyRms)}dB)`);
    console.log(`    Last-1s avg RMS:   ${avgRms.toFixed(6)} (${dB(avgRms)}dB)`);

    if (maxPeak > 1.0) {
      console.log(`    ⚠️  Post-unmute peak > 1.0 — compressor will still duck`);
    }
    if (avgRms > 0.01) {
      console.log(`    ✅ Reverb alive: avg ${dB(avgRms)}dB`, );
      totalPass++;
    } else {
      console.log(`    ❌ Reverb too quiet or dead: avg ${dB(avgRms)}dB`);
      totalFail++;
    }
    spring.dispose();
  }

  // ── Test 4: Steady-state output level per preset ──────────────────────
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 4: STEADY-STATE REVERB LEVEL (2s warmup, measure 2s)');
  console.log('  No preset switching — just set params and measure output.');
  console.log('═'.repeat(70));

  for (const [name, preset] of Object.entries(PRESETS)) {
    const spring = new SpringTest(Module);
    spring.applyPreset(preset, false);

    // 2 seconds of warmup
    spring.processNoise(blocksForMs(2000));

    // Measure 2 seconds
    const results = spring.processNoise(blocksForMs(2000));
    const avgRms = results.reduce((s, r) => s + r.rms, 0) / results.length;
    const avgPeak = results.reduce((s, r) => s + r.peak, 0) / results.length;

    console.log(`  ${name.padEnd(15)} avgRMS=${avgRms.toFixed(6)} (${dB(avgRms).padStart(6)}dB)  avgPeak=${avgPeak.toFixed(6)} (${dB(avgPeak).padStart(6)}dB)  ${avgRms > 0.01 ? '✅' : '❌'}`);
    if (avgRms > 0.01) totalPass++; else totalFail++;
    spring.dispose();
  }

  // ── Test 5: Sidechain compressor simulation ───────────────────────────
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 5: SIDECHAIN COMPRESSOR SIMULATION');
  console.log('  After muted switch, would the sidechain compressor kill the reverb?');
  console.log('  threshold=-15dB (tubby sidechain=0.3), ratio=6, release=180ms');
  console.log('═'.repeat(70));

  for (const [name, preset] of Object.entries(PRESETS)) {
    const sidechain = name === 'tubby' ? 0.30 : name === 'madProfessor' ? 0.50 : name === 'scientist' ? 0.70 : 0.40;
    const threshold = -6 - sidechain * 30;  // dB
    const threshLin = Math.pow(10, threshold / 20);
    const ratio = 6;

    const spring = new SpringTest(Module);
    spring.applyPreset(DEFAULT, false);
    spring.processNoise(blocksForMs(500));
    spring.applyPreset(preset, true);
    spring.processSilence(blocksForMs(557));
    const results = spring.processNoise(blocksForMs(2000));

    // Simulate compression
    let aboveCount = 0, totalBlocks = results.length;
    const compressed = results.map(r => {
      const inputDb = 20 * Math.log10(Math.max(r.rms, 1e-10));
      if (inputDb > threshold) {
        aboveCount++;
        const overDb = inputDb - threshold;
        const gainReduction = overDb * (1 - 1 / ratio);
        const outputDb = inputDb - gainReduction;
        return { ...r, compRms: Math.pow(10, outputDb / 20), gainReduction };
      }
      return { ...r, compRms: r.rms, gainReduction: 0 };
    });

    const avgCompRms = compressed.reduce((s, r) => s + r.compRms, 0) / compressed.length;
    const avgGR = compressed.reduce((s, r) => s + r.gainReduction, 0) / compressed.length;
    const returnGain = name === 'tubby' ? 0.75 : name === 'madProfessor' ? 0.70 : 0.65;
    const finalLevel = avgCompRms * returnGain;

    console.log(`\n  ${name}:`);
    console.log(`    Sidechain: ${sidechain} → threshold=${threshold.toFixed(0)}dB (${threshLin.toFixed(4)} lin)`);
    console.log(`    Blocks above threshold: ${aboveCount}/${totalBlocks} (${(aboveCount/totalBlocks*100).toFixed(0)}%)`);
    console.log(`    Avg gain reduction: ${avgGR.toFixed(1)}dB`);
    console.log(`    Avg post-comp RMS: ${avgCompRms.toFixed(6)} (${dB(avgCompRms)}dB)`);
    console.log(`    After return gain (${returnGain}): ${finalLevel.toFixed(6)} (${dB(finalLevel)}dB)`);
    if (finalLevel > 0.02) {
      console.log(`    ✅ Should be audible`);
      totalPass++;
    } else {
      console.log(`    ❌ Too quiet — reverb will be inaudible in the mix`);
      totalFail++;
    }
    spring.dispose();
  }

  // ── Summary ────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(70));
  console.log(`FINAL: ${totalPass} pass, ${totalFail} fail`);
  console.log('═'.repeat(70));
  process.exit(totalFail > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

/**
 * audio-oracle.ts — SunTronic Phase 4 Gate A: per-voice UADE audio oracle.
 *
 * Renders a SunTronic module through the SHIPPED clean UADE WASM build and pulls
 * the four Paula channels' mono float PCM out via `uade_wasm_read_channel_samples`
 * (captured per `uade_wasm_render()` call). This is the reference every Phase-4
 * waveform gate measures against: a native single-voice render vs UADE `ch_v`.
 *
 * No instrumented WASM, no submodule edits — reuses tools/uade-audit/uadeRenderCore
 * (public/uade sha1 cc3a153/520744b). Read-only oracle.
 *
 * Paula stereo law (from entry.c): channels 0+3 → left, 1+2 → right.
 */

import { writeFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule, type UADEModule } from '../uade-audit/uadeRenderCore';
import {
  CORPUS_DIR,
  loadInstrCompanions,
  addCompanions,
  rms,
} from './suntronicLib';
import { readFileSync } from 'fs';

/** UADE ABI members not declared in the render-core interface but present in the
 * shipped build (verified: grep public/uade/UADE.js). */
interface PerVoiceModule extends UADEModule {
  _uade_wasm_read_channel_samples(
    ch0: number, ch1: number, ch2: number, ch3: number, maxFrames: number,
  ): number;
  _uade_wasm_mute_channels(mask: number): void;
  _uade_wasm_add_extra_file(namePtr: number, dataPtr: number, len: number): number;
}

export interface PerVoiceRender {
  /** Mono float PCM per Paula voice (index 0..3). */
  ch: [Float32Array, Float32Array, Float32Array, Float32Array];
  sampleRate: number;
  frames: number;
}

const CHUNK = 4096;

/**
 * Render `name` (a corpus .src) through UADE with instr/ companions and return
 * the four Paula voices as separate mono float buffers.
 */
export async function renderUADEPerVoice(
  name: string,
  opts: { sampleRate?: number; seconds?: number; verbose?: boolean } = {},
): Promise<PerVoiceRender> {
  const sampleRate = opts.sampleRate ?? 44100;
  const seconds = opts.seconds ?? 10;
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));

  const mod = (await loadUADEModule(opts.verbose)) as PerVoiceModule;
  if (mod._uade_wasm_init(sampleRate) !== 0) throw new Error('uade init failed');
  addCompanions(mod, loadInstrCompanions());

  // Load
  const fptr = mod._malloc(data.byteLength);
  mod.HEAPU8.set(data, fptr);
  const hintLen = name.length * 4 + 1;
  const hptr = mod._malloc(hintLen);
  mod.stringToUTF8(name, hptr, hintLen);
  mod._uade_wasm_stop();
  mod._uade_wasm_set_looping(0);
  mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(fptr, data.byteLength, hptr) !== 0) throw new Error('uade load failed');
  mod._free(fptr);
  mod._free(hptr);

  const ptrL = mod._malloc(CHUNK * 4);
  const ptrR = mod._malloc(CHUNK * 4);
  const cptr = [0, 1, 2, 3].map(() => mod._malloc(CHUNK * 4));
  const acc: number[][] = [[], [], [], []];
  const maxFrames = sampleRate * seconds;
  let frames = 0;

  while (frames < maxFrames) {
    const chunk = Math.min(CHUNK, maxFrames - frames);
    const ret = mod._uade_wasm_render(ptrL, ptrR, chunk);
    if (ret <= 0) break;
    const got = mod._uade_wasm_read_channel_samples(cptr[0], cptr[1], cptr[2], cptr[3], chunk);
    const heap = new Float32Array(mod.HEAPU8.buffer);
    const n = Math.min(got > 0 ? got : chunk, chunk);
    for (let v = 0; v < 4; v++) {
      const base = cptr[v] >> 2;
      for (let i = 0; i < n; i++) acc[v].push(heap[base + i]);
    }
    frames += chunk;
  }

  mod._free(ptrL); mod._free(ptrR); cptr.forEach((p) => mod._free(p));
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }

  return {
    ch: acc.map((a) => new Float32Array(a)) as PerVoiceRender['ch'],
    sampleRate,
    frames,
  };
}

/** Peak absolute sample. */
export function peak(s: Float32Array): number {
  let m = 0;
  for (let i = 0; i < s.length; i++) { const a = Math.abs(s[i]); if (a > m) m = a; }
  return m;
}

/**
 * Zero-lag normalized cross-correlation of two equal-length signals over the
 * overlapping prefix. 1 = identical shape, 0 = uncorrelated, <0 = anti-phase.
 * (A dedicated best-lag search belongs to the per-instrument gate; the whole-song
 * mix is phase-aligned by construction.)
 */
export function normXcorr(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let sa = 0, sb = 0, sab = 0;
  for (let i = 0; i < n; i++) { sa += a[i] * a[i]; sb += b[i] * b[i]; sab += a[i] * b[i]; }
  const d = Math.sqrt(sa * sb);
  return d > 0 ? sab / d : 0;
}

/** RMS of the sample-by-sample difference over the overlapping prefix. */
export function rmsDiff(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let acc = 0;
  for (let i = 0; i < n; i++) { const d = a[i] - b[i]; acc += d * d; }
  return Math.sqrt(acc / n);
}

/** Minimal 16-bit mono WAV writer for listening to an oracle voice. */
export function writeMonoWav(path: string, samples: Float32Array, sampleRate = 44100): void {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE((s < 0 ? s * 0x8000 : s * 0x7fff) | 0, 44 + i * 2);
  }
  writeFileSync(path, buf);
}

// ── CLI: characterize the oracle for both test songs ──────────────────────────
async function main(): Promise<void> {
  const outDir = process.env.SCRATCH ?? '/tmp';
  for (const name of ['gliders.src', 'ballblaser.src']) {
    const r = await renderUADEPerVoice(name, { seconds: 10 });
    console.log(`\n=== ${name} — UADE per-voice oracle (${r.frames} frames @ ${r.sampleRate}) ===`);
    for (let v = 0; v < 4; v++) {
      const s = r.ch[v];
      console.log(`  voice ${v}: rms=${rms(s).toFixed(4)} peak=${peak(s).toFixed(4)} n=${s.length}`);
      const wav = join(outDir, `oracle-${name.replace('.src', '')}-v${v}.wav`);
      writeMonoWav(wav, s, r.sampleRate);
    }
    console.log(`  wavs -> ${outDir}/oracle-${name.replace('.src', '')}-v{0..3}.wav`);
  }
}

// Run only when invoked directly (not when imported by a test/gate).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

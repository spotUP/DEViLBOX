/**
 * render-devilbox.ts — Render UADE modules to WAV using DEViLBOX's UADE WASM
 *
 * Drives the UADE WASM module headlessly (no AudioWorklet, no browser) to produce WAV
 * files that can be compared against uade123 reference renders. The headless WASM load
 * + render loop lives in ./uadeRenderCore.ts (shared with the MaxTrax playback
 * regression test); this file adds WAV output and the CLI/batch driver.
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
import { join, basename } from 'path';
import {
  loadUADEModule,
  renderToSamples,
  PROJECT_ROOT,
  type UADEModule,
} from './uadeRenderCore';

// ── Constants ─────────────────────────────────────────────────────────────────

const SAMPLE_RATE = 44100;
const RENDER_SECONDS = 30;
const TEST_FORMATS_DIR = join(PROJECT_ROOT, '.test-formats');
const OUTPUT_DIR = join(PROJECT_ROOT, 'test-data/uade-devilbox');

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

  let result;
  try {
    result = await renderToSamples(mod, data, filename, {
      sampleRate: SAMPLE_RATE,
      seconds: RENDER_SECONDS,
    });
  } catch (e) {
    return { ok: false, frames: 0, error: (e as Error).message };
  }

  if (result.samples.length === 0) {
    return { ok: false, frames: 0, error: 'No audio rendered (silence or immediate stop)' };
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeWav(outputPath, result.samples, result.sampleRate);
  return { ok: true, frames: result.frames };
}

// ── CLI Entry Point ───────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const batchMode = args.includes('--batch');
  const force = args.includes('--force');
  const verbose = !!process.env.UADE_VERBOSE;
  const files = args.filter(a => !a.startsWith('--'));

  console.log('[uade-render] Loading UADE WASM module...');
  const mod = await loadUADEModule(verbose);

  const initRet = mod._uade_wasm_init(SAMPLE_RATE);
  if (initRet !== 0) {
    console.error(`[uade-render] _uade_wasm_init failed (ret=${initRet})`);
    process.exit(1);
  }
  console.log('[uade-render] UADE engine initialized');

  mkdirSync(OUTPUT_DIR, { recursive: true });

  if (batchMode) {
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

      // Reload WASM per file — some eagleplayers call unguarded exit(1) which corrupts
      // Emscripten module state; a fresh instance guarantees clean IPC state per file.
      let fileMod: UADEModule;
      try {
        fileMod = await loadUADEModule(verbose);
        const ret = fileMod._uade_wasm_init(SAMPLE_RATE);
        if (ret !== 0) throw new Error(`_uade_wasm_init failed (ret=${ret})`);
      } catch (e) {
        console.log(`[render] ${name}... FAIL: module load: ${(e as Error).message}`);
        fail++;
        continue;
      }

      process.stdout.write(`[render] ${name}... `);
      const result = await renderFile(fileMod, inputPath, outputPath);
      try { fileMod._uade_wasm_cleanup(); } catch { /* ignore */ }

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
    let inputPath = files[0];
    if (!existsSync(inputPath)) inputPath = join(TEST_FORMATS_DIR, files[0]);
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

  if (!batchMode) {
    try { mod._uade_wasm_cleanup(); } catch { /* ignore cleanup errors */ }
  }
}

main().catch(err => {
  console.error('[uade-render] Fatal:', err);
  process.exit(1);
});

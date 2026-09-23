/**
 * suntronicLib.ts — shared helpers for the SunTronic V1.3 RE probes (Phase 1).
 *
 * Contains:
 *  - parseHunks(): minimal AmigaOS hunk-executable walker (seed for the Phase 2
 *    parser — one implementation, later re-imported from src).
 *  - corpus listing for public/data/songs/formats/SUNTronicTunes/.
 *  - renderWithCompanions(): headless UADE render that injects the instr/*.x
 *    sidecars into MEMFS via _uade_wasm_add_extra_file (the same mechanism the
 *    app uses), without modifying tools/uade-audit/uadeRenderCore.ts.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import {
  addCompanions,
  loadUADEModule,
  renderToSamples,
  PROJECT_ROOT,
  type RenderResult,
} from '../uade-audit/uadeRenderCore';

export const CORPUS_DIR = join(
  PROJECT_ROOT,
  'public/data/songs/formats/SUNTronicTunes',
);
export const INSTR_DIR = join(CORPUS_DIR, 'instr');

// ── Hunk parsing ──────────────────────────────────────────────────────────
// Single source of truth is the Phase 2 codec in src (SunTronicV13.ts).
// Re-exported here so the Phase 1 probe scripts keep their imports.

export {
  parseHunks,
  u16BE,
  u32BE,
} from '../../src/lib/import/formats/SunTronicV13';
export type { HunkBlock, HunkFile } from '../../src/lib/import/formats/SunTronicV13';

// ── Corpus listing ────────────────────────────────────────────────────────

/** All module files in the corpus dir (excludes the instr/ directory). */
export function listCorpusModules(): string[] {
  return readdirSync(CORPUS_DIR)
    .filter((f) => {
      const p = join(CORPUS_DIR, f);
      return statSync(p).isFile();
    })
    .sort();
}

/** All instrument sidecars as companion entries named instr/<file>. */
export function loadInstrCompanions(): { name: string; data: Uint8Array }[] {
  return readdirSync(INSTR_DIR)
    .filter((f) => statSync(join(INSTR_DIR, f)).isFile())
    .map((f) => ({ name: `instr/${f}`, data: readFileSync(join(INSTR_DIR, f)) }));
}

// ── Render with companions ────────────────────────────────────────────────
// addCompanions lives in the render core now — one implementation of "put a
// file where the player can open it", shared with the corpus sweep. Re-exported
// so the 40-odd probe scripts keep their `from './suntronicLib'` import.

export { addCompanions } from '../uade-audit/uadeRenderCore';

/**
 * Render a module with instr/ companions injected. Fresh WASM instance per call
 * (same discipline as renderFileToSamples).
 */
export async function renderWithCompanions(
  data: Uint8Array,
  filename: string,
  companions: { name: string; data: Uint8Array }[],
  opts: { sampleRate: number; seconds: number; verbose?: boolean },
): Promise<RenderResult> {
  const mod = await loadUADEModule(opts.verbose);
  const initRet = mod._uade_wasm_init(opts.sampleRate);
  if (initRet !== 0) throw new Error(`_uade_wasm_init failed (ret=${initRet})`);
  try {
    addCompanions(mod, companions);
    return await renderToSamples(mod, data, filename, opts);
  } finally {
    try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
  }
}

export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let acc = 0;
  for (let i = 0; i < samples.length; i++) acc += samples[i] * samples[i];
  return Math.sqrt(acc / samples.length);
}

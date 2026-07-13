/**
 * p0-render.ts — Probe P0: render-oracle sanity for SunTronic V1.3 modules.
 *
 * Renders N corpus modules headless with the instr/*.x companions injected
 * into UADE's MEMFS. Success = nonzero RMS. Exits 0 iff >=2 modules render
 * with nonzero audio (plan exit criterion 1.6.1).
 *
 * Usage: npx tsx tools/suntronic-re/p0-render.ts [module ...]
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CORPUS_DIR,
  loadInstrCompanions,
  renderWithCompanions,
  rms,
} from './suntronicLib';

const DEFAULT_MODULES = ['mule.src', 'kompo.pc', 'analgestic2.src'];

async function main(): Promise<void> {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_MODULES;
  const companions = loadInstrCompanions();
  console.log(`[p0] ${companions.length} instr companions loaded`);

  let ok = 0;
  for (const name of names) {
    const data = readFileSync(join(CORPUS_DIR, name));
    try {
      const res = await renderWithCompanions(data, name, companions, {
        sampleRate: 44100,
        seconds: 4,
      });
      const level = rms(res.samples);
      const pass = res.frames > 0 && level > 1e-4;
      console.log(
        `[p0] ${name}: frames=${res.frames} rms=${level.toFixed(5)} ${pass ? 'OK' : 'SILENT/FAIL'}`,
      );
      if (pass) ok++;
    } catch (err) {
      console.log(`[p0] ${name}: ERROR ${(err as Error).message}`);
    }
  }
  console.log(`[p0] ${ok}/${names.length} modules render with nonzero audio`);
  process.exit(ok >= 2 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });

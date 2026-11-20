/**
 * NSF import editability (NSF-EDITABLE Item 4, furnace-fileops-wasm/src/nsfToFur.cpp): pitch that a
 * note holds as a fine offset is written as an E5xx effect instead of being baked into every
 * instrument's pitch macro, so notes with the same envelope share one instrument. Grid fit and the
 * converter's per-frame parity (which replays E5xx) must not drop. Pitch slides and vibrato are
 * fitted per note and written as 01xx/02xx and 04xy, with only the residual left in the macro. On 2A03 pulse and noise
 * the note's level is the volume column and a held duty is 12xx, so one instrument is one envelope shape at any level and
 * duty (Bionic Commando t7 64 -> 57). The driver has 5 envelope sets (thoughts/spot/2026-11-20-bionic-envelope-count.md);
 * the rest of the 57 were period-unit vibrato pitch macros; non-linear pitch mode got them to 21, and a delayed vibrato
 * written as effects (note row 04 + E4 00 + E3 03 triangle, start row 04xy + E4 04) to 19. The remaining one-sided
 * 4-frame vibrato needs rate 16 and stays in macros (thoughts/spot/2026-11-19-nsf-bionic-audit.md). Real songs outside
 * the repo: run only when present.
 */
import fs from 'node:fs';
import { describe, it, expect, beforeAll } from 'vitest';
import { installFurnaceFileOpsWasm } from '../../lib/import/__tests__/furnaceFileOpsWasmHarness';

const BIONIC = '/Users/spot/Downloads/NSFE/bioniccommando.nsfe';
const METROID = '/Users/spot/Downloads/Metroid (EMU).zophar/Metroid (1986-08)(Nintendo R&D1)(Nintendo).nsf';

type Case = { name: string; path: string; track: number; gridFit: number; maxIns: number; pitchFx: boolean };
const CASES: Case[] = [
  { name: 'Bionic Commando t7', path: BIONIC, track: 7, gridFit: 955, maxIns: 19, pitchFx: true },
  { name: 'Metroid t2', path: METROID, track: 2, gridFit: 950, maxIns: 11, pitchFx: true },
  { name: 'Metroid t3', path: METROID, track: 3, gridFit: 950, maxIns: 6, pitchFx: false },
].filter((c) => fs.existsSync(c.path));

beforeAll(() => { installFurnaceFileOpsWasm(); });

describe.skipIf(CASES.length === 0)('NSF import writes pitch as effects', { timeout: 300000 }, () => {
  for (const c of CASES) {
    it(`${c.name}: shared instruments, slides and vibrato as effects, grid and parity hold`, async () => {
      const { nsfToFurWasm, nsfLastStatsWasm, loadFurFileWasm, NSF_DEFAULT_FRAMES } = await import('../../lib/import/wasm/FurnaceFileOps');
      const fur = await nsfToFurWasm(new Uint8Array(fs.readFileSync(c.path)), c.track, NSF_DEFAULT_FRAMES);
      const st = await nsfLastStatsWasm();
      const sub = (await loadFurFileWasm(fur)).nativeData.subsongs[0];
      let e5 = 0, slide = 0, vib = 0, duty = 0, vol = 0;
      for (let pos = 0; pos < sub.ordersLen; pos++)
        sub.channels.forEach((ch, ci) => ch.patterns.get(sub.orders[ci][pos])?.rows.forEach((r) => {
          if (r.vol >= 0) vol++;
          r.effects.forEach((e) => {
            if (e.cmd === 0xe5) e5++;
            else if ((e.cmd === 0x01 || e.cmd === 0x02) && e.val) slide++;
            else if (e.cmd === 0x04 && e.val) vib++;
            else if (e.cmd === 0x12) duty++;
          });
        }));
      console.log(`${c.name}: gridFit ${st.gridFit}, parity ${st.parity}, instruments ${st.instruments}, E5xx cells ${e5}, 01/02 cells ${slide}, 04 cells ${vib}, 12xx cells ${duty}, volume cells ${vol}`);
      // slides and vibrato leave the pitch macros as 01xx/02xx and 04xy
      if (c.pitchFx) expect(slide + vib).toBeGreaterThan(0);
      expect(st.gridFit).toBeGreaterThanOrEqual(c.gridFit);
      expect(st.parity).toBeGreaterThanOrEqual(1000);
      expect(st.instruments).toBeLessThanOrEqual(c.maxIns);
    });
  }
});

/**
 * NSF import editability (NSF-EDITABLE Item 4, furnace-fileops-wasm/src/nsfToFur.cpp): pitch that a
 * note holds as a fine offset is written as an E5xx effect instead of being baked into every
 * instrument's pitch macro, so notes with the same envelope share one instrument. Grid fit and the
 * converter's per-frame parity (which replays E5xx) must not drop. Real songs outside the repo: run
 * only when present.
 */
import fs from 'node:fs';
import { describe, it, expect, beforeAll } from 'vitest';
import { installFurnaceFileOpsWasm } from '../../lib/import/__tests__/furnaceFileOpsWasmHarness';

const BIONIC = '/Users/spot/Downloads/NSFE/bioniccommando.nsfe';
const METROID = '/Users/spot/Downloads/Metroid (EMU).zophar/Metroid (1986-08)(Nintendo R&D1)(Nintendo).nsf';

type Case = { name: string; path: string; track: number; gridFit: number; maxIns: number };
const CASES: Case[] = [
  { name: 'Bionic Commando t7', path: BIONIC, track: 7, gridFit: 955, maxIns: 64 },
  { name: 'Metroid t2', path: METROID, track: 2, gridFit: 950, maxIns: 11 },
  { name: 'Metroid t3', path: METROID, track: 3, gridFit: 950, maxIns: 6 },
].filter((c) => fs.existsSync(c.path));

beforeAll(() => { installFurnaceFileOpsWasm(); });

describe('NSF import writes pitch as effects', { timeout: 300000 }, () => {
  for (const c of CASES) {
    it(`${c.name}: shared instruments, grid and parity hold`, async () => {
      const { nsfToFurWasm, nsfLastStatsWasm, loadFurFileWasm, NSF_DEFAULT_FRAMES } = await import('../../lib/import/wasm/FurnaceFileOps');
      const fur = await nsfToFurWasm(new Uint8Array(fs.readFileSync(c.path)), c.track, NSF_DEFAULT_FRAMES);
      const st = await nsfLastStatsWasm();
      const sub = (await loadFurFileWasm(fur)).nativeData.subsongs[0];
      let e5 = 0;
      for (let pos = 0; pos < sub.ordersLen; pos++)
        sub.channels.forEach((ch, ci) => ch.patterns.get(sub.orders[ci][pos])?.rows.forEach((r) =>
          r.effects.forEach((e) => { if (e.cmd === 0xe5) e5++; })));
      console.log(`${c.name}: gridFit ${st.gridFit}, parity ${st.parity}, instruments ${st.instruments}, E5xx cells ${e5}`);
      expect(st.gridFit).toBeGreaterThanOrEqual(c.gridFit);
      expect(st.parity).toBeGreaterThanOrEqual(1000);
      expect(st.instruments).toBeLessThanOrEqual(c.maxIns);
    });
  }
});

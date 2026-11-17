/** Wavetable .fuw / .dmw: read and written by Furnace's own C++ in the real fileops WASM. */
import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { installFurnaceFileOpsWasm, repoRoot } from './furnaceFileOpsWasmHarness';
import { wavetableFromFileWasm, wavetableToFileWasm } from '../wasm/FurnaceFileOps';

const ab = (b: Uint8Array): ArrayBuffer => new Uint8Array(b).buffer;
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel));

describe('Furnace wavetable files', () => {
  beforeAll(installFurnaceFileOpsWasm);

  it('loads a Furnace-made .fuw and a DefleMask .dmw', async () => {
    const fuw = await wavetableFromFileWasm(ab(read('src/lib/import/__tests__/fixtures/furnace-wavetables/32x16saw.fuw')), '32x16saw.fuw');
    expect(fuw.data.length).toBe(32);
    expect(fuw.max).toBe(15);
    const dmw = await wavetableFromFileWasm(ab(read('src/lib/import/__tests__/fixtures/furnace-wavetables/perfume.dmw')), 'perfume.dmw');
    expect(dmw.data.length).toBeGreaterThan(0);
  });

  it('round-trips an edit through .fuw and .dmw', async () => {
    const wave = { data: Array.from({ length: 32 }, (_, i) => (i * 7) % 16), max: 15 };
    for (const fmt of ['fuw', 'dmw'] as const) {
      const bytes = await wavetableToFileWasm(wave, fmt);
      const back = await wavetableFromFileWasm(ab(bytes), `w.${fmt}`);
      expect(back).toEqual(wave);
    }
  });
});

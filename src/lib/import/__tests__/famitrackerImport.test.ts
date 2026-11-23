/** FamiTracker .ftm and Dn-FamiTracker .dnm open through the Furnace WASM loader (ftm.cpp, no longer stubbed). */
import { describe, it, expect, beforeAll } from 'vitest';
import { installFurnaceFileOpsWasm, readSong } from './furnaceFileOpsWasmHarness';

beforeAll(installFurnaceFileOpsWasm);

describe('FamiTracker import', { timeout: 60000 }, () => {
  for (const file of ['famitracker/kremlantis_vrc7.ftm', 'famitracker/base_alpha.dnm']) {
    it(`loads ${file} with channels, patterns and instruments`, async () => {
      const { loadFurFileWasm } = await import('../wasm/FurnaceFileOps');
      const loaded = await loadFurFileWasm(readSong(file));
      expect(loaded.numChannels).toBeGreaterThan(4);
      expect(loaded.nativeData.systemChans.reduce((a: number, b: number) => a + b, 0)).toBe(loaded.numChannels);
    });
  }
});

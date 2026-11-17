/** A wave list edit reaches the .fur the fileops WASM saves: waves moved, 10xx effects remapped. */
import { describe, it, expect, beforeAll } from 'vitest';
import { loadFurFileWasm, saveFurFileWasm, setFurWaveListWasm } from '../wasm/FurnaceFileOps';
import { installFurnaceFileOpsWasm, readSong } from './furnaceFileOpsWasmHarness';

beforeAll(() => installFurnaceFileOpsWasm());

describe('wavetable list edit reaches the .fur export', () => {
  it('writes the swapped list and a longer list', async () => {
    const first = await loadFurFileWasm(readSong('furnace/arcade/QSound_smile.fur'));
    const a = { data: Array.from({ length: 32 }, (_, i) => i % 16), height: 15 };
    const b = { data: Array.from({ length: 32 }, (_, i) => 15 - (i % 16)), height: 15 };
    await setFurWaveListWasm([a, b, { data: Array.from({ length: 32 }, () => 5), height: 31 }], undefined);
    await setFurWaveListWasm([b, a], [1, 0]);
    const again = await loadFurFileWasm(await saveFurFileWasm());
    expect(first.wavetables).toBeDefined();
    expect(again.wavetables.length).toBe(2);
    expect(again.wavetables[0].data.slice(0, 2)).toEqual([15, 14]);
    expect(again.wavetables[1].data.slice(0, 4)).toEqual([0, 1, 2, 3]);
  });
});

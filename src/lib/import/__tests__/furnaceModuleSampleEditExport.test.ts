/**
 * A module sample edited in the sample editor reaches the song the .fur save
 * writes: fur_set_sample replaces the sample in the fileops WASM song, and the
 * saved file read back holds the edited PCM, rate and loop.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { loadFurFileWasm, saveFurFileWasm, setFurSampleWasm } from '../wasm/FurnaceFileOps';
import { installFurnaceFileOpsWasm, readSong } from './furnaceFileOpsWasmHarness';
import { moduleSampleWithEdit, moduleSampleToUserSample, isEditableModuleSample } from '@/engine/furnace-dispatch/userSampleWav';

const SONG = 'furnace/arcade/QSound_smile.fur';

beforeAll(() => installFurnaceFileOpsWasm());

describe('module sample edit reaches the .fur export', () => {
  it('writes the edited PCM, rate and loop', async () => {
    const first = await loadFurFileWasm(readSong(SONG));
    const idx = first.samples.findIndex((s) => isEditableModuleSample(s) && s.data.length > 64);
    expect(idx).toBeGreaterThanOrEqual(0);
    const prev = first.samples[idx];

    const user = moduleSampleToUserSample(prev);
    const edited = Int16Array.from({ length: 200 }, (_, i) => (i % 2 ? 1000 : -1000));
    const out = moduleSampleWithEdit(prev, { ...user, data: edited, rate: 22050 });
    expect(out.rate).toBe(22050);
    expect(out.data).toBe(edited);

    await setFurSampleWasm(idx, out.data as Int16Array, out.rate, 20, 150);
    const saved = await saveFurFileWasm();
    const again = await loadFurFileWasm(saved);
    const got = again.samples[idx];
    expect(got.rate).toBe(22050);
    expect(Array.from(got.data as Int16Array)).toEqual(Array.from(edited));
    expect(got.loopStart).toBe(20);
    expect(got.loopEnd).toBe(150);
  });
});

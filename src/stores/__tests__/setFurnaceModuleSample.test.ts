/** The store action puts the edited sample in furnaceSamples and calls replaceModuleSamples. */
import { describe, it, expect, vi } from 'vitest';

const replaceModuleSamples = vi.fn();
const setFurSampleWasm = vi.fn().mockResolvedValue(undefined);
vi.mock('@engine/furnace-dispatch/FurnaceDispatchEngine', () => ({
  FurnaceDispatchEngine: { hasInstance: () => true, getInstance: () => ({ replaceModuleSamples }) },
}));
vi.mock('@lib/import/wasm/FurnaceFileOps', () => ({ setFurSampleWasm }));

import { useFormatStore } from '../useFormatStore';
import type { FurnaceModuleSample } from '@/types/tracker';

const smp = (n: number, rate: number): FurnaceModuleSample => ({
  data: new Int16Array(n), rate, depth: 16, samples: n, loopStart: -1, loopEnd: -1, loopMode: 0, name: 's',
} as FurnaceModuleSample);

describe('setFurnaceModuleSample', () => {
  it('stores the edit, re-uploads to the engine and the export song', async () => {
    useFormatStore.setState({ furnaceSamples: [smp(8, 8000), smp(8, 8000)] });
    const edited = { ...smp(16, 22050), loopStart: 2, loopEnd: 10 };
    useFormatStore.getState().setFurnaceModuleSample(1, edited);
    expect(useFormatStore.getState().furnaceSamples![1].rate).toBe(22050);
    await vi.waitFor(() => expect(replaceModuleSamples).toHaveBeenCalledTimes(1));
    expect(replaceModuleSamples.mock.calls[0][0][1].data.length).toBe(16);
    await vi.waitFor(() => expect(setFurSampleWasm).toHaveBeenCalledWith(1, edited.data, 22050, 2, 10));
  });
});

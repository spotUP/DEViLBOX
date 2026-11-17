/** Wave list edits remap every reference: instrument wave macros / fields and 10xx effects. */
import { describe, it, expect, vi } from 'vitest';

const replaceModuleWavetables = vi.fn();
const setFurWaveListWasm = vi.fn().mockResolvedValue(undefined);
vi.mock('@engine/furnace-dispatch/FurnaceDispatchEngine', () => ({
  FurnaceDispatchEngine: { hasInstance: () => true, getInstance: () => ({ replaceModuleWavetables }) },
}));
vi.mock('@lib/import/wasm/FurnaceFileOps', () => ({ setFurWaveListWasm }));
vi.mock('@engine/ToneEngine', () => ({ getToneEngine: () => ({ disposeInstrument: vi.fn(), invalidateInstrument: vi.fn() }) }));

import { useFormatStore } from '../useFormatStore';
import { useInstrumentStore } from '../useInstrumentStore';
import { furnaceWaveList } from '../furnaceWaveList';
import type { FurnaceNativeData, FurnaceModuleWavetable } from '@/types/tracker';

const w = (v: number): FurnaceModuleWavetable => ({ data: [v, v], width: 2, height: 15 });

function setup() {
  const rows = [10, 1, 2].map((val) => ({ note: -1, ins: -1, vol: -1, effects: [{ cmd: 0x10, val }, { cmd: 0x0f, val: 1 }] }));
  const native = { subsongs: [{ channels: [{ patterns: new Map([[0, { rows }]]) }] }] } as unknown as FurnaceNativeData;
  useFormatStore.setState({ furnaceWavetables: [w(0), w(1), w(2)], furnaceNative: native });
  useInstrumentStore.setState({
    instruments: [{ id: 1, furnace: { macros: [{ code: 3, data: [0, 1, 2] }, { code: 0, data: [1] }], n163: { wave: 2 }, ws: { wave1: 1, wave2: 0 } } }] as never,
  });
  return rows;
}

describe('furnaceWaveList', () => {
  it('move down swaps waves and remaps macros, fields and 10xx effects', async () => {
    const rows = setup();
    furnaceWaveList.move(0, 'down');
    expect(useFormatStore.getState().furnaceWavetables!.map((x) => x.data[0])).toEqual([1, 0, 2]);
    const f = useInstrumentStore.getState().instruments[0].furnace!;
    expect(f.macros[0].data).toEqual([1, 0, 2]);
    expect(f.macros[1].data).toEqual([1]);
    expect([f.n163!.wave, f.ws!.wave1, f.ws!.wave2]).toEqual([2, 0, 1]);
    const eff = useFormatStore.getState().furnaceNative!.subsongs[0].channels[0].patterns.get(0)!.rows;
    expect(eff.map((r) => r.effects[0].val)).toEqual([10, 0, 2]);
    expect(eff[0].effects[1].val).toBe(1);
    void rows;
    await vi.waitFor(() => expect(setFurWaveListWasm).toHaveBeenCalledWith(expect.any(Array), [1, 0, 2]));
    expect(replaceModuleWavetables).toHaveBeenCalled();
  });

  it('delete shifts later references down and sends the deleted one to wave 0', () => {
    setup();
    furnaceWaveList.remove(1);
    expect(useFormatStore.getState().furnaceWavetables!.map((x) => x.data[0])).toEqual([0, 2]);
    expect(useInstrumentStore.getState().instruments[0].furnace!.macros[0].data).toEqual([0, 0, 1]);
  });

  it('add and duplicate append without remapping', async () => {
    setup();
    furnaceWaveList.add();
    furnaceWaveList.duplicate(2);
    const list = useFormatStore.getState().furnaceWavetables!;
    expect(list.length).toBe(5);
    expect(list[4].data).toEqual([2, 2]);
    await vi.waitFor(() => expect(setFurWaveListWasm).toHaveBeenLastCalledWith(expect.any(Array), undefined));
  });
});

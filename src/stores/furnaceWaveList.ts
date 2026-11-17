/**
 * Song wavetable list actions of a Furnace song (Furnace WAVE_LIST_ADD / DUPLICATE / DELETE / MOVE_UP / MOVE_DOWN).
 * One edit updates the format store's list, moves every wave reference (instrument wave macros and wave fields,
 * 10xx effects), re-uploads to every running chip and rewrites the song the .fur save writes.
 */
import { useFormatStore } from './useFormatStore';
import { useInstrumentStore } from './useInstrumentStore';
import type { FurnaceModuleWavetable } from '@/types/tracker';
import { applyWaveListOp, remapConfigWaves, remapNativeWaveEffects, waveIndexMap, type WaveListOp } from '@/lib/furnace/waveListOps';

const NEW_WAVE: FurnaceModuleWavetable = { data: Array.from({ length: 32 }, () => 0), width: 32, height: 31 };

function edit(op: WaveListOp, added?: FurnaceModuleWavetable): void {
  const before = useFormatStore.getState().furnaceWavetables ?? [];
  const map = op.kind === 'append' ? undefined : waveIndexMap(op, before.length);
  const next = applyWaveListOp(before, op, added);
  useFormatStore.setState((state) => {
    state.furnaceWavetables = next;
    if (map && state.furnaceNative) remapNativeWaveEffects(state.furnaceNative, map);
  });
  if (map) {
    useInstrumentStore.setState((state) => {
      for (const inst of state.instruments) if (inst.furnace) remapConfigWaves(inst.furnace, map);
    });
  }
  void import('@engine/furnace-dispatch/FurnaceDispatchEngine').then(({ FurnaceDispatchEngine }) => {
    if (FurnaceDispatchEngine.hasInstance()) FurnaceDispatchEngine.getInstance().replaceModuleWavetables(next);
  }).catch(() => {});
  void import('@lib/import/wasm/FurnaceFileOps').then(({ setFurWaveListWasm }) => setFurWaveListWasm(next, map)).catch(() => {});
}

const count = (): number => useFormatStore.getState().furnaceWavetables?.length ?? 0;

export const furnaceWaveList = {
  add: (wave: FurnaceModuleWavetable = NEW_WAVE): void => edit({ kind: 'append' }, { ...wave, data: wave.data.slice() }),
  duplicate: (index: number): void => {
    const w = useFormatStore.getState().furnaceWavetables?.[index];
    if (w) edit({ kind: 'append' }, { ...w, data: w.data.slice() });
  },
  remove: (index: number): void => { if (index >= 0 && index < count()) edit({ kind: 'delete', index }); },
  move: (index: number, direction: 'up' | 'down'): void => {
    const to = direction === 'up' ? index - 1 : index + 1;
    if (index >= 0 && index < count() && to >= 0 && to < count()) edit({ kind: 'swap', a: index, b: to });
  },
};

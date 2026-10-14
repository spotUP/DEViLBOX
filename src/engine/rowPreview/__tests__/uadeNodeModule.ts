/**
 * A UADE instance for the row-preview adapter in Node: the headless module of tools/uade-audit/uadeRenderCore, initialised,
 * with its heap views refreshed whenever the adapter reads them (the wasm memory may grow under a load).
 */
import { loadUADEModule, refreshHeap } from '../../../../tools/uade-audit/uadeRenderCore';
import type { UadeWasm } from '../../uade/uadeWasmInstance';

export async function nodeUadeWasm(sampleRate: number): Promise<UadeWasm> {
  const mod = await loadUADEModule(false);
  if (mod._uade_wasm_init(sampleRate) !== 0) throw new Error('uade_wasm_init failed');
  return new Proxy(mod, {
    get(target, key) {
      if (key === 'HEAPU8' || key === 'HEAPF32') refreshHeap(target);
      return Reflect.get(target, key);
    },
  }) as unknown as UadeWasm;
}

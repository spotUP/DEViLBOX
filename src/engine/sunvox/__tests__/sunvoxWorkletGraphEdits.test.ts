/**
 * The modular editor's graph edits reach the SunVox engine. SunVoxEngine.newModule / removeModule /
 * connectModules / disconnectModules post a message and await a reply, but public/sunvox/SunVox.worklet.js
 * had no case for those messages, so every add/connect in the editor hung forever. The worklet must run
 * sv_new_module / sv_remove_module / sv_connect_module / sv_disconnect_module under sv_lock_slot and reply
 * with the keys the engine resolves on. The graph query must also carry each controller's type and group.
 *
 * The worklet runs as the real public/sunvox/SunVox.worklet.js in a stand-in AudioWorkletGlobalScope with a
 * recording stand-in for the WASM exports; the engine is the real SunVoxEngine without its AudioWorkletNode.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/utils/audio-context', () => ({ getDevilboxAudioContext: () => ({ createGain: () => ({}) }) }));
import { inlineWorkletImports } from '@/engine/__tests__/workletHarness';
import { SunVoxEngine } from '@/engine/sunvox/SunVoxEngine';

const ROOT = resolve(__dirname, '../../../..');
const HANDLE = 2;

type Proc = { port: { onmessage: ((e: { data: unknown }) => unknown) | null; postMessage: (m: unknown) => void }; [k: string]: unknown };

function wired() {
  const src = inlineWorkletImports(readFileSync(resolve(ROOT, 'public/sunvox/SunVox.worklet.js'), 'utf8'), 'sunvox');
  let Processor!: new () => Proc;
  const scope: Record<string, unknown> = {
    AudioWorkletProcessor: class { port = { postMessage: (_m: unknown) => {}, onmessage: null }; },
    registerProcessor: (_n: string, cls: new () => Proc) => { Processor = cls; },
  };
  new Function(...Object.keys(scope), src)(...Object.values(scope));
  const proc = new Processor();

  // WASM memory stand-in: bump allocator, C strings read back from the heap.
  const heap = new Uint8Array(4096);
  let top = 16;
  const cstr = (ptr: number) => { let s = ''; for (let i = ptr; heap[i]; i++) s += String.fromCharCode(heap[i]); return s; };
  const strings = new Map<string, number>();
  const put = (s: string) => {
    if (!strings.has(s)) { const p = top; for (let i = 0; i < s.length; i++) heap[p + i] = s.charCodeAt(i); heap[p + s.length] = 0; top += s.length + 1; strings.set(s, p); }
    return strings.get(s)!;
  };
  const calls: string[] = [];
  proc.svlib = {
    HEAPU8: heap,
    HEAP32: new Int32Array(heap.buffer),
    _malloc: (n: number) => { const p = top; top += n; return p; },
    _free: () => {},
    UTF8ToString: cstr,
    _sv_lock_slot: (h: number) => { calls.push(`lock ${h}`); return 0; },
    _sv_unlock_slot: (h: number) => { calls.push(`unlock ${h}`); return 0; },
    _sv_new_module: (h: number, type: number, name: number, x: number, y: number, z: number) => {
      calls.push(`new ${h} ${cstr(type)} ${cstr(name)} ${x} ${y} ${z}`);
      return 7;
    },
    _sv_remove_module: (h: number, id: number) => { calls.push(`remove ${h} ${id}`); return 0; },
    _sv_connect_module: (h: number, s: number, d: number) => { calls.push(`connect ${h} ${s} ${d}`); return 0; },
    _sv_disconnect_module: (h: number, s: number, d: number) => { calls.push(`disconnect ${h} ${s} ${d}`); return -1; },
    _sv_get_number_of_modules: () => 1,
    _sv_get_module_flags: () => 1, // exists, no inputs/outputs
    _sv_get_module_name: () => put('Generator'),
    _sv_get_module_type: () => put('Generator'),
    _sv_get_module_inputs: () => 0,
    _sv_get_module_outputs: () => 0,
    _sv_get_number_of_module_ctls: () => 1,
    _sv_get_module_ctl_name: () => put('Waveform'),
    _sv_get_module_ctl_min: () => 0,
    _sv_get_module_ctl_max: () => 4,
    _sv_get_module_ctl_value: () => 1,
    _sv_get_module_ctl_type: () => 1,
    _sv_get_module_ctl_group: () => 3,
  };

  const engine = Object.create(SunVoxEngine.prototype) as SunVoxEngine;
  Object.assign(engine, {
    _initPromise: Promise.resolve(),
    _disposed: false,
    _newModuleQueue: [],
    _removeModuleQueue: new Map(),
    _connectQueue: new Map(),
    _disconnectQueue: new Map(),
    _moduleGraphQueue: new Map(),
    workletNode: { port: { postMessage: (m: object) => proc.port.onmessage?.({ data: m }) } },
  });
  // Worklet replies go to the engine's real reply handler.
  proc.port.postMessage = (m: unknown) => (engine as unknown as { handleWorkletMessage: (d: unknown) => void }).handleWorkletMessage(m);
  return { engine, calls };
}

/** Resolves with the promise's value, or 'HANG' when no reply arrives. */
const settle = <T,>(p: Promise<T>) => Promise.race([p, new Promise<'HANG'>((r) => setTimeout(() => r('HANG'), 50))]);

describe('SunVox worklet graph edits reply to the engine', () => {
  it('newModule creates the module under the slot lock and resolves with its id', async () => {
    const { engine, calls } = wired();
    expect(await settle(engine.newModule(HANDLE, 'Generator'))).toBe(7);
    expect(calls).toEqual([`lock ${HANDLE}`, `new ${HANDLE} Generator Generator 0 0 0`, `unlock ${HANDLE}`]);
  });

  it('removeModule, connectModules and disconnectModules resolve with the engine result', async () => {
    const { engine, calls } = wired();
    expect(await settle(engine.removeModule(HANDLE, 7))).toBeUndefined();
    expect(await settle(engine.connectModules(HANDLE, 7, 0))).toBe(0);
    expect(await settle(engine.disconnectModules(HANDLE, 7, 0))).toBe(-1);
    expect(calls).toEqual([
      `lock ${HANDLE}`, `remove ${HANDLE} 7`, `unlock ${HANDLE}`,
      `lock ${HANDLE}`, `connect ${HANDLE} 7 0`, `unlock ${HANDLE}`,
      `lock ${HANDLE}`, `disconnect ${HANDLE} 7 0`, `unlock ${HANDLE}`,
    ]);
  });

  it('the module graph carries controller type and group', async () => {
    const { engine } = wired();
    const graph = await settle(engine.getModuleGraph(HANDLE));
    expect(graph).not.toBe('HANG');
    expect((graph as Awaited<ReturnType<SunVoxEngine['getModuleGraph']>>)[0].controls).toEqual([
      { name: 'Waveform', min: 0, max: 4, value: 1, type: 1, group: 3 },
    ]);
  });
});

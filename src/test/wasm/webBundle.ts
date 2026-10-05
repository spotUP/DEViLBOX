/**
 * Evaluate a web-built emscripten bundle under node for a headless engine
 * test: the factory is returned by name, a CommonJS `require` is in scope
 * (the bundle asks for `fs` when it sees node), and the wasm memory is
 * captured at instantiation because several bundles export no heap view.
 *
 * Used by the engine-core corpus tests (GTUltra, sc68, ASAP) of the
 * 2026-10-05 broken-formats sweep: when the core renders a file that the
 * browser plays silently, the fault is the routing around the engine.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

export interface WebBundle<M> {
  module: M;
  /** The instance's exported memory when it could be captured (empty object otherwise); use `heap()`. */
  memory: WebAssembly.Memory;
  /** The live heap, read per call. */
  heap: () => Uint8Array;
}

export async function loadWebBundle<M>(jsPath: string, wasmPath: string, factoryName: string): Promise<WebBundle<M>> {
  const js = readFileSync(jsPath, 'utf8');
  const wasmBinary = readFileSync(wasmPath);
  let memory: WebAssembly.Memory | null = null;
  const original = WebAssembly.instantiate;
  (WebAssembly as unknown as { instantiate: unknown }).instantiate = async (...args: unknown[]) => {
    const result = await (original as (...a: unknown[]) => Promise<unknown>)(...args);
    const inst = (result as { instance?: WebAssembly.Instance }).instance ?? (result as WebAssembly.Instance);
    const exported = (inst as WebAssembly.Instance).exports?.memory;
    if (exported instanceof WebAssembly.Memory) memory = exported;
    return result;
  };
  try {
    const require = createRequire(import.meta.url);
    const factory = new Function('require', '__dirname', '__filename', `${js}\nreturn ${factoryName};`)(require, dirname(jsPath), jsPath);
    const module = (await factory({ wasmBinary, print: () => {}, printErr: () => {} })) as M;
    // A bundle that compiles its wasm another way still exposes HEAPU8 or
    // wasmMemory; read it per call so heap growth never leaves a stale view.
    const views = module as unknown as { HEAPU8?: Uint8Array; wasmMemory?: WebAssembly.Memory };
    const mem: WebAssembly.Memory | undefined = memory ?? views.wasmMemory;
    if (!mem && !views.HEAPU8) throw new Error(`${factoryName}: wasm memory not captured`);
    const heap = (): Uint8Array => (mem ? new Uint8Array(mem.buffer) : views.HEAPU8!);
    return { module, memory: mem ?? ({} as WebAssembly.Memory), heap };
  } finally {
    (WebAssembly as unknown as { instantiate: unknown }).instantiate = original;
  }
}

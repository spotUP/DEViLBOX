/**
 * One instance per page, not per module copy.
 *
 * A `private static instance` field lives in the module that declares it.
 * Vite HMR re-evaluates a changed module and everything above it, and each
 * evaluation gets its own copy of that field, so the second copy's
 * `getInstance()` builds a second instance. For ToneEngine that meant a second
 * AudioContext (2026-10-19): the orphan engine's constructor re-pointed the
 * shared DEViLBOX audio context, and every synth created afterwards was built
 * on a context whose clock sat ~15 minutes behind the engine that scheduled
 * its notes. Pattern playback went silent while direct triggers still sounded.
 *
 * `globalThis` is shared by every module copy, so an instance kept here
 * survives the re-evaluation. The trade-off is the one HMR always had for the
 * engine: new code in the singleton's module only runs after a reload.
 */
const KEY = '__devilboxSingletons';

type Registry = Map<string, unknown>;

function registry(): Registry {
  const g = globalThis as unknown as Record<string, unknown>;
  if (!(g[KEY] instanceof Map)) g[KEY] = new Map<string, unknown>();
  return g[KEY] as Registry;
}

/** Return the page's instance under `name`, creating it once. */
export function globalSingleton<T>(name: string, create: () => T): T {
  const r = registry();
  if (!r.has(name)) r.set(name, create());
  return r.get(name) as T;
}

/** Forget the instance so the next `globalSingleton` call creates a new one. */
export function clearGlobalSingleton(name: string): void {
  registry().delete(name);
}

/**
 * Forget every instance, as a new page would. Test harnesses that call
 * `vi.resetModules()` to get a fresh engine must call this as well: the
 * instances outlive the module copies by design.
 */
export function clearAllGlobalSingletons(): void {
  registry().clear();
}

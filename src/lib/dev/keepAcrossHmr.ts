/**
 * Keep a store's DATA across a hot module replacement.
 *
 * Observed repeatedly on 2026-09-21: editing `DubBus.ts` while a song played
 * reset the project to an empty default — "Untitled", one pattern, classic
 * editor mode — with the transport still running, which presents as sudden
 * silence. A dev-only fault, but it costs a listening session every time, and
 * it imitates a real playback failure closely enough to have produced one wrong
 * diagnosis already.
 *
 * Cause: nothing in this codebase handled HMR at all. Vite invalidates a
 * changed module and everything that imports it, and the store modules sit
 * transitively above the engine, so they re-execute and `create(...)` builds a
 * brand-new store at its defaults. The song was never unloaded; the store
 * holding it was replaced.
 *
 * So the data is carried over the reload. What is deliberately NOT carried is
 * the functions: a store's actions live in its state, and restoring an old
 * snapshot wholesale would reinstate the OLD closures and defeat the point of
 * hot-replacing the module. New actions, previous data.
 *
 * This does not call `hot.accept()`. Self-accepting a store would stop the
 * update propagating to the components that read it, which is a different and
 * worse failure than the one being fixed.
 *
 * In a production build `import.meta.hot` is undefined, the call returns
 * immediately, and the whole path is dropped by the bundler.
 */

/** The parts of Vite's hot context this needs — structural, so no import. */
export interface HotContext {
  data: Record<string, unknown>;
  dispose: (cb: (data: Record<string, unknown>) => void) => void;
}

interface StoreLike<T> {
  getState: () => T;
  setState: (partial: Partial<T>) => void;
}

/** Strip functions: actions come from the NEW module, data from the old one. */
export function dataOnly<T extends object>(state: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) {
    if (typeof value === 'function') continue;
    out[key] = value;
  }
  return out as Partial<T>;
}

/**
 * Call at module scope, right after the store is created:
 *
 *     keepAcrossHmr(import.meta.hot, useTrackerStore, 'tracker');
 *
 * `import.meta.hot` must be passed in by the caller — `data` is per-module, so
 * reading it inside this file would give this module's bucket, not the store's.
 */
export function keepAcrossHmr<T extends object>(
  hot: HotContext | undefined,
  store: StoreLike<T>,
  key: string,
): void {
  // `hot` exists in more places than Vite's dev server — a test runner can
  // provide a partial one — so check for the parts actually used rather than
  // for the object. Reading `hot.data[key]` off a context without `data` threw
  // at module scope, which takes the whole store down with it.
  if (!hot || !hot.data || typeof hot.dispose !== 'function') return;
  const saved = hot.data[key] as T | undefined;
  if (saved) {
    try {
      store.setState(dataOnly(saved));
    } catch (err) {
      console.warn(`[hmr] could not restore ${key}:`, err);
    }
  }
  registerForSnapshot(hot, key, store as StoreLike<object>);
}

/**
 * Every store registered against one hot context, and the single teardown
 * callback that snapshots all of them.
 *
 * Vite keeps ONE dispose callback per module, so registering a second replaces
 * the first silently — two stores in one module and only the later one would
 * be carried. One callback that walks a registry cannot go wrong that way.
 */
const registries = new WeakMap<HotContext, Map<string, StoreLike<object>>>();

function registerForSnapshot(hot: HotContext, key: string, store: StoreLike<object>): void {
  let registry = registries.get(hot);
  if (!registry) {
    registry = new Map();
    registries.set(hot, registry);
    hot.dispose((data) => {
      for (const [k, s] of registry!) {
        try {
          data[k] = s.getState();
        } catch { /* a store that cannot be read is one we cannot carry */ }
      }
    });
  }
  registry.set(key, store);
}

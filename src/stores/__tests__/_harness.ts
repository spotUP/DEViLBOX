/**
 * Shared helpers for Zustand store tests.
 *
 * Stores hold both data fields and action functions; functions can't be
 * cloned, and immer-produced state references get revoked between
 * producer runs. We deep-clone only the JSON-serializable fields at first
 * call and merge them back each reset, leaving action function references
 * (which are stable across the store's lifetime) in place.
 */

import type { StoreApi, UseBoundStore } from 'zustand';

type AnyStore = UseBoundStore<StoreApi<any>>;

const pristineData = new WeakMap<AnyStore, Record<string, unknown>>();

/** Deep-clones only the data part of the state (skips functions). */
function cloneData(state: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(state)) {
    if (typeof v === 'function') continue;
    out[k] = v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  }
  return out;
}

/** Resets a store to its first-observed data state and clears localStorage. */
export function resetStore(store: AnyStore): void {
  if (!pristineData.has(store)) {
    pristineData.set(store, cloneData(store.getState() as Record<string, unknown>));
  }
  // Merge (not replace) so action functions stay intact.
  store.setState(cloneData(pristineData.get(store)!), false);
  localStorage.clear();
}

/**
 * Asserts that a store module can be imported without crashing at module
 * evaluation time. Use for the "every store wires up cleanly" safety net.
 */
export async function assertNoCrashOnImport(
  importFn: () => Promise<Record<string, unknown>>,
): Promise<void> {
  const mod = await importFn();
  const hooks = Object.values(mod).filter(
    (v): v is AnyStore => typeof v === 'function' && 'getState' in (v as object),
  );
  if (hooks.length === 0) return;
  for (const hook of hooks) {
    const state = hook.getState();
    if (state === undefined || state === null) {
      throw new Error('store getState() returned nullish');
    }
  }
}

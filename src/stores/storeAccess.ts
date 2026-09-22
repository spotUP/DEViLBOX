/**
 * Store Access — late-bound registry for the three stores that used to form
 * a circular import chain (useTrackerStore ↔ useEditorStore ↔ useCursorStore).
 *
 * Each store registers itself with this leaf module at the end of its own
 * module body. Cross-store calls go through the getters instead of static
 * imports, so the stores no longer form a module-graph cycle and Rollup can
 * emit them in a clean topological order. The previous cycle produced TDZ
 * errors on useCursorStore's const when the stores/index.ts aggregator froze
 * its namespace object mid-cycle ("Cannot access 'jI' before initialization"
 * in the minified production bundle).
 *
 * This module intentionally has NO imports. It must stay a leaf so the
 * cycle can never re-form via a transitive dep chain.
 */

// zustand exposes these on every store instance; we only use these three
// surface methods from inside cross-store actions. No `this`-binding needed
// because zustand binds them internally in create().
interface MinimalStore {
  getState: () => unknown;
  setState: (...args: unknown[]) => unknown;
  subscribe: (...args: unknown[]) => unknown;
}

let _trackerStore: MinimalStore | null = null;
let _editorStore: MinimalStore | null = null;
let _cursorStore: MinimalStore | null = null;
/**
 * The mixer store joined this registry on 2026-09-21. `ChannelRoutedEffects`
 * reads per-channel dub settings when it builds a channel's FX chain, and a
 * static import there closes a cycle through the mixer store's engine warm-up
 * (mixer -> FurnaceDispatchEngine -> ChannelRoutedEffects), which fails at
 * module evaluation with "Cannot access 'engineResolversByMode' before
 * initialization". Late binding through this leaf keeps the cycle open.
 */
let _mixerStore: MinimalStore | null = null;
/**
 * The format store joined on 2026-09-22. `AutomationPlayer` must know the
 * editor mode to read a pattern cell's volume column with the right
 * convention, and nothing under `src/engine/` imports the format store
 * directly — a static import there would be the first, through a store that
 * pulls the native engines behind it.
 */
let _formatStore: MinimalStore | null = null;

export function registerTrackerStore(store: unknown): void {
  _trackerStore = store as MinimalStore;
}

export function registerEditorStore(store: unknown): void {
  _editorStore = store as MinimalStore;
}

export function registerCursorStore(store: unknown): void {
  _cursorStore = store as MinimalStore;
}

export function registerMixerStore(store: unknown): void {
  _mixerStore = store as MinimalStore;
}

export function registerFormatStore(store: unknown): void {
  _formatStore = store as MinimalStore;
}

export function getTrackerStoreRef(): MinimalStore {
  if (!_trackerStore) throw new Error('[storeAccess] useTrackerStore accessed before registration');
  return _trackerStore;
}

export function getEditorStoreRef(): MinimalStore {
  if (!_editorStore) throw new Error('[storeAccess] useEditorStore accessed before registration');
  return _editorStore;
}

export function getCursorStoreRef(): MinimalStore {
  if (!_cursorStore) throw new Error('[storeAccess] useCursorStore accessed before registration');
  return _cursorStore;
}

/** Null rather than throwing: the FX chain is built while a song loads, which
 *  can precede the mixer store's own module evaluation. Callers skip the
 *  re-apply step in that case, exactly as they did before. */
export function getMixerStoreRefOrNull(): MinimalStore | null {
  return _mixerStore;
}

/** Null rather than throwing: automation can run before the format store's own
 *  module evaluation, and a caller with no editor mode falls back to the
 *  format-agnostic reading it used before. */
export function getFormatStoreRefOrNull(): MinimalStore | null {
  return _formatStore;
}

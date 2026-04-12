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

export function registerTrackerStore(store: unknown): void {
  _trackerStore = store as MinimalStore;
}

export function registerEditorStore(store: unknown): void {
  _editorStore = store as MinimalStore;
}

export function registerCursorStore(store: unknown): void {
  _cursorStore = store as MinimalStore;
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

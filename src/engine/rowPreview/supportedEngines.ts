/**
 * The whole-song engines the row preview has an adapter for, by WASM_ENGINES key. Read on the main thread (previewNativeRow
 * decides the instrument path vs the engine path from it) without loading any adapter: the adapters live in
 * adapters/index.ts, which only the row-preview worker imports. A test holds the two lists equal.
 */
export const ROW_PREVIEW_ENGINE_KEYS: ReadonlySet<string> = new Set(['Nuade']);

export const rowPreviewSupports = (engineKey: string): boolean => ROW_PREVIEW_ENGINE_KEYS.has(engineKey);

/**
 * Adapter registry of the row-preview worker, keyed by WASM_ENGINES key. Each loader builds the engine's private
 * player instance at the audio context's sample rate. The keys here and in ../supportedEngines.ts are one list
 * (adaptersMatchSupportedEngines.test.ts).
 */
import type { RowRenderAdapter } from '../rowPreviewStream';

export type AdapterLoader = (sampleRate: number) => Promise<RowRenderAdapter>;

export const ROW_PREVIEW_ADAPTERS: Record<string, AdapterLoader> = {
  Nuade: async (sampleRate) => {
    const [{ loadNuadeModuleFromPublic }, { createNuadeRowAdapter }] = await Promise.all([
      import('@engine/nuade/nuadeModule'), import('./nuadeAdapter'),
    ]);
    return createNuadeRowAdapter(await loadNuadeModuleFromPublic(), sampleRate);
  },
};

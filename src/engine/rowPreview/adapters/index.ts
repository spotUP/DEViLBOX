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
  EaglePlayer: async (sampleRate) => {
    const [{ loadEaglePlayerModuleFromPublic }, { createEaglePlayerRowAdapter }] = await Promise.all([
      import('@engine/eagleplayer/eaglePlayerModule'), import('./eaglePlayerAdapter'),
    ]);
    const base = import.meta.env.BASE_URL || '/';
    const fetchPlayer = (url: string) => fetch(url).then((r) => {
      if (!r.ok) throw new Error(`eagleplayer ${url}: HTTP ${r.status}`);
      return r.arrayBuffer();
    });
    return createEaglePlayerRowAdapter(await loadEaglePlayerModuleFromPublic(), sampleRate, fetchPlayer, base);
  },
};

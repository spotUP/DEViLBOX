/**
 * Which engine a deck's render of a file uses, as the cache key sees it.
 *
 * A file whose format plays on nuade is rendered by nuade (dj-render.worker.ts renderWithNuade), any other Amiga file by
 * UADE; the two renders differ, so they are different cache entries (DJAudioCache.renderCacheKey: content hash, then the
 * engine part). The choice is asked of the ONE resolver (nuadeRouting.nuadePlayerFor: settings, table default, nuade's
 * own probe), which is async, so it is settled when a file enters the pipeline and kept here by content hash for the
 * synchronous key builders. A file never resolved this session keys as UADE's render.
 */
import { useSettingsStore } from '@/stores/useSettingsStore';
import { nuadePlayerFor } from '@/engine/nuade/nuadeRouting';

const playerByHash = new Map<string, string>();

/** The key part for a file: '' (UADE / libopenmpt / the others) or '#nuade=<player id>'. */
export function renderEngineSuffix(contentHash: string): string {
  const id = playerByHash.get(contentHash);
  return id ? `#nuade=${id}` : '';
}

/** The nuade player a cache key was rendered with, undefined when the key is not a nuade render. */
export function nuadePlayerOfKey(key: string): string | undefined {
  return /#nuade=([^#/]+)/.exec(key)?.[1];
}

/** Record the engine for a file (null = not nuade). */
export function setRenderPlayer(contentHash: string, playerId: string | null): void {
  if (playerId) playerByHash.set(contentHash, playerId);
  else playerByHash.delete(contentHash);
}

export function renderPlayerOf(contentHash: string): string | null {
  return playerByHash.get(contentHash) ?? null;
}

/** Ask the resolver which nuade player renders this file now and record it under `contentHash`. */
export async function resolveRenderPlayer(contentHash: string, filename: string, source: ArrayBuffer): Promise<string | null> {
  const id = await nuadePlayerFor(filename, new Uint8Array(source), useSettingsStore.getState().formatEngine);
  setRenderPlayer(contentHash, id);
  return id;
}

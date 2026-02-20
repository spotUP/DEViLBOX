/**
 * DJSongCache - In-memory cache of parsed TrackerSong objects.
 *
 * Shared between DJFileBrowser and DJPlaylistPanel so that
 * playlist tracks can be loaded to decks without re-selecting files.
 * Cache is keyed by filename and lives only in memory (songs are too
 * large to persist).
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

const cache = new Map<string, TrackerSong>();

/** Store a parsed song by its filename */
export function cacheSong(fileName: string, song: TrackerSong): void {
  cache.set(fileName, song);
}

/** Retrieve a cached song by filename. Returns undefined if not cached. */
export function getCachedSong(fileName: string): TrackerSong | undefined {
  return cache.get(fileName);
}

/** Check if a song is cached */
export function hasCachedSong(fileName: string): boolean {
  return cache.has(fileName);
}

/** Remove a song from cache */
export function evictSong(fileName: string): void {
  cache.delete(fileName);
}

/** Clear the entire cache (e.g. when leaving DJ mode) */
export function clearSongCache(): void {
  cache.clear();
}

/** Number of cached songs */
export function songCacheSize(): number {
  return cache.size;
}

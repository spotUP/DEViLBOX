/**
 * DJSongCache - In-memory LRU cache of parsed TrackerSong objects.
 *
 * Shared between DJFileBrowser and DJPlaylistPanel so that
 * playlist tracks can be loaded to decks without re-selecting files.
 * Cache is keyed by filename and lives only in memory (songs are too
 * large to persist). LRU eviction keeps at most MAX_CACHE_SIZE entries
 * to prevent unbounded memory growth during long DJ sessions.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

const MAX_CACHE_SIZE = 8;

const cache = new Map<string, TrackerSong>();

/** Store a parsed song by its filename (LRU: evicts oldest when full) */
export function cacheSong(fileName: string, song: TrackerSong): void {
  // If key already exists, delete first so re-insertion moves it to end (most recent)
  if (cache.has(fileName)) cache.delete(fileName);
  cache.set(fileName, song);
  // Evict oldest entries (Map iterates in insertion order)
  while (cache.size > MAX_CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
    else break;
  }
}

/** Retrieve a cached song by filename. Returns undefined if not cached. */
export function getCachedSong(fileName: string): TrackerSong | undefined {
  const song = cache.get(fileName);
  if (song) {
    // Move to end (most recently used)
    cache.delete(fileName);
    cache.set(fileName, song);
  }
  return song;
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

const notesBySong = new WeakMap<TrackerSong, boolean>();

/**
 * Whether the song has a note anywhere (note-off and empty cells do not count).
 * A deck shows the pattern view only for a song with notes, otherwise the
 * oscilloscope: an RSID that is a whole C64 program (Venus_Falling, La_Mer)
 * parses to an empty pattern, which told the owner nothing (SID-DECK-FOLLOWUP b).
 */
export function songHasNotes(song: TrackerSong): boolean {
  const known = notesBySong.get(song);
  if (known !== undefined) return known;
  let found = false;
  for (const pattern of song.patterns ?? []) {
    for (const channel of pattern?.channels ?? []) {
      for (const cell of channel?.rows ?? []) {
        if (cell && cell.note > 0 && cell.note < 97) { found = true; break; }
      }
      if (found) break;
    }
    if (found) break;
  }
  notesBySong.set(song, found);
  return found;
}

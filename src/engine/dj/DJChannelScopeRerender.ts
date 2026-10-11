/**
 * Background scope re-render of old-shape cache entries.
 *
 * Cache entries rendered before the per-channel scope track existed
 * (e193fc143) hold a WAV and its analysis but no `channelScopes`, so their
 * decks show ALL only. Each such entry is re-rendered once, at LOW priority
 * through the one DJPipeline queue (PipelineTask.scopesOnly), when its track
 * loads on a deck and, in the background, for the tracks of the playlists.
 *
 * The deck's audio is never replaced: the entry keeps its audio and analysis,
 * gains the scope track, and a deck still holding that WAV gets the track
 * attached (DeckEngine.attachLateChannelScopes) while it plays.
 */
import { scopelessOriginOf, type ChannelScopeTrack, type ScopelessOrigin } from './channelScopeTrack';
import { getCachedEntryByHash, listScopelessEntries } from './DJAudioCache';
import { getDJPipeline } from './DJPipeline';
import { getDJEngineIfActive } from './DJEngine';
import type { DeckId } from './DeckEngine';
import { needsChannelScopeRerender } from './channelScopeTrack';
import { useDJPlaylistStore } from '@/stores/useDJPlaylistStore';

// One render per cache entry per session, however many loads and playlists ask.
const renders = new Map<string, Promise<ChannelScopeTrack | undefined>>();

function renderOnce(origin: ScopelessOrigin): Promise<ChannelScopeTrack | undefined> {
  let render = renders.get(origin.hash);
  if (!render) {
    render = (async () => {
      const entry = await getCachedEntryByHash(origin.hash);
      if (!entry?.sourceData || !needsChannelScopeRerender(entry)) return undefined;
      return getDJPipeline().renderChannelScopes(entry.sourceData, entry.filename, entry.duration);
    })().catch((err) => {
      console.warn(`[DJChannelScopeRerender] ${origin.filename}:`, err);
      return undefined;
    });
    renders.set(origin.hash, render);
  }
  return render;
}

/**
 * `wav` was just loaded on `deckId`: when it came from an old-shape cache
 * entry, queue its scope re-render (once) and, when it finishes, attach the
 * track to the deck if the deck still holds that WAV. True when attached.
 */
export async function requestChannelScopeRerender(wav: ArrayBuffer, deckId: DeckId): Promise<boolean> {
  const origin = scopelessOriginOf(wav);
  if (!origin) return false;
  const track = await renderOnce(origin);
  if (!track) return false;
  return getDJEngineIfActive()?.getDeck(deckId).attachLateChannelScopes(wav, track) ?? false;
}

let playlistPassStarted = false;

/** The name a cache entry carries for a playlist track: the file's own name, never the `modland:` / `local:` path. */
function cacheNameOf(fileName: string): string {
  return fileName.slice(fileName.lastIndexOf('/') + 1);
}

/**
 * Re-render, one at a time and at LOW priority, every old-shape cache entry
 * that belongs to a playlist track. Once per session.
 */
export async function rerenderPlaylistChannelScopes(): Promise<number> {
  if (playlistPassStarted) return 0;
  playlistPassStarted = true;
  const wanted = new Set<string>();
  for (const playlist of useDJPlaylistStore.getState().playlists) {
    for (const track of playlist.tracks) wanted.add(cacheNameOf(track.fileName));
  }
  let done = 0;
  for (const entry of await listScopelessEntries()) {
    if (!wanted.has(entry.filename)) continue;
    if (await renderOnce(entry)) done++;
  }
  return done;
}

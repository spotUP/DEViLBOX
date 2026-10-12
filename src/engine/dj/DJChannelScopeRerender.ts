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
import { scopelessOriginOf, releaseChannelStems, type ChannelScopeTrack, type ScopelessOrigin } from './channelScopeTrack';
import { cacheFreeBytes, getCachedEntryByHash, listScopelessEntries, sidOverridesOfKey } from './DJAudioCache';
import { getDJPipeline } from './DJPipeline';
import { getDJEngineIfActive } from './DJEngine';
import type { DeckId } from './DeckEngine';

const DECK_IDS: readonly DeckId[] = ['A', 'B', 'C'];
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
      // The entry's own SID Settings (its key), so the track lines up with the audio it was rendered with.
      return getDJPipeline().renderChannelScopes(entry.sourceData, entry.filename, entry.duration, undefined, sidOverridesOfKey(entry.hash));
    })().catch((err) => {
      console.warn(`[DJChannelScopeRerender] ${origin.filename}:`, err);
      return undefined;
    });
    renders.set(origin.hash, render);
  }
  return render;
}

/**
 * `wav` was just loaded on a deck: when it came from an old-shape cache
 * entry, queue its scope re-render (once) and, when it finishes, attach the
 * track to every deck still holding that WAV. True when attached.
 */
export async function requestChannelScopeRerender(wav: ArrayBuffer): Promise<boolean> {
  const origin = scopelessOriginOf(wav);
  if (!origin) return false;
  const track = await renderOnce(origin);
  if (!track) return false;
  // Every deck holding this WAV gets the track: the one it was loaded on and any double of it.
  const engine = getDJEngineIfActive();
  let attached = false;
  for (const id of DECK_IDS) {
    try { if (await engine?.getDeck(id).attachLateChannelScopes(wav, track)) attached = true; } catch { /* no such deck */ }
  }
  // Every deck holding the WAV has its stem buffer now; the cache entry keeps the int16 copy
  // (the session map of renders would otherwise hold it for good).
  releaseChannelStems(track);
  return attached;
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
    // A background pass never evicts: the stems (up to ~4x the WAV, 16-bit stereo at 44.1 kHz)
    // must fit in the room the cache has, or the pass stops. A deck load still re-renders its own track.
    const stemBytes = 4 * entry.duration * 44100 * 4;
    if ((await cacheFreeBytes()) < stemBytes) {
      console.log(`[DJChannelScopeRerender] cache full, background pass stops before ${entry.filename}`);
      break;
    }
    if (await renderOnce(entry)) done++;
  }
  return done;
}

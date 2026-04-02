/**
 * DJPlaylistPrecache — batch download + render + cache all tracks in a playlist.
 *
 * Run this before a gig to ensure every track can play offline.
 * Downloads from Modland, renders through DJPipeline, stores in IndexedDB.
 * Tracks already cached are skipped.
 */

import { useDJPlaylistStore } from '@/stores/useDJPlaylistStore';
import { getCachedFilenames, cacheSourceFile } from './DJAudioCache';
import { getDJPipeline } from './DJPipeline';
import { isAudioFile } from '@/lib/audioFileUtils';

export interface PrecacheProgress {
  current: number;
  total: number;
  cached: number;
  failed: number;
  skipped: number;
  trackName: string;
  status: 'checking' | 'downloading' | 'rendering' | 'cached' | 'skipped' | 'error';
}

export interface PrecacheResult {
  cached: number;
  failed: number;
  skipped: number;
  total: number;
}

/**
 * Pre-cache all Modland tracks in a playlist for offline playback.
 * Skips tracks already cached. Downloads raw module, renders to WAV,
 * stores both source + rendered audio in IndexedDB.
 */
export async function precachePlaylist(
  playlistId: string,
  onProgress?: (progress: PrecacheProgress) => void,
): Promise<PrecacheResult> {
  const store = useDJPlaylistStore.getState();
  const playlist = store.playlists.find(p => p.id === playlistId);
  if (!playlist) return { cached: 0, failed: 0, skipped: 0, total: 0 };

  const modlandTracks = playlist.tracks
    .map((track, index) => ({ track, index }))
    .filter(({ track }) => track.fileName.startsWith('modland:'));

  if (modlandTracks.length === 0) return { cached: 0, failed: 0, skipped: 0, total: 0 };

  const total = modlandTracks.length;
  let cached = 0;
  let failed = 0;
  let skipped = 0;

  // Batch check which tracks are already cached
  onProgress?.({ current: 0, total, cached: 0, failed: 0, skipped: 0, trackName: 'Checking cache...', status: 'checking' });
  const cachedNames = await getCachedFilenames();

  console.log(`[Precache] Starting: ${total} tracks, ${cachedNames.size} already cached`);

  for (const { track } of modlandTracks) {
    const modlandPath = track.fileName.slice('modland:'.length);
    const filename = modlandPath.split('/').pop() || 'unknown';
    const processed = cached + failed + skipped;

    // Check if already cached (by filename match)
    if (cachedNames.has(filename)) {
      skipped++;
      onProgress?.({ current: processed + 1, total, cached, failed, skipped, trackName: track.trackName, status: 'skipped' });
      continue;
    }

    // Throttle to avoid Modland rate limiting
    if (processed > 0) {
      await new Promise(r => setTimeout(r, 4000));
    }

    onProgress?.({ current: processed + 1, total, cached, failed, skipped, trackName: track.trackName, status: 'downloading' });

    try {
      // Download with retry on rate limit
      const { downloadModlandFile } = await import('@/lib/modlandApi');
      let buffer: ArrayBuffer;
      let retries = 0;
      while (true) {
        try {
          buffer = await downloadModlandFile(modlandPath);
          break;
        } catch (dlErr) {
          const msg = dlErr instanceof Error ? dlErr.message : String(dlErr);
          if (msg.includes('Rate limited') || msg.includes('429')) {
            retries++;
            if (retries > 8) throw dlErr;
            const wait = Math.min(60000, 5000 * Math.pow(2, retries - 1));
            await new Promise(r => setTimeout(r, wait));
            continue;
          }
          throw dlErr;
        }
      }

      // Cache the raw source file first (so we have it even if render fails)
      await cacheSourceFile(buffer, filename);

      // Render through pipeline (this also caches the WAV + analysis)
      onProgress?.({ current: processed + 1, total, cached, failed, skipped, trackName: track.trackName, status: 'rendering' });

      if (!isAudioFile(filename)) {
        await getDJPipeline().loadOrEnqueue(buffer, filename, undefined, 'low');
      }

      cached++;
      cachedNames.add(filename); // Mark as cached for subsequent checks
      onProgress?.({ current: cached + failed + skipped, total, cached, failed, skipped, trackName: track.trackName, status: 'cached' });
      console.log(`[Precache] ${cached + failed + skipped}/${total} — ${track.trackName} cached`);
    } catch (err) {
      failed++;
      console.warn(`[Precache] ${cached + failed + skipped}/${total} FAIL — ${track.trackName}:`, err);
      onProgress?.({ current: cached + failed + skipped, total, cached, failed, skipped, trackName: track.trackName, status: 'error' });
    }
  }

  console.log(`[Precache] Complete — ${cached} cached, ${skipped} already cached, ${failed} failed out of ${total}`);
  return { cached, failed, skipped, total };
}

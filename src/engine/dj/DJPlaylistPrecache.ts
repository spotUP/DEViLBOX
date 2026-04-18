/**
 * DJPlaylistPrecache — batch download + render + cache all tracks in a playlist.
 *
 * Run this before a gig to ensure every track can play offline.
 * Downloads from Modland/HVSC, renders through DJPipeline, stores in IndexedDB.
 * Tracks already cached are skipped.
 */

import { useDJPlaylistStore } from '@/stores/useDJPlaylistStore';
import { getCachedFilenames, cacheSourceFile } from './DJAudioCache';
import { getDJPipeline } from './DJPipeline';
import { isAudioFile } from '@/lib/audioFileUtils';
import { searchModland } from '@/lib/modlandApi';

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

  const onlineTracks = playlist.tracks
    .map((track, index) => ({ track, index }))
    .filter(({ track }) => track.fileName.startsWith('modland:') || track.fileName.startsWith('hvsc:'));

  if (onlineTracks.length === 0) return { cached: 0, failed: 0, skipped: 0, total: 0 };

  const total = onlineTracks.length;
  let cached = 0;
  let failed = 0;
  let skipped = 0;

  // Batch check which tracks are already cached
  onProgress?.({ current: 0, total, cached: 0, failed: 0, skipped: 0, trackName: 'Checking cache...', status: 'checking' });
  const cachedNames = await getCachedFilenames();

  console.log(`[Precache] Starting: ${total} tracks, ${cachedNames.size} already cached`);

  let consecutiveNetworkFailures = 0;
  const MAX_CONSECUTIVE_NETWORK_FAILURES = 5;

  for (const { track, index } of onlineTracks) {
    const isHVSC = track.fileName.startsWith('hvsc:');
    const remotePath = isHVSC
      ? track.fileName.slice('hvsc:'.length)
      : track.fileName.slice('modland:'.length);
    const filename = remotePath.split('/').pop() || 'unknown';
    const processed = cached + failed + skipped;

    if (cachedNames.has(filename)) {
      skipped++;
      onProgress?.({ current: processed + 1, total, cached, failed, skipped, trackName: track.trackName, status: 'skipped' });
      continue;
    }

    if (processed > 0) {
      await new Promise(r => setTimeout(r, isHVSC ? 500 : 4000));
    }

    onProgress?.({ current: processed + 1, total, cached, failed, skipped, trackName: track.trackName, status: 'downloading' });

    try {
      let buffer: ArrayBuffer;

      if (isHVSC) {
        // HVSC: simple download, no retry/auto-fix logic needed
        const { downloadHVSCFile } = await import('@/lib/hvscApi');
        buffer = await downloadHVSCFile(remotePath);
      } else {
        // Modland: download with rate-limit retry and 404 auto-fix
        const { downloadModlandFile } = await import('@/lib/modlandApi');
        let retries = 0;
        let currentPath = remotePath;
        
        while (true) {
          try {
            buffer = await downloadModlandFile(currentPath);
            break;
          } catch (dlErr) {
            const msg = dlErr instanceof Error ? dlErr.message : String(dlErr);
            
            // Handle rate limiting
            if (msg.includes('Rate limited') || msg.includes('429')) {
              retries++;
              if (retries > 8) throw dlErr;
              const wait = Math.min(60000, 5000 * Math.pow(2, retries - 1));
              await new Promise(r => setTimeout(r, wait));
              continue;
            }
            
            // Handle 404: search Modland and auto-fix
            if (msg.includes('404')) {
              console.log(`[Precache] 404 for ${filename} — searching Modland...`);
              try {
                const nameNoExt = filename.replace(/\.[^.]+$/, '');
                let selectedPath: string | null = null;
                
                // Try exact filename first, then fuzzy (name without extension)
                for (const query of [filename, nameNoExt]) {
                  const results = await searchModland({ q: query, limit: 10 });
                  if (results.results.length > 0) {
                    // Auto-fix with best match (shortest path = most likely)
                    selectedPath = results.results[0].full_path;
                    console.log(`[Precache] Auto-fix 404: ${selectedPath}`);
                    break;
                  }
                  await new Promise(r => setTimeout(r, 1000));
                }
                
                if (selectedPath) {
                  const newFileName = `modland:${selectedPath}`;
                  store.updateTrackMeta(playlistId, index, { fileName: newFileName });
                  currentPath = selectedPath;
                  await new Promise(r => setTimeout(r, 2000));
                  continue; // retry download with new path
                }
              } catch { /* search failed, fall through */ }
            }
            
            throw dlErr;
          }
        }
      }

      consecutiveNetworkFailures = 0;
      await cacheSourceFile(buffer, filename);

      // Modland-specific companion files
      if (!isHVSC) {
        // Check for TFMX companion file (mdat.* needs smpl.*)
        if (filename.toLowerCase().startsWith('mdat.')) {
          try {
            const { downloadTFMXCompanion } = await import('@/lib/modlandApi');
            const companion = await downloadTFMXCompanion(remotePath);
            if (companion) {
              await cacheSourceFile(companion.buffer, companion.filename);
              console.log(`[Precache] Cached TFMX companion: ${companion.filename}`);
            }
          } catch (companionErr) {
            console.warn(`[Precache] TFMX companion download failed (non-fatal):`, companionErr);
          }
        }

        // Check for UADE companion files (Sonix, Jason Page, MFP, etc.)
        try {
          const { downloadUADECompanions } = await import('@/lib/modlandApi');
          // Pass the main buffer so Startrekker-AM detection can gate the
          // .nt probe; avoids a harmless 404 per plain ProTracker MOD.
          const companions = await downloadUADECompanions(remotePath, buffer);
          for (const companion of companions) {
            await cacheSourceFile(companion.buffer, companion.filename);
            console.log(`[Precache] Cached UADE companion: ${companion.filename}`);
          }
        } catch (companionErr) {
          console.warn(`[Precache] UADE companion download failed (non-fatal):`, companionErr);
        }
      }

      onProgress?.({ current: processed + 1, total, cached, failed, skipped, trackName: track.trackName, status: 'rendering' });

      if (!isAudioFile(filename)) {
        await getDJPipeline().loadOrEnqueue(buffer, filename, undefined, 'low');
      }

      cached++;
      cachedNames.add(filename);
      onProgress?.({ current: cached + failed + skipped, total, cached, failed, skipped, trackName: track.trackName, status: 'cached' });
      console.log(`[Precache] ${cached + failed + skipped}/${total} — ${track.trackName} cached`);
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      const isNetworkError = msg.includes('Failed to fetch') || msg.includes('NetworkError') || !navigator.onLine;
      if (isNetworkError) {
        consecutiveNetworkFailures++;
        if (consecutiveNetworkFailures >= MAX_CONSECUTIVE_NETWORK_FAILURES) {
          console.error(`[Precache] Server unreachable — aborting after ${consecutiveNetworkFailures} consecutive network failures`);
          onProgress?.({ current: cached + failed + skipped, total, cached, failed, skipped, trackName: 'Server unreachable', status: 'error' });
          break;
        }
      } else {
        consecutiveNetworkFailures = 0;
      }
      console.warn(`[Precache] ${cached + failed + skipped}/${total} FAIL — ${track.trackName}:`, err);
      
      // Mark track as bad so it shows in the Re-test Bad list
      store.markTrackBad(playlistId, index, msg);
      
      onProgress?.({ current: cached + failed + skipped, total, cached, failed, skipped, trackName: track.trackName, status: 'error' });
    }
  }

  console.log(`[Precache] Complete — ${cached} cached, ${skipped} already cached, ${failed} failed out of ${total}`);
  return { cached, failed, skipped, total };
}

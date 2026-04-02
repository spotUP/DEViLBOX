/**
 * DJPlaylistAnalyzer — Batch analysis of playlist tracks for Auto DJ metadata
 *
 * Downloads each Modland track, renders through DJPipeline to get BPM/key/energy,
 * updates the playlist store with the analysis results, then evicts the cached WAV
 * to avoid filling the drive.
 *
 * Used by Auto DJ to ensure smart sort has the metadata it needs.
 */

import { useDJPlaylistStore, type PlaylistTrack, type DJPlaylist } from '@/stores/useDJPlaylistStore';

export interface AnalysisProgress {
  current: number;
  total: number;
  trackName: string;
  status: 'analyzing' | 'done' | 'skipped' | 'error';
}

/**
 * Check if a playlist track is missing metadata needed for smart sorting.
 */
export function trackNeedsAnalysis(track: PlaylistTrack): boolean {
  return track.bpm === 0 || !track.musicalKey || track.energy == null;
}

/**
 * Check if any track in a playlist needs analysis.
 */
export function playlistNeedsAnalysis(playlist: DJPlaylist): boolean {
  return playlist.tracks.some(trackNeedsAnalysis);
}

/**
 * Batch-analyze all tracks in a playlist that are missing BPM/key/energy.
 *
 * - Downloads Modland tracks one at a time
 * - Renders + analyzes via DJPipeline
 * - Updates playlist store with BPM, musicalKey, energy, duration
 * - Evicts cached WAV after extracting metadata to save disk space
 *
 * @param playlistId - The playlist to analyze
 * @param onProgress - Optional callback for UI progress updates
 * @returns Number of tracks successfully analyzed
 */
export async function analyzePlaylist(
  playlistId: string,
  onProgress?: (progress: AnalysisProgress) => void,
): Promise<number> {
  const store = useDJPlaylistStore.getState();
  const playlist = store.playlists.find(p => p.id === playlistId);
  if (!playlist) return 0;

  const tracksToAnalyze = playlist.tracks
    .map((track, index) => ({ track, index }))
    .filter(({ track }) => trackNeedsAnalysis(track) && track.fileName.startsWith('modland:'));

  if (tracksToAnalyze.length === 0) return 0;

  const total = tracksToAnalyze.length;
  let analyzed = 0;

  console.log(`[PlaylistAnalyzer] Analyzing ${total} tracks in "${playlist.name}"`);

  for (const { track, index } of tracksToAnalyze) {
    const modlandPath = track.fileName.slice('modland:'.length);
    const filename = modlandPath.split('/').pop() || 'download.mod';

    onProgress?.({ current: analyzed + 1, total, trackName: track.trackName, status: 'analyzing' });

    try {
      // Throttle downloads to avoid Modland 429 rate limiting.
      // Modland allows ~15 requests/minute. With render time (~5-15s per track)
      // we need ~4s gap between downloads to stay safe.
      if (analyzed > 0) {
        await new Promise(r => setTimeout(r, 4000));
      }

      // Download with retry on rate limit (429)
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
            console.log(`[PlaylistAnalyzer] Rate limited, waiting ${wait / 1000}s (retry ${retries}/5)...`);
            await new Promise(r => setTimeout(r, wait));
            continue;
          }
          throw dlErr;
        }
      }

      // Send to server-side headless renderer for analysis.
      // The browser-side UADE render worker has a persistent IPC bug
      // ("cmd buffer full"), so we use the Express server's Node.js UADE
      // instance which works correctly.
      const serverBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(
        `${serverBase}/render/analyze?filename=${encodeURIComponent(filename)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: buffer,
        },
      );

      if (!response.ok) {
        const errText = await response.text().catch(() => 'unknown');
        throw new Error(`Server render failed (${response.status}): ${errText}`);
      }

      const result = await response.json() as {
        bpm: number;
        musicalKey: string;
        energy: number;
        duration: number;
      };

      // Update the playlist track with analysis results
      const meta: Partial<Pick<PlaylistTrack, 'bpm' | 'musicalKey' | 'energy' | 'duration'>> = {};
      if (result.bpm > 0) meta.bpm = result.bpm;
      if (result.musicalKey) meta.musicalKey = result.musicalKey;
      if (result.energy != null) meta.energy = result.energy;
      if (result.duration > 0) meta.duration = result.duration;

      if (Object.keys(meta).length > 0) {
        useDJPlaylistStore.getState().updateTrackMeta(playlistId, index, meta);
      }

      analyzed++;
      onProgress?.({ current: analyzed, total, trackName: track.trackName, status: 'done' });
      console.log(`[PlaylistAnalyzer] ${analyzed}/${total} — ${track.trackName}: BPM=${result.bpm}, key=${result.musicalKey ?? '?'}, energy=${result.energy?.toFixed(2) ?? '?'}`);
    } catch (err) {
      console.error(`[PlaylistAnalyzer] Failed to analyze ${track.trackName}:`, err);
      onProgress?.({ current: analyzed + 1, total, trackName: track.trackName, status: 'error' });
    }
  }

  console.log(`[PlaylistAnalyzer] Complete — ${analyzed}/${total} tracks analyzed`);
  return analyzed;
}

/**
 * Analyze ALL playlists that have tracks missing metadata.
 * Processes playlists sequentially, tracks within each playlist sequentially.
 */
export async function analyzeAllPlaylists(
  onProgress?: (playlistName: string, progress: AnalysisProgress) => void,
): Promise<number> {
  const store = useDJPlaylistStore.getState();
  let totalAnalyzed = 0;

  for (const playlist of store.playlists) {
    if (!playlistNeedsAnalysis(playlist)) continue;

    const count = await analyzePlaylist(
      playlist.id,
      (p) => onProgress?.(playlist.name, p),
    );
    totalAnalyzed += count;
  }

  return totalAnalyzed;
}

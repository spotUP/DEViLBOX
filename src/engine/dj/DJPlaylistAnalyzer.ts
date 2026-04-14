/**
 * DJPlaylistAnalyzer — Batch analysis of playlist tracks for Auto DJ metadata
 *
 * Downloads each Modland/HVSC track, renders through DJPipeline to get BPM/key/energy,
 * updates the playlist store with the analysis results, then evicts the cached WAV
 * to avoid filling the drive.
 *
 * Used by Auto DJ to ensure smart sort has the metadata it needs.
 */

import { useDJPlaylistStore, type PlaylistTrack, type DJPlaylist } from '@/stores/useDJPlaylistStore';

export interface AnalysisProgress {
  current: number;     // tracks processed so far (success + fail)
  total: number;
  analyzed: number;    // successful analyses
  failed: number;      // failed analyses
  trackName: string;
  status: 'analyzing' | 'done' | 'skipped' | 'error';
}

export interface AnalysisFailure {
  trackName: string;
  fileName: string;
  reason: string;
}

export interface AnalysisResult {
  analyzed: number;
  failed: number;
  total: number;
  failures: AnalysisFailure[];
}

/** Candidate from Modland search when a 404 track needs manual resolution */
export interface ModlandFixCandidate {
  filename: string;
  full_path: string;
  format: string;
  author: string;
}

/** Callback for when the analyzer finds multiple Modland matches for a 404 track.
 *  Return the selected candidate's full_path, or null to skip. */
export type OnFixNeeded = (
  trackName: string,
  originalPath: string,
  candidates: ModlandFixCandidate[],
) => Promise<string | null>;

/**
 * Check if a playlist track is missing metadata needed for smart sorting.
 */
export function trackNeedsAnalysis(track: PlaylistTrack): boolean {
  if (track.analysisSkipped) return false;
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
 * @param onFixNeeded - Optional callback when a 404 track has multiple Modland candidates
 * @returns Analysis result with counts and failure report
 */
export async function analyzePlaylist(
  playlistId: string,
  onProgress?: (progress: AnalysisProgress) => void,
  onFixNeeded?: OnFixNeeded,
): Promise<AnalysisResult> {
  const store = useDJPlaylistStore.getState();
  const playlist = store.playlists.find(p => p.id === playlistId);
  if (!playlist) return { analyzed: 0, failed: 0, total: 0, failures: [] };

  const tracksToAnalyze = playlist.tracks
    .map((track, index) => ({ track, index }))
    .filter(({ track }) => trackNeedsAnalysis(track) && (track.fileName.startsWith('modland:') || track.fileName.startsWith('hvsc:')));

  if (tracksToAnalyze.length === 0) return { analyzed: 0, failed: 0, total: 0, failures: [] } as AnalysisResult;

  const total = tracksToAnalyze.length;
  let analyzed = 0;
  let failed = 0;
  const failures: AnalysisFailure[] = [];
  let consecutiveNetworkFailures = 0;
  const MAX_CONSECUTIVE_NETWORK_FAILURES = 5;

  console.log(`[PlaylistAnalyzer] Analyzing ${total} tracks in "${playlist.name}"`);

  for (const { track, index } of tracksToAnalyze) {
    const isHVSC = track.fileName.startsWith('hvsc:');
    const remotePath = isHVSC
      ? track.fileName.slice('hvsc:'.length)
      : track.fileName.slice('modland:'.length);
    const filename = remotePath.split('/').pop() || 'download.mod';
    const processed = analyzed + failed;

    onProgress?.({ current: processed + 1, total, analyzed, failed, trackName: track.trackName, status: 'analyzing' });

    try {
      // Throttle downloads (Modland needs 4s; HVSC is fine with less)
      await new Promise(r => setTimeout(r, isHVSC ? 500 : 4000));

      let buffer: ArrayBuffer;

      if (isHVSC) {
        // HVSC: simple download
        const { downloadHVSCFile } = await import('@/lib/hvscApi');
        buffer = await downloadHVSCFile(remotePath);
      } else {
        // Download with retry on rate limit (429) and auto-fix on 404
        const { downloadModlandFile, searchModland } = await import('@/lib/modlandApi');
        let currentPath = remotePath;
        let retries = 0;
        while (true) {
          try {
            buffer = await downloadModlandFile(currentPath);
            break;
          } catch (dlErr) {
            const msg = dlErr instanceof Error ? dlErr.message : String(dlErr);
            if (msg.includes('Rate limited') || msg.includes('429')) {
              retries++;
              if (retries > 8) throw dlErr;
              const wait = Math.min(60000, 5000 * Math.pow(2, retries - 1));
              console.log(`[PlaylistAnalyzer] Rate limited, waiting ${wait / 1000}s (retry ${retries}/8)...`);
              await new Promise(r => setTimeout(r, wait));
              continue;
            }
            // On 404: search Modland for the filename and auto-fix the playlist link
            if (msg.includes('404')) {
              console.log(`[PlaylistAnalyzer] 404 for ${filename} — searching Modland...`);
              try {
                // Try exact filename first, then fuzzy (name without extension)
                const nameNoExt = filename.replace(/\.[^.]+$/, '');
                let candidates: ModlandFixCandidate[] = [];

                for (const query of [filename, nameNoExt]) {
                  const results = await searchModland({ q: query, limit: 10 });
                  if (results.results.length > 0) {
                    candidates = results.results.map(r => ({
                      filename: r.filename,
                      full_path: r.full_path,
                      format: r.format,
                      author: r.author,
                    }));
                    break;
                  }
                  await new Promise(r => setTimeout(r, 1000)); // throttle between searches
                }

                if (candidates.length > 0) {
                  let selectedPath: string | null = null;

                  if (candidates.length === 1) {
                    // Single match — auto-fix
                    selectedPath = candidates[0].full_path;
                    console.log(`[PlaylistAnalyzer] Auto-fix: ${selectedPath}`);
                  } else if (onFixNeeded) {
                    // Multiple matches — let user choose
                    selectedPath = await onFixNeeded(track.trackName, remotePath, candidates);
                  } else {
                    // No UI callback — pick best match (shortest path = most likely)
                    selectedPath = candidates[0].full_path;
                    console.log(`[PlaylistAnalyzer] Auto-fix (best guess): ${selectedPath}`);
                  }

                  if (selectedPath) {
                    const newFileName = `modland:${selectedPath}`;
                    useDJPlaylistStore.getState().updateTrackMeta(playlistId, index, { fileName: newFileName });
                    currentPath = selectedPath;
                    await new Promise(r => setTimeout(r, 2000));
                    continue; // retry download with new path
                  }
                }
              } catch { /* search failed, fall through */ }
            }
            throw dlErr;
          }
        }
      }

      // Send to server-side headless renderer for analysis.
      const serverBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';

      // Detect TFMX companion file: mdat.* needs smpl.* from same directory
      let companionParam = '';
      if (!isHVSC) {
        const baseName = filename.toLowerCase();
        if (baseName.startsWith('mdat.')) {
          const smplName = 'smpl.' + filename.slice(5);
          const dirPath = remotePath.split('/').slice(0, -1).join('/');
          companionParam = `&companion=${encodeURIComponent(dirPath + '/' + smplName)}`;
        }
      }

      const response = await fetch(
        `${serverBase}/render/analyze?filename=${encodeURIComponent(filename)}${companionParam}`,
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

      consecutiveNetworkFailures = 0; // Reset on success
      analyzed++;
      const done = analyzed + failed;
      onProgress?.({ current: done, total, analyzed, failed, trackName: track.trackName, status: 'done' });
      console.log(`[PlaylistAnalyzer] ${done}/${total} (${analyzed} ok, ${failed} fail) — ${track.trackName}: BPM=${result.bpm}, key=${result.musicalKey ?? '?'}, energy=${result.energy?.toFixed(2) ?? '?'}`);
    } catch (err) {
      failed++;
      const reason = err instanceof Error ? err.message : String(err);
      
      // Check for network failures (server down, fetch failed, offline)
      const isNetworkError = reason.includes('Failed to fetch') || reason.includes('NetworkError') || !navigator.onLine;
      if (isNetworkError) {
        consecutiveNetworkFailures++;
        if (consecutiveNetworkFailures >= MAX_CONSECUTIVE_NETWORK_FAILURES) {
          console.error(`[PlaylistAnalyzer] Server unreachable — aborting after ${consecutiveNetworkFailures} consecutive network failures`);
          onProgress?.({ current: analyzed + failed, total, analyzed, failed, trackName: 'Server unreachable', status: 'error' });
          break; // Abort the loop
        }
      } else {
        consecutiveNetworkFailures = 0; // Reset on non-network errors (404, parse errors, etc.)
      }
      
      failures.push({ trackName: track.trackName, fileName: track.fileName, reason });
      // Mark as skipped so it won't be re-scanned next time
      useDJPlaylistStore.getState().updateTrackMeta(playlistId, index, { analysisSkipped: true });
      const done = analyzed + failed;
      onProgress?.({ current: done, total, analyzed, failed, trackName: track.trackName, status: 'error' });
      console.warn(`[PlaylistAnalyzer] ${done}/${total} FAIL — ${track.trackName}: ${reason}`);
    }
  }

  console.log(`[PlaylistAnalyzer] Complete — ${analyzed} analyzed, ${failed} failed out of ${total}`);
  if (failures.length > 0) {
    console.group('[PlaylistAnalyzer] Failure report:');
    for (const f of failures) {
      console.log(`  ${f.trackName}: ${f.reason}`);
    }
    console.groupEnd();
  }
  return { analyzed, failed, total, failures };
}

/**
 * Analyze ALL playlists that have tracks missing metadata.
 * Processes playlists sequentially, tracks within each playlist sequentially.
 */
export async function analyzeAllPlaylists(
  onProgress?: (playlistName: string, progress: AnalysisProgress) => void,
): Promise<AnalysisResult> {
  const store = useDJPlaylistStore.getState();
  let totalAnalyzed = 0;
  let totalFailed = 0;
  let totalCount = 0;
  const allFailures: AnalysisFailure[] = [];

  for (const playlist of store.playlists) {
    if (!playlistNeedsAnalysis(playlist)) continue;

    const result = await analyzePlaylist(
      playlist.id,
      (p) => onProgress?.(playlist.name, p),
    );
    totalAnalyzed += result.analyzed;
    totalFailed += result.failed;
    totalCount += result.total;
    allFailures.push(...result.failures);
  }

  return { analyzed: totalAnalyzed, failed: totalFailed, total: totalCount, failures: allFailures };
}

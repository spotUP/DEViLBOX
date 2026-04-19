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
import { cacheSourceFile, getCachedAudioByFilename } from './DJAudioCache';
import { getDJPipeline } from './DJPipeline';
import { isAudioFile } from '@/lib/audioFileUtils';

// ── Concurrency guard ────────────────────────────────────────────────────────
// Clicking "Analyze" twice on the same playlist used to spawn two loops that
// both wrote to the store with stale indices and doubled the Modland traffic.
// Module-level set so the guard survives React re-renders.
const inflightAnalyses = new Set<string>();

/** Whether analyzePlaylist is currently running for the given playlist id. */
export function isAnalysisInflight(playlistId: string): boolean {
  return inflightAnalyses.has(playlistId);
}

// Per-track server render timeout (ms). The /render/analyze endpoint can hang
// indefinitely on a malformed file or stuck emulator — without this, one sick
// track stalls the whole run. 60 s is generous: most tracks render in <5 s.
const SERVER_RENDER_TIMEOUT_MS = 60_000;

/**
 * Sleep that rejects immediately on AbortSignal instead of waiting out the
 * timer. All analyzer delays (4 s Modland throttle, 1 s search throttle,
 * 2 s retry pause, 60 s rate-limit backoff) route through this so hitting
 * "cancel" doesn't make the user sit through a full throttle window.
 */
function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('Aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

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
 * Check if a track has a remote source that allows server-side analysis.
 */
export function trackHasRemoteSource(track: PlaylistTrack): boolean {
  return track.fileName.startsWith('modland:') || track.fileName.startsWith('hvsc:');
}

/**
 * Check if a playlist track is missing metadata AND can be analyzed.
 * Only remote tracks (modland:/hvsc:) can be analyzed — local files
 * already had BPM detected at import time and can't be re-downloaded.
 *
 * Only BPM is required — it's the primary field that gates Auto DJ
 * sync. Key/energy are nice-to-have (smart sort, transition-type
 * selection) but missing them shouldn't force a re-download, otherwise
 * a server that can't extract key for a given format would cause
 * infinite re-analysis loops on every button click.
 */
export function trackNeedsAnalysis(track: PlaylistTrack): boolean {
  if (track.analysisSkipped) return false;
  if (!trackHasRemoteSource(track)) return false;
  return track.bpm === 0;
}

/**
 * Filter for the normal (non-forced) click path. Same as trackNeedsAnalysis —
 * respects analysisSkipped so tracks that fail persistently (e.g. a 422 from
 * the server's SID renderer for a specific file) don't get retried on every
 * Analyze click, burning Modland's 4s/track throttle.
 *
 * To explicitly retry skipped tracks: use the "Re-analyze all" option
 * (force=true in analyzePlaylist), which bypasses both BPM and skipped
 * checks for every remote track.
 */
function trackShouldAnalyzeOnClick(track: PlaylistTrack): boolean {
  return trackNeedsAnalysis(track);
}

/**
 * Check if any track in a playlist needs analysis.
 */
export function playlistNeedsAnalysis(playlist: DJPlaylist): boolean {
  return playlist.tracks.some(trackNeedsAnalysis);
}

/**
 * Count of tracks currently marked as failed (analysisSkipped=true with
 * a remote source). Drives the "Retry failed" menu visibility/label.
 */
export function playlistFailedAnalysisCount(playlist: DJPlaylist): number {
  return playlist.tracks.filter(t => trackHasRemoteSource(t) && t.analysisSkipped).length;
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
 * @param opts.force - Bypass the needs-analysis filter (re-analyze everything)
 * @param opts.signal - AbortSignal to cancel an in-progress run mid-track
 * @returns Analysis result with counts and failure report
 */
export async function analyzePlaylist(
  playlistId: string,
  onProgress?: (progress: AnalysisProgress) => void,
  onFixNeeded?: OnFixNeeded,
  opts?: { force?: boolean; retryFailed?: boolean; trackIds?: string[]; signal?: AbortSignal },
): Promise<AnalysisResult> {
  // ── Concurrency guard ──────────────────────────────────────────────────
  // Second caller for the same playlist gets an empty result. Running two
  // loops at once used to produce stale-index writes + doubled Modland
  // traffic (each loop hit every track's 4 s throttle independently).
  if (inflightAnalyses.has(playlistId)) {
    console.warn(`[PlaylistAnalyzer] Already analyzing ${playlistId} — ignoring duplicate call`);
    return { analyzed: 0, failed: 0, total: 0, failures: [] };
  }

  const initialPlaylist = useDJPlaylistStore.getState().playlists.find(p => p.id === playlistId);
  if (!initialPlaylist) return { analyzed: 0, failed: 0, total: 0, failures: [] };

  // Capture track *ids* (not indices) so playlist edits during analysis don't
  // cause metadata writes to land on the wrong row. Indices are resolved
  // freshly against the live store on every read/write below.
  //
  // Four filter modes in priority order:
  //   trackIds     — specific tracks by id (context-menu "Analyze this
  //                  track" — bypasses every other filter, always runs
  //                  against the named tracks if they have a remote source)
  //   force        — every remote track, regardless of state (expensive,
  //                  used by "Re-analyze all")
  //   retryFailed  — only tracks currently flagged analysisSkipped (used by
  //                  the "Retry failed analyses" menu item; much cheaper
  //                  than force when only a few tracks need another try)
  //   default      — bpm===0 && !analysisSkipped (new scan only)
  const trackIdSet = opts?.trackIds?.length ? new Set(opts.trackIds) : null;
  const filter = (track: PlaylistTrack): boolean => {
    if (trackIdSet) return trackHasRemoteSource(track) && trackIdSet.has(track.id);
    if (opts?.force) return trackHasRemoteSource(track);
    if (opts?.retryFailed) return trackHasRemoteSource(track) && !!track.analysisSkipped;
    return trackShouldAnalyzeOnClick(track);
  };
  const tracksToAnalyze = initialPlaylist.tracks
    .filter(filter)
    .map((track) => ({ trackId: track.id, snapshotName: track.trackName }));

  if (tracksToAnalyze.length === 0) return { analyzed: 0, failed: 0, total: 0, failures: [] } as AnalysisResult;

  /** Re-resolve a track by id against the CURRENT store state. Returns null
   *  if the user deleted the row (or deleted the playlist) since we started. */
  const resolveCurrent = (trackId: string): { index: number; track: PlaylistTrack } | null => {
    const pl = useDJPlaylistStore.getState().playlists.find(p => p.id === playlistId);
    if (!pl) return null;
    const idx = pl.tracks.findIndex(t => t.id === trackId);
    if (idx < 0) return null;
    return { index: idx, track: pl.tracks[idx] };
  };

  inflightAnalyses.add(playlistId);
  try {
    const total = tracksToAnalyze.length;
    let analyzed = 0;
    let failed = 0;
    const failures: AnalysisFailure[] = [];
    let consecutiveNetworkFailures = 0;
    const MAX_CONSECUTIVE_NETWORK_FAILURES = 5;

    console.log(`[PlaylistAnalyzer] Analyzing ${total} tracks in "${initialPlaylist.name}"`);

    for (const { trackId, snapshotName } of tracksToAnalyze) {
      // Honor caller abort (modal closed, user hit cancel, etc.)
      if (opts?.signal?.aborted) {
        console.log('[PlaylistAnalyzer] Aborted by caller');
        break;
      }

      // Re-resolve the track each iteration — the user may have deleted,
      // reordered, or renamed while we were downloading the previous track.
      // If the whole playlist is gone, stop the run entirely.
      const current = resolveCurrent(trackId);
      if (!current) {
        const playlistStillExists = useDJPlaylistStore.getState().playlists.some(p => p.id === playlistId);
        if (!playlistStillExists) {
          console.log('[PlaylistAnalyzer] Playlist deleted mid-run — aborting');
          break;
        }
        // Just this track was removed: move on without counting it.
        continue;
      }
      const track = current.track;
      const isHVSC = track.fileName.startsWith('hvsc:');
      // Extensions the server's UADE renderer cannot handle — these must go
      // through the local DJ pipeline (libopenmpt et al.) instead. UADE is
      // Amiga-formats only (TFMX, MDAT, classic 4-channel MOD, etc.), so
      // FastTracker 2 XM, Impulse Tracker IT, Scream Tracker S3M, and modern
      // MOD variants all 422 on the server.
      const ext = track.fileName.toLowerCase().split('.').pop() || '';
      const needsLocalPipeline = isHVSC || [
        'xm', 'it', 's3m', 'mod', 'mptm', 'umx', 'dbm', 'mo3',
      ].includes(ext);
      // `let` (not `const`) so the 404 auto-fix can rewrite them when it
      // redirects the download to a different Modland path. Downstream code
      // (server analyze query, TFMX companion dir, UADE companion probe)
      // reads these AFTER the download loop, so stale values would point
      // the server + companion fetches at the wrong file.
      let remotePath = isHVSC
        ? track.fileName.slice('hvsc:'.length)
        : track.fileName.slice('modland:'.length);
      let filename = remotePath.split('/').pop() || 'download.mod';
      const processed = analyzed + failed;

      onProgress?.({ current: processed + 1, total, analyzed, failed, trackName: track.trackName, status: 'analyzing' });

      try {
        // Cache check before throttling. If we already have this file
        // locally there will be no Modland request this iteration, so
        // burning 4 s of sleep is pure delay — skip both.
        const cached = await getCachedAudioByFilename(filename).catch(() => null);
        const cachedBuffer = cached?.sourceData && cached.sourceData.byteLength > 0
          ? cached.sourceData
          : null;

        if (!cachedBuffer) {
          await abortableDelay(isHVSC ? 500 : 4000, opts?.signal);
        }

        let buffer: ArrayBuffer;
        if (cachedBuffer) {
          buffer = cachedBuffer;
        } else if (isHVSC) {
          const { downloadHVSCFile } = await import('@/lib/hvscApi');
          buffer = await downloadHVSCFile(remotePath);
        } else {
          // Download with retry on rate limit (429) and auto-fix on 404
          const { downloadModlandFile, searchModland } = await import('@/lib/modlandApi');
          let currentPath = remotePath;
          let retries = 0;
          while (true) {
            if (opts?.signal?.aborted) throw new Error('Aborted');
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
                await abortableDelay(wait, opts?.signal);
                continue;
              }
              // On 404: search Modland for the filename and offer to auto-fix.
              if (msg.includes('404')) {
                console.log(`[PlaylistAnalyzer] 404 for ${filename} — searching Modland...`);
                try {
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
                    await abortableDelay(1000, opts?.signal); // throttle between searches
                  }

                  if (candidates.length > 0) {
                    let selectedPath: string | null = null;

                    if (candidates.length === 1) {
                      // Single match — safe to auto-fix.
                      selectedPath = candidates[0].full_path;
                      console.log(`[PlaylistAnalyzer] Auto-fix: ${selectedPath}`);
                    } else if (onFixNeeded) {
                      // Multiple matches — let the user pick.
                      selectedPath = await onFixNeeded(track.trackName, remotePath, candidates);
                    } else {
                      // Multiple matches but no UI to disambiguate. Do NOT
                      // silently pick candidates[0] — that used to permanently
                      // rewrite the playlist row to the wrong Modland path.
                      // Surface it as a normal 404 failure instead.
                      console.warn(`[PlaylistAnalyzer] ${candidates.length} Modland candidates for ${filename} — skipping (no onFixNeeded callback)`);
                    }

                    if (selectedPath) {
                      const newFileName = `modland:${selectedPath}`;
                      // Re-resolve before writing — row may have moved/been removed.
                      const curr = resolveCurrent(trackId);
                      if (curr) {
                        useDJPlaylistStore.getState().updateTrackMeta(playlistId, curr.index, { fileName: newFileName });
                      }
                      // Update the outer-scope remotePath + filename so
                      // downstream code (server /render/analyze query,
                      // TFMX smpl dirPath, UADE companion probes) uses the
                      // NEW path. Without this, a 404 auto-fix redirect
                      // succeeded at download but poisoned every subsequent
                      // step with the stale original path.
                      currentPath = selectedPath;
                      remotePath = selectedPath;
                      filename = selectedPath.split('/').pop() || filename;
                      await abortableDelay(2000, opts?.signal);
                      continue; // retry download with new path
                    }
                  }
                } catch { /* search failed, fall through */ }
              }
              throw dlErr;
            }
          }
        }

        // Route SIDs through the local pipeline — the server's /render/analyze
        // only has UADE, which can't handle SIDs (every HVSC track was failing
        // with 422). The client-side pipeline has WebSID rendering + Essentia
        // analysis baked in and already returns bpm/musicalKey/energy/duration.
        let result: { bpm: number; musicalKey: string; energy: number; duration: number; rmsDb?: number; peakDb?: number };

        if (needsLocalPipeline) {
          const pipelineResult = await getDJPipeline().loadOrEnqueue(buffer, filename, undefined, 'low');
          if (!pipelineResult.analysis) {
            throw new Error('Local pipeline returned no analysis');
          }
          result = {
            bpm: pipelineResult.analysis.bpm,
            musicalKey: pipelineResult.analysis.musicalKey,
            energy: pipelineResult.analysis.genre?.energy ?? 0,
            duration: pipelineResult.duration,
            rmsDb: pipelineResult.analysis.rmsDb,
            peakDb: pipelineResult.analysis.peakDb,
          };
        } else {
          // Modland tracker formats → server-side UADE (fast, uses server cache).
          // Guarded with AbortController + hard timeout so one sick track
          // can't stall the whole run. Caller signal is forwarded too, so
          // closing the modal cancels in-flight work.
          const serverBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';

          // Detect TFMX companion file: mdat.* needs smpl.* from same directory
          let companionParam = '';
          const baseName = filename.toLowerCase();
          if (baseName.startsWith('mdat.')) {
            const smplName = 'smpl.' + filename.slice(5);
            const dirPath = remotePath.split('/').slice(0, -1).join('/');
            companionParam = `&companion=${encodeURIComponent(dirPath + '/' + smplName)}`;
          }

          const fetchAbort = new AbortController();
          const timeoutId = setTimeout(
            () => fetchAbort.abort(new Error('Server render timeout')),
            SERVER_RENDER_TIMEOUT_MS,
          );
          const onCallerAbort = () => fetchAbort.abort(new Error('Aborted'));
          opts?.signal?.addEventListener('abort', onCallerAbort);

          let response: Response;
          try {
            response = await fetch(
              `${serverBase}/render/analyze?filename=${encodeURIComponent(filename)}${companionParam}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/octet-stream' },
                body: buffer,
                signal: fetchAbort.signal,
              },
            );
          } finally {
            clearTimeout(timeoutId);
            opts?.signal?.removeEventListener('abort', onCallerAbort);
          }

          if (!response.ok) {
            const errText = await response.text().catch(() => 'unknown');
            throw new Error(`Server render failed (${response.status}): ${errText}`);
          }

          result = await response.json() as {
            bpm: number;
            musicalKey: string;
            energy: number;
            duration: number;
          };
        }

        // Update the playlist track with analysis results — by id, so a
        // mid-run reorder doesn't land the write on the wrong row.
        const meta: Partial<Pick<PlaylistTrack, 'bpm' | 'musicalKey' | 'energy' | 'duration' | 'rmsDb' | 'peakDb'>> = {};
        if (result.bpm > 0) meta.bpm = result.bpm;
        if (result.musicalKey) meta.musicalKey = result.musicalKey;
        if (result.energy != null) meta.energy = result.energy;
        if (result.duration > 0) meta.duration = result.duration;
        // HVSC path: loudness comes from the same pipeline call. Modland gets
        // these via the piggyback render further down (server doesn't return
        // rmsDb). Either way, persisting to the track lets DJTrackLoader /
        // DJPlaylistModal apply auto-gain even when the IndexedDB cache is
        // cold (e.g. after a cache eviction or on a different device).
        if (result.rmsDb != null) meta.rmsDb = result.rmsDb;
        if (result.peakDb != null) meta.peakDb = result.peakDb;

        if (Object.keys(meta).length > 0) {
          const curr = resolveCurrent(trackId);
          if (curr) {
            useDJPlaylistStore.getState().updateTrackMeta(playlistId, curr.index, { ...meta, analysisSkipped: false });
          }
        }

        // We already have the buffer downloaded — piggyback the precache work
        // so first play is instant after analysis. Without this, users had to
        // run Analyze AND Cache separately, each re-downloading every track.
        // Failures here don't fail the analysis — metadata is the important bit.
        // For HVSC we already called loadOrEnqueue to analyze; that same call
        // caches the rendered WAV, so skip the duplicate render here.
        try {
          await cacheSourceFile(buffer, filename);
          if (!isAudioFile(filename) && !isHVSC) {
            const piggybackResult = await getDJPipeline().loadOrEnqueue(buffer, filename, undefined, 'low');
            // Capture loudness from the local render for Modland tracks —
            // the server's /render/analyze response only returns bpm / key /
            // energy / duration, so without this the track has no rmsDb for
            // auto-gain normalization. Save alongside the server metadata.
            if (piggybackResult.analysis) {
              const curr2 = resolveCurrent(trackId);
              if (curr2) {
                useDJPlaylistStore.getState().updateTrackMeta(playlistId, curr2.index, {
                  rmsDb: piggybackResult.analysis.rmsDb,
                  peakDb: piggybackResult.analysis.peakDb,
                });
              }
            }
          }
          // Grab companion files too (TFMX mdat needs smpl; UADE multi-file formats)
          if (!isHVSC) {
            const lcName = filename.toLowerCase();
            if (lcName.startsWith('mdat.')) {
              try {
                const { downloadTFMXCompanion } = await import('@/lib/modlandApi');
                const companion = await downloadTFMXCompanion(remotePath);
                if (companion) await cacheSourceFile(companion.buffer, companion.filename);
              } catch { /* non-fatal */ }
            }
            try {
              const { downloadUADECompanions } = await import('@/lib/modlandApi');
              // Pass the main buffer so Startrekker-AM detection can gate the
              // .nt probe — without it, every ProTracker MOD generates a
              // harmless red 404 in the console (looks like a real failure).
              const companions = await downloadUADECompanions(remotePath, buffer);
              for (const c of companions) {
                await cacheSourceFile(c.buffer, c.filename);
              }
            } catch { /* non-fatal */ }
          }
        } catch (cacheErr) {
          console.warn(`[PlaylistAnalyzer] Cache+render failed for ${filename} (analysis metadata still saved):`, cacheErr);
        }

        consecutiveNetworkFailures = 0; // Reset on success
        analyzed++;
        const done = analyzed + failed;
        onProgress?.({ current: done, total, analyzed, failed, trackName: track.trackName, status: 'done' });
        console.log(`[PlaylistAnalyzer] ${done}/${total} (${analyzed} ok, ${failed} fail) — ${track.trackName}: BPM=${result.bpm}, key=${result.musicalKey ?? '?'}, energy=${result.energy?.toFixed(2) ?? '?'}`);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);

        // Abort is not a failure — exit the loop quietly.
        if (reason === 'Aborted' || opts?.signal?.aborted) {
          console.log('[PlaylistAnalyzer] Aborted mid-track');
          break;
        }

        failed++;

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

        // Use the live track name (falling back to the snapshot) so a
        // mid-run rename is reflected in the failure report and matches
        // what the "analyzing" progress just showed the user.
        failures.push({ trackName: track.trackName || snapshotName, fileName: track.fileName, reason });
        // Mark as skipped so it won't be re-scanned next time (id-resolved).
        const curr = resolveCurrent(trackId);
        if (curr) {
          useDJPlaylistStore.getState().updateTrackMeta(playlistId, curr.index, { analysisSkipped: true });
        }
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
  } finally {
    inflightAnalyses.delete(playlistId);
  }
}

/**
 * Analyze ALL playlists that have tracks missing metadata.
 * Processes playlists sequentially, tracks within each playlist sequentially.
 */
export async function analyzeAllPlaylists(
  onProgress?: (playlistName: string, progress: AnalysisProgress) => void,
  opts?: { signal?: AbortSignal },
): Promise<AnalysisResult> {
  const store = useDJPlaylistStore.getState();
  let totalAnalyzed = 0;
  let totalFailed = 0;
  let totalCount = 0;
  const allFailures: AnalysisFailure[] = [];

  for (const playlist of store.playlists) {
    if (opts?.signal?.aborted) break;
    if (!playlistNeedsAnalysis(playlist)) continue;

    const result = await analyzePlaylist(
      playlist.id,
      (p) => onProgress?.(playlist.name, p),
      undefined,
      { signal: opts?.signal },
    );
    totalAnalyzed += result.analyzed;
    totalFailed += result.failed;
    totalCount += result.total;
    allFailures.push(...result.failures);
  }

  return { analyzed: totalAnalyzed, failed: totalFailed, total: totalCount, failures: allFailures };
}

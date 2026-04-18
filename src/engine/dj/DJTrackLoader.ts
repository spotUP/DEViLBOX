/**
 * DJTrackLoader — Shared track-loading logic for playlist tracks
 *
 * Extracted from DJPlaylistPanel so both manual UI and Auto DJ can reuse it.
 * Handles Modland auto-download, pipeline rendering, and deck loading.
 */

import type { PlaylistTrack } from '@/stores/useDJPlaylistStore';
import type { DeckId } from './DeckEngine';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from './DJEngine';
import { getDJPipeline } from './DJPipeline';
import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { detectBPM } from './DJBeatDetector';
import { cacheSong } from './DJSongCache';
import { isAudioFile } from '@/lib/audioFileUtils';
import { getCachedAudioByFilename } from './DJAudioCache';
import type { TrackerSong } from '@/engine/TrackerReplayer';

/**
 * Pre-rendered track data ready for instant deck loading
 */
export interface PreRenderedTrack {
  wavData: ArrayBuffer;
  filename: string;
  trackName: string;
  bpm: number;
  song?: TrackerSong;
  waveformPeaks?: Float32Array;
  duration: number;
}

/**
 * Module-level registry of fileNames currently being pre-rendered. Auto DJ
 * pre-renders and precache passes don't load to a deck (they render in the
 * background and cache the WAV), so `deck.analysisState === 'rendering'`
 * never fires for them. This Set lets the playlist row subscribe directly
 * to "is this fileName being rendered right now?" regardless of deck state.
 *
 * Small subscribe/notify pattern — no external store needed.
 */
const renderingFileNames = new Set<string>();
const renderingListeners = new Set<() => void>();
function notifyRenderingChange(): void {
  for (const l of renderingListeners) {
    try { l(); } catch { /* ignore listener errors */ }
  }
}
function markRenderingStart(fileName: string): void {
  renderingFileNames.add(fileName);
  notifyRenderingChange();
}
function markRenderingEnd(fileName: string): void {
  renderingFileNames.delete(fileName);
  notifyRenderingChange();
}
/** Subscribe to rendering-set changes. Returns an unsubscribe fn. */
export function subscribeRendering(listener: () => void): () => void {
  renderingListeners.add(listener);
  return () => { renderingListeners.delete(listener); };
}
/** Snapshot check — true if the fileName is in the rendering set right now. */
export function isRenderingFileName(fileName: string): boolean {
  return renderingFileNames.has(fileName);
}

/**
 * Pre-render a track in the background WITHOUT loading to a deck.
 * This isolates UADE crashes from the audio playback thread.
 * 
 * Returns pre-rendered data that can be loaded instantly via loadPreRenderedTrackToDeck().
 */
export async function preRenderTrack(track: PlaylistTrack): Promise<PreRenderedTrack | null> {
  // 30 s was cutting off legitimate UADE tracks whose formats render slowly in
  // WASM — FRED, Music Line, Future Player, Hippel-COSO, and the slower
  // Future Composer variants. 60 s covers the long tail without delaying
  // Auto DJ skip decisions unreasonably on actually-broken tracks.
  const PRERENDER_TIMEOUT_MS = 60000;
  const timeoutPromise = new Promise<PreRenderedTrack | null>((_, reject) => {
    setTimeout(() => reject(new Error('Track pre-render timeout')), PRERENDER_TIMEOUT_MS);
  });

  markRenderingStart(track.fileName);
  try {
    const result = await Promise.race([
      preRenderTrackInternal(track),
      timeoutPromise,
    ]);
    
    // Success - clear bad flag if it was previously set
    if (result && track.isBad) {
      const { useDJPlaylistStore } = await import('@/stores/useDJPlaylistStore');
      const playlistId = useDJPlaylistStore.getState().activePlaylistId;
      if (playlistId) {
        const playlist = useDJPlaylistStore.getState().playlists.find(p => p.id === playlistId);
        const index = playlist?.tracks.findIndex(t => t.id === track.id);
        if (index !== undefined && index >= 0) {
          useDJPlaylistStore.getState().clearTrackBadFlag(playlistId, index);
        }
      }
    }
    
    return result;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[DJTrackLoader] Pre-render failed for ${track.fileName}:`, reason);

    // Mark track as bad in the playlist
    const { useDJPlaylistStore } = await import('@/stores/useDJPlaylistStore');
    const playlistId = useDJPlaylistStore.getState().activePlaylistId;
    if (playlistId) {
      const playlist = useDJPlaylistStore.getState().playlists.find(p => p.id === playlistId);
      const index = playlist?.tracks.findIndex(t => t.id === track.id);
      if (index !== undefined && index >= 0) {
        useDJPlaylistStore.getState().markTrackBad(playlistId, index, reason);
      }
    }

    return null;
  } finally {
    markRenderingEnd(track.fileName);
  }
}

/**
 * Load pre-rendered track data to a deck (instant, no UADE involved).
 */
export async function loadPreRenderedTrackToDeck(
  preRendered: PreRenderedTrack,
  originalTrack: PlaylistTrack,
  deckId: DeckId,
): Promise<boolean> {
  try {
    // CRITICAL: Pass .wav filename to prevent decodeAudio from trying to use UADE
    // The buffer is already a rendered WAV, but if we pass "zynaps.cus" as filename,
    // decodeAudio might try to reinitialize UADE which causes the crash
    const wavFilename = originalTrack.fileName.replace(/\.[^.]+$/, '.wav');
    
    console.log(`[DJTrackLoader] Loading pre-rendered WAV to deck ${deckId}: ${preRendered.trackName} (as ${wavFilename})`);
    await getDJEngine().loadAudioToDeck(
      deckId,
      preRendered.wavData,
      wavFilename, // Use .wav extension to avoid UADE code path
      preRendered.trackName,
      preRendered.bpm,
      undefined, // Do NOT pass song - we only want audio playback, no UADE reinit
      preRendered.waveformPeaks, // Skip expensive peak recomputation
    );
    console.log(`[DJTrackLoader] Pre-rendered track loaded successfully`);
    return true;
  } catch (err) {
    console.error('[DJTrackLoader] Failed to load pre-rendered track:', err);
    return false;
  }
}

async function preRenderTrackInternal(track: PlaylistTrack): Promise<PreRenderedTrack | null> {
  // Try cached audio first
  try {
    const cached = await getCachedAudioByFilename(track.fileName);
    if (cached && cached.audioData.byteLength > 0) {
      console.log(`[DJTrackLoader] Pre-render cache hit: ${track.fileName}`);
      return {
        wavData: cached.audioData,
        filename: track.fileName,
        trackName: track.trackName || cached.filename,
        bpm: cached.bpm || 125,
        duration: cached.duration,
        waveformPeaks: cached.waveformPeaks instanceof Float32Array
          ? cached.waveformPeaks : new Float32Array(cached.waveformPeaks),
      };
    }
  } catch (err) {
    console.warn('[DJTrackLoader] Cache lookup failed:', err);
  }

  // Modland tracks: download and render in background
  if (track.fileName.startsWith('modland:')) {
    const modlandPath = track.fileName.slice('modland:'.length);
    try {
      const { downloadModlandFile } = await import('@/lib/modlandApi');
      const buffer = await downloadModlandFile(modlandPath);
      const filename = modlandPath.split('/').pop() || 'download.mod';

      if (isAudioFile(filename)) {
        // Audio file - no rendering needed
        return {
          wavData: buffer,
          filename: track.fileName,
          trackName: track.trackName || filename,
          bpm: 125, // Will be analyzed later
          duration: 0, // Unknown until decoded
        };
      }

      // Tracker file - render in background (UADE crashes happen here, isolated from playback)
      const blob = new File([buffer], filename, { type: 'application/octet-stream' });
      const song = await parseModuleToSong(blob);
      cacheSong(track.fileName, song);
      const bpmResult = detectBPM(song);

      console.log(`[DJTrackLoader] Pre-rendering ${filename} in background...`);
      const result = await getDJPipeline().loadOrEnqueue(buffer, filename, undefined, 'high');
      console.log(`[DJTrackLoader] Pre-render complete: ${filename}`);

      return {
        wavData: result.wavData,
        filename: track.fileName,
        trackName: song.name || track.trackName || filename,
        bpm: result.analysis?.bpm || bpmResult.bpm,
        song,
        waveformPeaks: result.waveformPeaks,
        duration: result.duration || 0,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[DJTrackLoader] Pre-render failed: ${track.trackName || modlandPath} — ${msg}`);
      return null;
    }
  }

  // HVSC tracks: download SID and render in background
  if (track.fileName.startsWith('hvsc:')) {
    const hvscPath = track.fileName.slice('hvsc:'.length);
    try {
      const { downloadHVSCFile } = await import('@/lib/hvscApi');
      const buffer = await downloadHVSCFile(hvscPath);
      const filename = hvscPath.split('/').pop() || 'download.sid';

      console.log(`[DJTrackLoader] Pre-rendering HVSC ${filename} in background...`);
      const result = await getDJPipeline().loadOrEnqueue(buffer, filename, undefined, 'high');
      console.log(`[DJTrackLoader] Pre-render complete: ${filename}`);

      return {
        wavData: result.wavData,
        filename: track.fileName,
        trackName: track.trackName || filename,
        bpm: result.analysis?.bpm || 125,
        waveformPeaks: result.waveformPeaks,
        duration: result.duration || 0,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[DJTrackLoader] Pre-render failed (HVSC): ${track.trackName || hvscPath} — ${msg}`);
      return null;
    }
  }

  // `local:` — bytes live in the audio cache from when the user added the
  // file. Pre-render them the same way as modland/hvsc so Auto DJ can
  // pre-load and transition into local MP3s + tracker files.
  if (track.fileName.startsWith('local:')) {
    const filename = track.fileName.slice('local:'.length);
    try {
      const cached = await getCachedAudioByFilename(filename);
      const buffer = cached?.sourceData;
      if (!buffer || buffer.byteLength === 0) {
        console.warn(`[DJTrackLoader] Local pre-render: ${filename} not in cache`);
        return null;
      }

      if (isAudioFile(filename)) {
        return {
          wavData: buffer,
          filename: track.fileName,
          trackName: track.trackName || filename,
          bpm: 125,
          duration: 0,
        };
      }

      const blob = new File([buffer], filename, { type: 'application/octet-stream' });
      const song = await parseModuleToSong(blob);
      cacheSong(track.fileName, song);
      const bpmResult = detectBPM(song);

      const result = await getDJPipeline().loadOrEnqueue(buffer, filename, undefined, 'high');
      return {
        wavData: result.wavData,
        filename: track.fileName,
        trackName: song.name || track.trackName || filename,
        bpm: result.analysis?.bpm || bpmResult.bpm,
        song,
        waveformPeaks: result.waveformPeaks,
        duration: result.duration || 0,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[DJTrackLoader] Local pre-render failed: ${track.trackName || filename} — ${msg}`);
      return null;
    }
  }

  return null;
}

/**
 * Load a playlist track to a deck automatically (no user interaction).
 *
 * Works for:
 * - Modland tracks (auto-downloads from server)
 *
 * Returns false for local files that need a file picker.
 */
export async function loadPlaylistTrackToDeck(
  track: PlaylistTrack,
  deckId: DeckId,
): Promise<boolean> {
  // Timeout wrapper - abort if loading takes too long (UADE crash, network hang, etc.)
  const LOAD_TIMEOUT_MS = 30000; // 30 seconds
  const timeoutPromise = new Promise<boolean>((_, reject) => {
    setTimeout(() => reject(new Error('Track load timeout')), LOAD_TIMEOUT_MS);
  });

  try {
    const result = await Promise.race([
      loadPlaylistTrackToDeckInternal(track, deckId),
      timeoutPromise,
    ]);
    
    // Success - clear bad flag if it was previously set
    if (result && track.isBad) {
      const { useDJPlaylistStore } = await import('@/stores/useDJPlaylistStore');
      const playlistId = useDJPlaylistStore.getState().activePlaylistId;
      if (playlistId) {
        const playlist = useDJPlaylistStore.getState().playlists.find(p => p.id === playlistId);
        const index = playlist?.tracks.findIndex(t => t.id === track.id);
        if (index !== undefined && index >= 0) {
          useDJPlaylistStore.getState().clearTrackBadFlag(playlistId, index);
        }
      }
    }
    
    return result;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[DJTrackLoader] Load failed for ${track.fileName}:`, reason);
    
    // Mark track as bad in the playlist
    const { useDJPlaylistStore } = await import('@/stores/useDJPlaylistStore');
    const playlistId = useDJPlaylistStore.getState().activePlaylistId;
    if (playlistId) {
      const playlist = useDJPlaylistStore.getState().playlists.find(p => p.id === playlistId);
      const index = playlist?.tracks.findIndex(t => t.id === track.id);
      if (index !== undefined && index >= 0) {
        useDJPlaylistStore.getState().markTrackBad(playlistId, index, reason);
      }
    }
    
    return false;
  }
}

async function loadPlaylistTrackToDeckInternal(
  track: PlaylistTrack,
  deckId: DeckId,
): Promise<boolean> {
  // Try cached audio first (from pre-caching) — works offline
  try {
    const cached = await getCachedAudioByFilename(track.fileName);
    if (cached && cached.audioData.byteLength > 0) {
      console.log(`[DJTrackLoader] Using cached audio for: ${track.fileName}`);
      await getDJEngine().loadAudioToDeck(
        deckId, cached.audioData, track.fileName,
        track.trackName || cached.filename,
        cached.bpm || 125,
      );
      useDJStore.getState().setDeckState(deckId, {
        fileName: track.fileName,
        trackName: track.trackName || cached.filename,
        detectedBPM: cached.bpm || 125,
        effectiveBPM: cached.bpm || 125,
        playbackMode: 'audio',
        durationMs: cached.duration * 1000,
        waveformPeaks: cached.waveformPeaks instanceof Float32Array
          ? cached.waveformPeaks : new Float32Array(cached.waveformPeaks),
        audioPosition: 0,
        elapsedMs: 0,
        isPlaying: false,
      });
      return true;
    }
  } catch (err) {
    console.warn('[DJTrackLoader] Cache lookup failed:', err);
  }

  // Modland tracks: auto-download from server
  if (track.fileName.startsWith('modland:')) {
    const modlandPath = track.fileName.slice('modland:'.length);
    try {
      const { downloadModlandFile } = await import('@/lib/modlandApi');
      const buffer = await downloadModlandFile(modlandPath);
      const filename = modlandPath.split('/').pop() || 'download.mod';

      if (isAudioFile(filename)) {
        await getDJEngine().loadAudioToDeck(deckId, buffer, track.fileName);
        return true;
      }

      // Tracker file — parse, render, analyze, load
      const blob = new File([buffer], filename, { type: 'application/octet-stream' });
      const song = await parseModuleToSong(blob);
      cacheSong(track.fileName, song);
      const bpmResult = detectBPM(song);

      useDJStore.getState().setDeckState(deckId, {
        fileName: track.fileName,
        trackName: song.name || track.trackName || filename,
        detectedBPM: bpmResult.bpm,
        effectiveBPM: bpmResult.bpm,
        analysisState: 'rendering',
        isPlaying: false,
      });

      const result = await getDJPipeline().loadOrEnqueue(buffer, filename, deckId, 'high');
      await getDJEngine().loadAudioToDeck(
        deckId,
        result.wavData,
        track.fileName,
        song.name || track.trackName || filename,
        result.analysis?.bpm || bpmResult.bpm,
        song,
      );
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[DJTrackLoader] Parse/load failed for: ${track.trackName || modlandPath} — ${msg}`);
      return false;
    }
  }

  // HVSC tracks: auto-download SID from server
  if (track.fileName.startsWith('hvsc:')) {
    const hvscPath = track.fileName.slice('hvsc:'.length);
    try {
      const { downloadHVSCFile } = await import('@/lib/hvscApi');
      const buffer = await downloadHVSCFile(hvscPath);
      const filename = hvscPath.split('/').pop() || 'download.sid';

      useDJStore.getState().setDeckState(deckId, {
        fileName: track.fileName,
        trackName: track.trackName || filename,
        detectedBPM: 125,
        effectiveBPM: 125,
        analysisState: 'rendering',
        isPlaying: false,
      });

      const result = await getDJPipeline().loadOrEnqueue(buffer, filename, deckId, 'high');
      await getDJEngine().loadAudioToDeck(
        deckId,
        result.wavData,
        track.fileName,
        track.trackName || filename,
        result.analysis?.bpm || 125,
      );
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[DJTrackLoader] Load failed (HVSC): ${track.trackName || hvscPath} — ${msg}`);
      return false;
    }
  }

  // `local:` — user-added local file; bytes live in the audio cache from
  // when the playlist entry was created. Pull them out and load the deck
  // directly; no file-picker prompt.
  if (track.fileName.startsWith('local:')) {
    const filename = track.fileName.slice('local:'.length);
    try {
      const cached = await getCachedAudioByFilename(filename);
      const buffer = cached?.sourceData;
      if (!buffer || buffer.byteLength === 0) {
        console.warn(`[DJTrackLoader] Local file ${filename} not found in cache`);
        return false;
      }

      if (isAudioFile(filename)) {
        await getDJEngine().loadAudioToDeck(deckId, buffer, track.fileName, track.trackName);
        return true;
      }

      // Tracker file — parse + render through the pipeline, same as modland.
      const blob = new File([buffer], filename, { type: 'application/octet-stream' });
      const song = await parseModuleToSong(blob);
      cacheSong(track.fileName, song);
      const bpmResult = detectBPM(song);

      useDJStore.getState().setDeckState(deckId, {
        fileName: track.fileName,
        trackName: song.name || track.trackName || filename,
        detectedBPM: bpmResult.bpm,
        effectiveBPM: bpmResult.bpm,
        analysisState: 'rendering',
        isPlaying: false,
      });

      const result = await getDJPipeline().loadOrEnqueue(buffer, filename, deckId, 'high');
      await getDJEngine().loadAudioToDeck(
        deckId,
        result.wavData,
        track.fileName,
        song.name || track.trackName || filename,
        result.analysis?.bpm || bpmResult.bpm,
        song,
      );
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[DJTrackLoader] Local load failed: ${track.trackName || filename} — ${msg}`);
      return false;
    }
  }

  // Files without a known source scheme can't be auto-loaded.
  console.warn(`[DJTrackLoader] Cannot auto-load track: ${track.fileName}`);
  return false;
}

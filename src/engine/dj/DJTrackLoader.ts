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
 * Pre-render a track in the background WITHOUT loading to a deck.
 * This isolates UADE crashes from the audio playback thread.
 * 
 * Returns pre-rendered data that can be loaded instantly via loadPreRenderedTrackToDeck().
 */
export async function preRenderTrack(track: PlaylistTrack): Promise<PreRenderedTrack | null> {
  const PRERENDER_TIMEOUT_MS = 15000;
  const timeoutPromise = new Promise<PreRenderedTrack | null>((_, reject) => {
    setTimeout(() => reject(new Error('Track pre-render timeout')), PRERENDER_TIMEOUT_MS);
  });

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
    await getDJEngine().loadAudioToDeck(
      deckId,
      preRendered.wavData,
      originalTrack.fileName,
      preRendered.trackName,
      preRendered.bpm,
      preRendered.song,
    );
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

  // Local files not supported for pre-render (need file picker)
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
  const LOAD_TIMEOUT_MS = 15000; // 15 seconds
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

  // Local files cannot be auto-loaded without a file picker
  console.warn(`[DJTrackLoader] Cannot auto-load local track: ${track.fileName}`);
  return false;
}

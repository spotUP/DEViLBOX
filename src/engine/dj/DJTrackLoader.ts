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

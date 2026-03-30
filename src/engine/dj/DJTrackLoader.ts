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
      console.error(`[DJTrackLoader] Failed to load Modland track ${modlandPath}:`, err);
      return false;
    }
  }

  // Local files cannot be auto-loaded without a file picker
  console.warn(`[DJTrackLoader] Cannot auto-load local track: ${track.fileName}`);
  return false;
}

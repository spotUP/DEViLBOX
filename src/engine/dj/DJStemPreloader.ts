/**
 * DJStemPreloader — Background stem pre-separation for upcoming playlist tracks.
 *
 * Watches the active playlist + Auto DJ state and queues stem separation
 * for the next N upcoming tracks. When Auto DJ advances, newly upcoming
 * tracks are enqueued automatically.
 *
 * Requires:
 *  - Playlist tracks to have been pre-rendered (cached audio in IndexedDB)
 *  - Auto DJ enabled OR manual "Pre-separate Stems" toggle
 *
 * Architecture:
 *  - Module-level singleton (no React dependency)
 *  - Subscribes to useDJStore + useDJPlaylistStore
 *  - Routes all work through DJStemQueue (priority scheduling)
 *  - Skips tracks that are already cached, too long, or flagged bad
 */

import { useDJStore } from '@/stores/useDJStore';
import { useDJPlaylistStore, type PlaylistTrack } from '@/stores/useDJPlaylistStore';
import { enqueueStemJob, cancelPresepJobs, getStemStatus } from './DJStemQueue';
import type { StemJobStatus } from './DJStemQueue';
import { getCachedAudioByFilename } from './DJAudioCache';
import { hashFile } from './DJAudioCache';

const LOOKAHEAD = 3; // Pre-separate this many tracks ahead
const MAX_DURATION_S = 600; // Skip tracks longer than 10 min

let _enabled = false;
let _unsubDJ: (() => void) | null = null;
let _unsubPlaylist: (() => void) | null = null;
let _lastQueuedHashes = new Set<string>();

/**
 * Enable/disable background stem pre-separation.
 * When enabled, watches the playlist and queues upcoming tracks.
 */
export function setStemPreSeparation(enabled: boolean): void {
  if (enabled === _enabled) return;
  _enabled = enabled;

  if (enabled) {
    startWatching();
    void queueUpcoming();
  } else {
    stopWatching();
    cancelPresepJobs();
    _lastQueuedHashes.clear();
  }
}

export function isStemPreSeparationEnabled(): boolean {
  return _enabled;
}

// ── Watching ──────────────────────────────────────────────────────────────

function startWatching(): void {
  // Watch Auto DJ track index changes
  let lastCurrentIdx = useDJStore.getState().autoDJCurrentTrackIndex;
  _unsubDJ = useDJStore.subscribe((state) => {
    if (state.autoDJCurrentTrackIndex !== lastCurrentIdx) {
      lastCurrentIdx = state.autoDJCurrentTrackIndex;
      void queueUpcoming();
    }
  });

  // Watch playlist changes (tracks added/removed/reordered)
  let lastPlaylistId = useDJPlaylistStore.getState().activePlaylistId;
  let lastTrackCount = 0;
  _unsubPlaylist = useDJPlaylistStore.subscribe((state) => {
    const playlist = state.playlists.find((p) => p.id === state.activePlaylistId);
    const newId = state.activePlaylistId;
    const newCount = playlist?.tracks.length ?? 0;
    if (newId !== lastPlaylistId || newCount !== lastTrackCount) {
      lastPlaylistId = newId;
      lastTrackCount = newCount;
      cancelPresepJobs();
      _lastQueuedHashes.clear();
      void queueUpcoming();
    }
  });
}

function stopWatching(): void {
  _unsubDJ?.();
  _unsubPlaylist?.();
  _unsubDJ = null;
  _unsubPlaylist = null;
}

// ── Queue Logic ───────────────────────────────────────────────────────────

async function queueUpcoming(): Promise<void> {
  if (!_enabled) return;

  const djState = useDJStore.getState();
  const playlistState = useDJPlaylistStore.getState();
  const playlist = playlistState.playlists.find(
    (p) => p.id === playlistState.activePlaylistId,
  );
  if (!playlist || playlist.tracks.length === 0) return;

  const currentIdx = djState.autoDJCurrentTrackIndex;
  const totalTracks = playlist.tracks.length;

  // Gather the next LOOKAHEAD tracks
  const upcoming: PlaylistTrack[] = [];
  for (let i = 1; i <= LOOKAHEAD; i++) {
    const idx = (currentIdx + i) % totalTracks;
    upcoming.push(playlist.tracks[idx]);
  }

  for (const track of upcoming) {
    try {
      await queueTrackIfNeeded(track);
    } catch (err) {
      console.warn('[StemPreloader] Failed to queue:', track.fileName, err);
    }
  }
}

async function queueTrackIfNeeded(track: PlaylistTrack): Promise<void> {
  // Skip bad tracks
  if (track.isBad) return;

  // Skip tracks that are too long
  if (track.duration > MAX_DURATION_S) return;

  // Get the cached audio (pre-rendered WAV or original audio file)
  const cached = await getCachedAudioByFilename(track.fileName);
  if (!cached || cached.audioData.byteLength === 0) {
    // Track hasn't been pre-rendered yet — can't separate without audio
    return;
  }

  // Compute file hash
  const hash = await hashFile(cached.audioData);

  // Skip if already queued/processing/cached
  if (_lastQueuedHashes.has(hash)) return;
  const status: StemJobStatus | undefined = getStemStatus(hash);
  if (status === 'cached' || status === 'queued' || status === 'separating') return;

  // Check IndexedDB cache
  const { DemucsEngine } = await import('@/engine/demucs/DemucsEngine');
  const demucs = DemucsEngine.getInstance();
  const isCached = await demucs.hasCachedStems(hash);
  if (isCached) return;

  // Decode the cached WAV to get PCM data
  const audioCtx = new OfflineAudioContext(2, 1, 44100);
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await audioCtx.decodeAudioData(cached.audioData.slice(0));
  } catch {
    console.warn('[StemPreloader] Failed to decode audio for', track.fileName);
    return;
  }

  if (audioBuffer.duration > MAX_DURATION_S) return;

  const left = audioBuffer.getChannelData(0);
  const right = audioBuffer.numberOfChannels >= 2 ? audioBuffer.getChannelData(1) : left;

  _lastQueuedHashes.add(hash);

  // Fire and forget — the queue handles serialization
  void enqueueStemJob({
    priority: 'presep',
    fileHash: hash,
    fileName: track.fileName,
    left,
    right,
    sampleRate: audioBuffer.sampleRate,
    onProgress: (p, msg) => {
      console.log(`[StemPreloader] ${track.trackName}: ${Math.round(p * 100)}% ${msg}`);
    },
  }).catch((err) => {
    console.warn(`[StemPreloader] Separation failed for ${track.fileName}:`, err);
  });
}

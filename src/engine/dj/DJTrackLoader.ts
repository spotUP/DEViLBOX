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
import { getDJPipeline, analysisFromCachedAudio } from './DJPipeline';
import type { PipelineResult } from './DJPipeline';
import { openDeckTrack } from '@/lib/song/openSong';
import { detectBPM } from './DJBeatDetector';
import { cacheSong, getCachedSong } from './DJSongCache';
import { isAudioFile } from '@/lib/audioFileUtils';
import { getCachedAudioByFilename } from './DJAudioCache';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { SongSourceRef } from '@/lib/song/openSong';
import { decodePathEscapes, sourceBaseName } from '@/lib/dj/playlistTrackSource';
import { isRemoteUrlSource, remoteSourceProxyUrl } from '@/lib/dj/remoteSources';

/** A playlist track fetched over the network by path: Modland, or an http(s) URL through the server's download proxy. */
interface RemoteTrackSource {
  /** The file's own name (extension decides audio vs module). */
  name: string;
  /** What `openDeckTrack` opens: the bytes plus partner files beside them. */
  ref: SongSourceRef;
  /** The bytes alone, for audio files that need no parse. */
  fetchBytes: () => Promise<ArrayBuffer>;
}

/**
 * The network source of a playlist entry, or null when it is not one
 * (`hvsc:`, `local:`, bare). Throws for an http(s) source on a host the proxy
 * does not serve (a live stream, a dead host): it can never load, and the
 * message is the reason the playlist shows.
 */
export function remoteTrackSource(fileName: string): RemoteTrackSource | null {
  if (fileName.startsWith('modland:')) {
    const path = fileName.slice('modland:'.length);
    return {
      name: path.split('/').pop() || 'download.mod',
      ref: { kind: 'modland', path },
      fetchBytes: async () => (await import('@/lib/modlandApi')).downloadModlandFile(path),
    };
  }
  if (isRemoteUrlSource(fileName)) {
    const url = remoteSourceProxyUrl(fileName);
    if (!url) {
      let host = fileName;
      try { host = new URL(fileName).host; } catch { /* keep the source */ }
      throw new Error(`Cannot load (source not supported): ${host}`);
    }
    const name = decodePathEscapes(sourceBaseName(fileName));
    return {
      name,
      ref: { kind: 'url', url, name },
      fetchBytes: async () => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        return res.arrayBuffer();
      },
    };
  }
  return null;
}

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
  /** The analysis of the render (beat grid, key, energy), applied to the deck the track is loaded to. */
  analysis?: PipelineResult['analysis'];
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
 * Report a load attempt's outcome to the playlists (`recordTrackLoad`): a
 * failure flags every entry with this source bad, a success clears it. The
 * store is read now, never the caller's track snapshot: a snapshot taken
 * before an earlier attempt failed says "not bad", and a guard on it left
 * tracks that load and play flagged bad (owner 2026-10-11, "Anathema-Nr Seven").
 */
async function recordLoad(track: PlaylistTrack, outcome: { ok: true } | { ok: false; reason: string }): Promise<void> {
  const { useDJPlaylistStore } = await import('@/stores/useDJPlaylistStore');
  useDJPlaylistStore.getState().recordTrackLoad(track.fileName, outcome);
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
    
    // A render that produced nothing (source not in the cache, download or
    // decode failed) is a failed load like a thrown one: the track is marked
    // bad so Auto DJ's planner leaves it out of the next order. Unmarked, the
    // session order kept offering the same track and the skip loop fell
    // through onto the track that was playing.
    await recordLoad(track, result ? { ok: true } : { ok: false, reason: 'pre-render produced no audio' });

    return result;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[DJTrackLoader] Pre-render failed for ${track.fileName}:`, reason);
    await recordLoad(track, { ok: false, reason });
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
      // The song drives the pattern display (Auto DJ's next deck showed the
      // oscilloscope without it, owner 2026-10-08). Playback stays the WAV;
      // the song only fills the deck's replayer, as the direct modland load
      // has done since decks got their own UADE instance (U2.6c) - the April
      // UADE re-init crash this once avoided came from the shared instance.
      preRendered.song ?? getCachedSong(originalTrack.fileName),
      preRendered.waveformPeaks, // Skip expensive peak recomputation
    );
    // The analysis belongs to the deck the track now sits on. The preload
    // renders with no deck, so nothing else ever set the beat grid, key and
    // energy of the incoming deck (loading cleared the grid and left the key
    // and energy of the track before).
    applyLoadedAnalysis(deckId, preRendered.analysis);
    console.log(`[DJTrackLoader] Pre-rendered track loaded successfully`);
    await recordLoad(originalTrack, { ok: true });
    return true;
  } catch (err) {
    console.error('[DJTrackLoader] Failed to load pre-rendered track:', err);
    return false;
  }
}

/**
 * Load a double of the track `source` plays onto `target` (plan
 * 2026-10-11-dj-juggling, P4.2): the source deck's decoded buffer is reused
 * (no decode, no render) and its analysis is copied - same track, same
 * analysis object, no second analysis. Used by Auto DJ's stand-alone juggles.
 *
 * No tracker song on the double: the song a deck holds is remapped in place
 * to that deck's instrument ids (and the song cache can hand back that very
 * object), so loading it again would remap it twice. The double is a
 * temporary performance copy; the pattern view stays on the source deck.
 */
export async function loadDoubleToDeck(source: DeckId, target: DeckId): Promise<boolean> {
  try {
    const engine = getDJEngine();
    const player = engine.getDeck(source).audioPlayer;
    const audioBuffer = player.getAudioBuffer();
    const from = useDJStore.getState().decks[source];
    if (!audioBuffer || !from.fileName) return false;
    await engine.loadDecodedAudioToDeck(target, audioBuffer, {
      fileName: from.fileName, trackName: from.trackName, bpm: from.detectedBPM,
      peaks: player.getWaveformPeaks() ?? undefined, fileBytes: player.getOriginalFileBytes(),
      channelScopes: engine.getDeck(source).channelScopes, sourceWav: engine.getDeck(source).loadedWav,
    });
    // The analysis the source deck carries now, in one write (the load above set the file name, so nothing clears it).
    const now = useDJStore.getState().decks[source];
    useDJStore.getState().setDeckState(target, {
      analysisState: now.analysisState, trackAnalysis: now.trackAnalysis, beatGrid: now.beatGrid,
      musicalKey: now.musicalKey, keyConfidence: now.keyConfidence, detectedBPM: now.detectedBPM,
      frequencyPeaks: now.frequencyPeaks, rmsDb: now.rmsDb, peakDb: now.peakDb, trimGain: now.trimGain,
      genrePrimary: now.genrePrimary, genreSubgenre: now.genreSubgenre, genreConfidence: now.genreConfidence,
      mood: now.mood, energy: now.energy, danceability: now.danceability,
    });
    return true;
  } catch (err) {
    console.error('[DJTrackLoader] Failed to load a double:', err);
    return false;
  }
}

async function preRenderTrackInternal(track: PlaylistTrack): Promise<PreRenderedTrack | null> {
  // Try cached audio first
  try {
    const cached = await getCachedAudioByFilename(track.fileName);
    if (cached && cached.audioData.byteLength > 0) {
      console.log(`[DJTrackLoader] Pre-render cache hit: ${track.fileName}`);
      const cachedSong = getCachedSong(track.fileName);
      return {
        wavData: cached.audioData,
        filename: track.fileName,
        trackName: track.trackName || cached.filename,
        bpm: cached.bpm || 125,
        duration: cached.duration,
        song: cachedSong,
        waveformPeaks: cached.waveformPeaks instanceof Float32Array
          ? cached.waveformPeaks : new Float32Array(cached.waveformPeaks),
        analysis: analysisFromCachedAudio(cached),
      };
    }
  } catch (err) {
    console.warn('[DJTrackLoader] Cache lookup failed:', err);
  }

  // Network tracks (Modland, http(s) URLs via the proxy): download and render in background
  const remote = remoteTrackSource(track.fileName);
  if (remote) {
    try {
      const filename = remote.name;

      if (isAudioFile(filename)) {
        // Audio file - no rendering needed
        const buffer = await remote.fetchBytes();
        return {
          wavData: buffer,
          filename: track.fileName,
          trackName: track.trackName || filename,
          bpm: 125, // Will be analyzed later
          duration: 0, // Unknown until decoded
        };
      }

      // Tracker file - render in background (UADE crashes happen here, isolated from playback).
      // One open: the download, the partner files (TFMX smpl.*, .nt, banks) and the parse;
      // Auto DJ pre-render without the partners silently fails with UADE -1.
      const { bytes: buffer, song, companionList: companions } = await openDeckTrack(remote.ref);
      cacheSong(track.fileName, song);
      const bpmResult = detectBPM(song);

      console.log(`[DJTrackLoader] Pre-rendering ${filename} in background${companions ? ` with ${companions.length} companion(s)` : ''}...`);
      const result = await getDJPipeline().loadOrEnqueue(buffer, filename, undefined, 'high', companions);
      console.log(`[DJTrackLoader] Pre-render complete: ${filename}`);

      return {
        wavData: result.wavData,
        filename: track.fileName,
        trackName: song.name || track.trackName || filename,
        bpm: result.analysis?.bpm || bpmResult.bpm,
        song,
        waveformPeaks: result.waveformPeaks,
        duration: result.duration || 0,
        analysis: result.analysis,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[DJTrackLoader] Pre-render failed: ${track.trackName || track.fileName} — ${msg}`);
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
        analysis: result.analysis,
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

      const { song } = await openDeckTrack({ kind: 'bytes', name: filename, bytes: buffer });
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
        analysis: result.analysis,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[DJTrackLoader] Local pre-render failed: ${track.trackName || filename} — ${msg}`);
      return null;
    }
  }

  // Plain filename — local file added via file picker (no prefix).
  // Raw bytes were cached in IndexedDB by handleAddFiles/cacheSourceFile.
  {
    const filename = track.fileName;
    try {
      const cached = await getCachedAudioByFilename(filename);
      const buffer = cached?.sourceData;
      if (!buffer || buffer.byteLength === 0) {
        console.warn(`[DJTrackLoader] Plain-filename pre-render: ${filename} not in cache — user must re-add it`);
        return null;
      }

      if (isAudioFile(filename)) {
        return {
          wavData: buffer,
          filename,
          trackName: track.trackName || filename,
          bpm: 125,
          duration: 0,
        };
      }

      const { song } = await openDeckTrack({ kind: 'bytes', name: filename, bytes: buffer });
      cacheSong(filename, song);
      const bpmResult = detectBPM(song);

      const result = await getDJPipeline().loadOrEnqueue(buffer, filename, undefined, 'high');
      return {
        wavData: result.wavData,
        filename,
        trackName: song.name || track.trackName || filename,
        bpm: result.analysis?.bpm || bpmResult.bpm,
        song,
        waveformPeaks: result.waveformPeaks,
        duration: result.duration || 0,
        analysis: result.analysis,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[DJTrackLoader] Plain-filename pre-render failed: ${track.trackName || filename} — ${msg}`);
      return null;
    }
  }
}

/**
 * Returns false for local files that need a file picker.
 */
export async function loadPlaylistTrackToDeck(
  track: PlaylistTrack,
  deckId: DeckId,
): Promise<boolean> {
  // Timeout - a load that takes too long (UADE crash, network hang, a slow
  // render) is given up AND cancelled: its render may still finish, but it
  // never reaches the deck. Uncancelled, a timed-out load landed on the deck
  // after the caller had moved on and loaded (and started) another track -
  // the deck began a new load under it and play() found no buffer (Auto DJ
  // enable, owner 2026-10-12).
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<boolean>((_, reject) => {
    timer = setTimeout(() => {
      abort.abort();
      reject(new Error('Track load timeout'));
    }, LOAD_TIMEOUT_MS);
  });
  const load = loadPlaylistTrackToDeckInternal(track, deckId, abort.signal);
  // Settled after the timeout (cancelled, or failed): nothing waits for it any more.
  load.catch((err) => { if (!abort.signal.aborted) return; console.log(`[DJTrackLoader] Cancelled load of ${track.fileName} ended:`, err instanceof Error ? err.message : err); });

  try {
    const result = await Promise.race([load, timeoutPromise]);

    await recordLoad(track, result ? { ok: true } : { ok: false, reason: 'load failed' });
    return result;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[DJTrackLoader] Load failed for ${track.fileName}:`, reason);
    
    await recordLoad(track, { ok: false, reason });
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** How long a playlist track may take to reach the deck before it is given up and cancelled. */
export const LOAD_TIMEOUT_MS = 30000;

/** Thrown into a load cancelled by its timeout: it must not reach the deck. */
export class TrackLoadCancelled extends Error {
  constructor(fileName: string) { super(`load of ${fileName} cancelled (timed out)`); }
}

async function loadPlaylistTrackToDeckInternal(
  track: PlaylistTrack,
  deckId: DeckId,
  signal: AbortSignal,
): Promise<boolean> {
  // Every way this function reaches the deck goes through here: a cancelled load stops at the door.
  const engine = {
    loadAudioToDeck: (...args: Parameters<ReturnType<typeof getDJEngine>['loadAudioToDeck']>) => {
      if (signal.aborted) throw new TrackLoadCancelled(track.fileName);
      return getDJEngine().loadAudioToDeck(...args);
    },
  };
  // Try cached audio first (from pre-caching) — works offline
  try {
    const cached = await getCachedAudioByFilename(track.fileName);
    if (cached && cached.audioData.byteLength > 0) {
      console.log(`[DJTrackLoader] Using cached audio for: ${track.fileName}`);
      // The song drives the deck's pattern display. The in-memory song cache
      // is empty after a reload, so a track played from the audio cache got
      // the oscilloscope instead (owner 2026-10-08: Auto DJ's second deck).
      // The audio cache keeps the module's own bytes: parse those, one open.
      const cachedSong = getCachedSong(track.fileName) ?? await songFromCachedSource(track.fileName, cached.sourceData, deckId);
      await engine.loadAudioToDeck(
        deckId, cached.audioData, track.fileName,
        track.trackName || cached.filename,
        cached.bpm || 125,
        cachedSong,
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
        ...(cachedSong ? { totalPositions: cachedSong.songLength, songPos: 0, pattPos: 0 } : {}),
      });
      applyLoadedAnalysis(deckId, analysisFromCachedAudio(cached));
      return true;
    }
  } catch (err) {
    console.warn('[DJTrackLoader] Cache lookup failed:', err);
  }

  // Network tracks (Modland, http(s) URLs via the proxy): auto-download from server
  const remote = remoteTrackSource(track.fileName);
  if (remote) {
    try {
      const filename = remote.name;

      if (isAudioFile(filename)) {
        await engine.loadAudioToDeck(deckId, await remote.fetchBytes(), track.fileName);
        return true;
      }

      // Tracker file: one open on this deck (download, partner files, parse), then render, analyze, load
      const { bytes: buffer, song, companionList: companions } = await openDeckTrack(remote.ref, deckId);
      cacheSong(track.fileName, song);
      const bpmResult = detectBPM(song);

      useDJStore.getState().setDeckState(deckId, {
        fileName: track.fileName,
        trackName: song.name || track.trackName || filename,
        detectedBPM: bpmResult.bpm,
        effectiveBPM: bpmResult.bpm,
        analysisState: 'rendering',
        isPlaying: false,
        totalPositions: song.songLength,
      });

      const result = await getDJPipeline().loadOrEnqueue(
        buffer, filename, deckId, 'high',
        companions,
      );

      // Use .wav filename to avoid UADE re-init on decode
      const wavFilename = track.fileName.replace(/\.[^.]+$/, '.wav');
      await engine.loadAudioToDeck(
        deckId,
        result.wavData,
        wavFilename,
        song.name || track.trackName || filename,
        result.analysis?.bpm || bpmResult.bpm,
        song,
      );
      applyLoadedAnalysis(deckId, result.analysis);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[DJTrackLoader] Parse/load failed for: ${track.trackName || track.fileName} — ${msg}`);
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
      await engine.loadAudioToDeck(
        deckId,
        result.wavData,
        track.fileName,
        track.trackName || filename,
        result.analysis?.bpm || 125,
      );
      applyLoadedAnalysis(deckId, result.analysis);
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
        await engine.loadAudioToDeck(deckId, buffer, track.fileName, track.trackName);
        return true;
      }

      // Tracker file — parse + render through the pipeline, same as modland.
      const { song } = await openDeckTrack({ kind: 'bytes', name: filename, bytes: buffer }, deckId);
      cacheSong(track.fileName, song);
      const bpmResult = detectBPM(song);

      useDJStore.getState().setDeckState(deckId, {
        fileName: track.fileName,
        trackName: song.name || track.trackName || filename,
        detectedBPM: bpmResult.bpm,
        effectiveBPM: bpmResult.bpm,
        analysisState: 'rendering',
        isPlaying: false,
        totalPositions: song.songLength,
      });

      const result = await getDJPipeline().loadOrEnqueue(buffer, filename, deckId, 'high');
      await engine.loadAudioToDeck(
        deckId,
        result.wavData,
        track.fileName,
        song.name || track.trackName || filename,
        result.analysis?.bpm || bpmResult.bpm,
        song,
      );
      applyLoadedAnalysis(deckId, result.analysis);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[DJTrackLoader] Local load failed: ${track.trackName || filename} — ${msg}`);
      return false;
    }
  }

  // Plain filename — local file added via file picker (no prefix).
  // Raw bytes were cached in IndexedDB by handleAddFiles/cacheSourceFile.
  {
    const filename = track.fileName;
    try {
      const cached = await getCachedAudioByFilename(filename);
      const buffer = cached?.sourceData;
      if (!buffer || buffer.byteLength === 0) {
        console.warn(`[DJTrackLoader] Plain-filename local file not in cache: ${filename} — user must re-add it`);
        return false;
      }

      if (isAudioFile(filename)) {
        await engine.loadAudioToDeck(deckId, buffer, filename, track.trackName);
        return true;
      }

      const { song } = await openDeckTrack({ kind: 'bytes', name: filename, bytes: buffer }, deckId);
      cacheSong(filename, song);
      const bpmResult = detectBPM(song);

      useDJStore.getState().setDeckState(deckId, {
        fileName: filename,
        trackName: song.name || track.trackName || filename,
        detectedBPM: bpmResult.bpm,
        effectiveBPM: bpmResult.bpm,
        analysisState: 'rendering',
        isPlaying: false,
        totalPositions: song.songLength,
      });

      const result = await getDJPipeline().loadOrEnqueue(buffer, filename, deckId, 'high');
      await engine.loadAudioToDeck(
        deckId,
        result.wavData,
        filename,
        song.name || track.trackName || filename,
        result.analysis?.bpm || bpmResult.bpm,
        song,
      );
      applyLoadedAnalysis(deckId, result.analysis);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[DJTrackLoader] Local plain-filename load failed: ${track.trackName || filename} — ${msg}`);
      return false;
    }
  }
}

/**
 * Put the track's analysis on the deck once the deck holds the track. The
 * pipeline's own apply runs during the render, before loadAudioToDeck: the
 * load then changed the deck's fileName (the .wav name), which clears the
 * beat grid, and the analysis was built with the deck's previous song. The
 * cached-audio load never applied one at all. Same call as the Auto DJ
 * pre-rendered load (loadPreRenderedTrackToDeck): one tempo per track.
 */
function applyLoadedAnalysis(deckId: DeckId, analysis: PipelineResult['analysis'] | undefined): void {
  if (analysis) getDJPipeline().applyAnalysisToDeck(deckId, analysis);
}

/**
 * The tracker song for a cached render, parsed from the module bytes the
 * audio cache keeps (the deck open; no deck for the playlist analyser).
 */
export async function songFromCachedSource(fileName: string, source: ArrayBuffer | undefined, deckId?: DeckId): Promise<TrackerSong | undefined> {
  if (!source || source.byteLength === 0) return undefined;
  const name = fileName.replace(/^modland:/, '').split('/').pop() || fileName;
  if (isAudioFile(name)) return undefined;
  try {
    const { song } = await openDeckTrack({ kind: 'bytes', name, bytes: source.slice(0) }, deckId);
    cacheSong(fileName, song);
    return song;
  } catch (err) {
    console.warn('[DJTrackLoader] Cached source did not parse:', fileName, err);
    return undefined;
  }
}

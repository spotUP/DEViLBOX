/**
 * DJAudioCache - IndexedDB cache for pre-rendered UADE audio files
 *
 * Stores rendered audio buffers (encoded as WAV) keyed by file content hash.
 * Persistent across sessions, evicts oldest entries when storage limit reached.
 *
 * Cache key = SHA-256 hash of file content (handles renamed files, identical content),
 * plus what SID Settings forces on a SID's render (renderCacheKey): a forced
 * chip model or clock sounds different, so it is a different render.
 */

import { isSidFileBytes, sidForcedPlayback, type SidForcedPlayback } from '@/lib/sid/SIDHeaderParser';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { renderEngineSuffix } from './djRenderEngine';

const DB_NAME = 'DEViLBOX_AudioCache';
const DB_VERSION = 2;
const STORE_NAME = 'audioCache';
const MAX_CACHE_SIZE_MB = 2000; // 2 GB limit (gig playlists need 200+ tracks)
const MAX_CACHE_ENTRIES = 1000; // Max 1000 cached files

import type { ExtendedAnalysis } from './autodj/types';
import {
  attachChannelScopes, noteScopelessWav, needsChannelScopeRerender, CHANNEL_SCOPE_RENDER_VERSION,
  type ChannelScopeTrack,
} from './channelScopeTrack';

export interface CachedAudio {
  hash: string;           // SHA-256 of source file
  filename: string;       // Original filename (for display)
  audioData: ArrayBuffer; // Encoded WAV audio
  duration: number;       // Seconds
  waveformPeaks: number[]; // Pre-computed overview peaks
  sampleRate: number;
  numberOfChannels: number;
  timestamp: number;      // Cache insertion time (for LRU)
  /** Every byte the entry stores (entryStoredBytes) as of its last write. Never trusted for eviction: recomputed on read. */
  sizeBytes: number;

  // ── Analysis results (populated asynchronously after render) ──
  beatGrid?: BeatGridData;         // Computed beat positions + downbeats
  bpm?: number;                    // Detected BPM
  bpmConfidence?: number;          // 0-1 confidence score
  musicalKey?: string;             // e.g. "C minor", "A major"
  keyConfidence?: number;          // 0-1
  onsets?: number[];               // Onset positions in seconds
  frequencyPeaks?: number[][];     // [low[], mid[], high[]] frequency-band peaks
  rmsDb?: number;                  // RMS loudness in dB (for auto-gain)
  peakDb?: number;                 // Peak level in dB
  analysisVersion?: number;        // Bump to re-analyze when algorithm improves
  extended?: ExtendedAnalysis;     // Auto DJ extended analysis (version 2+)
  
  // ── Genre classification ──
  genrePrimary?: string;           // e.g. "Electronic", "Hip Hop"
  genreSubgenre?: string;          // e.g. "Techno", "Drum n Bass"
  genreConfidence?: number;        // 0-1
  mood?: string;                   // e.g. "Energetic", "Chill"
  energy?: number;                 // 0-1 (low → high energy)
  danceability?: number;           // 0-1

  // ── Source file (for offline re-rendering) ──
  sourceData?: ArrayBuffer;        // Original module file bytes (MOD/XM/IT etc.)

  // ── Per-channel scope track rendered with audioData (channelScopeTrack.ts) ──
  channelScopes?: ChannelScopeTrack;
  /** Set by a render that knew about scope tracks (CHANNEL_SCOPE_RENDER_VERSION), with or without a per-channel tap. */
  scopeRenderVersion?: number;

  /**
   * The render stopped at this many seconds before the song ended (a preview,
   * the playlist analyser's PREVIEW_RENDER_CAP_SEC); null = the whole song.
   * Absent on entries written before the field existed (isPreviewRender).
   */
  renderCapSec?: number | null;

  /**
   * A SID render's player call rate (sidPlayerClock.ts), the unit of its beat grid; null = the
   * render measured none (not a SID, or no steady player). Absent = rendered before renders
   * recorded it: a SID entry like that is read as needing a render (asRead), like a preview.
   */
  playerCallHz?: number | null;
}

/** The playlist analyser renders a preview of this many seconds (its BPM, key and energy need no more). */
export const PREVIEW_RENDER_CAP_SEC = 90;

/**
 * Whether the entry's audio is a capped preview, not the whole song. Entries
 * from before renderCapSec was recorded are previews when they end at the
 * preview cap (a capped render overshoots it by under one render chunk); a
 * whole song of that exact length is rendered again once, then recorded.
 */
export function isPreviewRender(entry: Pick<CachedAudio, 'renderCapSec' | 'duration'>): boolean {
  if (entry.renderCapSec !== undefined) return entry.renderCapSec !== null;
  return entry.duration >= PREVIEW_RENDER_CAP_SEC - 0.01 && entry.duration < PREVIEW_RENDER_CAP_SEC + 0.5;
}

export interface CacheReadOptions {
  /** Hand out a preview render's audio too (the playlist analyser); every deck load wants the whole song. */
  allowPreview?: boolean;
}

/**
 * A cache entry as a reader gets it: a preview render's audio is left out
 * unless the reader takes previews, so no deck ever plays (or analyses as
 * the track) a song cut at the preview cap. The source bytes stay, and the
 * reader renders the whole song from them.
 */
function asRead<T extends CachedAudio | null | undefined>(entry: T, opts: CacheReadOptions = {}): T {
  if (!entry || !entry.audioData || entry.audioData.byteLength === 0) return withChannelScopes(entry);
  if (!lacksPlayerClock(entry) && rendersUnderCurrentSettings(entry) && (opts.allowPreview || !isPreviewRender(entry))) {
    return withChannelScopes(entry);
  }
  return {
    ...entry, audioData: new ArrayBuffer(0), waveformPeaks: [], channelScopes: undefined,
    beatGrid: undefined, bpm: undefined, bpmConfidence: undefined, analysisVersion: undefined, extended: undefined,
  } as T;
}

/**
 * A cache entry as read: its scope track attached to its WAV bytes, so the deck that loads them finds it.
 * An old-shape entry (no track, or a track without the channel stems) is noted on its WAV so the load
 * that follows can ask for the background re-render (DJChannelScopeRerender).
 */
function withChannelScopes<T extends CachedAudio | null | undefined>(entry: T): T {
  if (!entry?.audioData) return entry;
  if (entry.channelScopes) attachChannelScopes(entry.audioData, entry.channelScopes);
  if (needsChannelScopeRerender(entry)) {
    noteScopelessWav(entry.audioData, { hash: entry.hash, filename: entry.filename, duration: entry.duration });
  }
  return entry;
}

/**
 * A SID entry rendered before renders recorded the player call rate: its beat grid would fall back
 * to the audio detector, so a reader renders it again (once) instead of using the audio.
 */
export function lacksPlayerClock(entry: Pick<CachedAudio, 'sourceData' | 'playerCallHz'>): boolean {
  if (entry.playerCallHz !== undefined || !entry.sourceData) return false;
  return isSidFileBytes(entry.sourceData);
}

/** Beat grid data — compatible with Serato beat markers */
export interface BeatGridData {
  beats: number[];         // Beat positions in seconds
  downbeats: number[];     // Downbeat positions (bar starts) in seconds
  bpm: number;             // Detected tempo
  timeSignature: number;   // Beats per bar (usually 4)
}

interface CacheMetadata {
  totalSizeBytes: number;
  entryCount: number;
}

let db: IDBDatabase | null = null;

/** Initialize IndexedDB */
async function initDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(new Error('Failed to open IndexedDB'));
    request.onsuccess = () => {
      db = request.result;
      resolve(db!);
      // A cache over its cap (entries written while sizes counted the WAV only) trims on open,
      // not first on the next write.
      void trimCacheToCap();
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      const tx = (event.target as IDBOpenDBRequest).transaction!;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        // Create object store with hash as key
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'hash' });
        // Index by timestamp for LRU eviction
        store.createIndex('timestamp', 'timestamp', { unique: false });
        // Index by filename for efficient lookup without getAll()
        store.createIndex('filename', 'filename', { unique: false });
      } else {
        // Existing store — add filename index if missing (v1 → v2 migration)
        const store = tx.objectStore(STORE_NAME);
        if (!store.indexNames.contains('filename')) {
          store.createIndex('filename', 'filename', { unique: false });
        }
      }
    };
  });
}

/** Compute SHA-256 hash of file content */
export async function hashFile(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * What SID Settings forces on a render of `source` (a forced chip model or
 * clock); {} = the header decides, and always {} for a file that is no SID.
 */
export function sidRenderOverrides(source: ArrayBuffer | undefined): SidForcedPlayback {
  if (!source || !isSidFileBytes(source)) return {};
  const s = useSettingsStore.getState();
  return sidForcedPlayback({ chipModel: s.sidChipModel, clock: s.sidClockSpeed });
}

/** The part of a cache key that names the forced SID playback ('' = the header's). */
export function renderKeySuffix(sid: SidForcedPlayback): string {
  if (!sid.chipModel && !sid.clock) return '';
  return `#sid=${sid.chipModel ?? '-'}/${sid.clock ?? '-'}`;
}

/** The forced SID playback a cache key was rendered with (renderKeySuffix read back). */
export function sidOverridesOfKey(key: string): SidForcedPlayback {
  const m = /#sid=([^/]+)\/(.+)$/.exec(key);
  if (!m) return {};
  const out: SidForcedPlayback = {};
  if (m[1] === '6581' || m[1] === '8580') out.chipModel = m[1];
  if (m[2] === 'PAL' || m[2] === 'NTSC') out.clock = m[2];
  return out;
}

/**
 * The cache key of a render of `source`: its content hash, plus the SID
 * Settings forced on it (the current settings unless the render's own are given).
 */
export async function renderCacheKey(
  source: ArrayBuffer,
  sid: SidForcedPlayback = sidRenderOverrides(source),
  /** The nuade player that renders it: a name, null for the other engines, undefined = as resolved for this file now. */
  nuadePlayerId?: string | null,
): Promise<string> {
  const hash = await hashFile(source);
  const engine = nuadePlayerId === undefined ? renderEngineSuffix(hash) : nuadePlayerId ? `#nuade=${nuadePlayerId}` : '';
  return hash + renderKeySuffix(sid) + engine;
}

/** Whether an entry's audio is what a render of its source gives under the current SID Settings. */
function rendersUnderCurrentSettings(entry: Pick<CachedAudio, 'hash' | 'sourceData'>): boolean {
  return entry.hash.slice(64) === renderKeySuffix(sidRenderOverrides(entry.sourceData)) + renderEngineSuffix(entry.hash.slice(0, 64));
}

/** Get cached audio by file hash (the render key under the current settings) */
export async function getCachedAudio(fileBuffer: ArrayBuffer, opts: CacheReadOptions = {}): Promise<CachedAudio | null> {
  try {
    const database = await initDB();
    const hash = await renderCacheKey(fileBuffer);

    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(hash);

      request.onsuccess = () => {
        const entry = request.result as CachedAudio | undefined;
        if (entry) {
          // Update access time (LRU)
          void touchCacheEntry(hash);
          resolve(asRead(entry, opts));
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('[DJAudioCache] Failed to get cached audio:', err);
    return null;
  }
}

/** Check if audio is cached (fast check without retrieving data) */
export async function isCached(fileBuffer: ArrayBuffer): Promise<boolean> {
  try {
    const database = await initDB();
    const hash = await renderCacheKey(fileBuffer);

    return new Promise((resolve) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getKey(hash);

      request.onsuccess = () => resolve(request.result !== undefined);
      request.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

const NUMBER_BYTES = 8; // a stored JS number

function arrayBytes(a: ArrayBuffer | ArrayBufferView | undefined): number {
  return a ? a.byteLength : 0;
}

/**
 * Every byte a cache entry stores: the WAV, the module source, the channel
 * track (scopes and stems - the stems alone are about 4x the WAV) and the
 * peak and analysis arrays. The cap and eviction count this, never the
 * stored sizeBytes (entries written before 2026-10-12 count the WAV only).
 */
export function entryStoredBytes(entry: Partial<CachedAudio>): number {
  let n = arrayBytes(entry.audioData) + arrayBytes(entry.sourceData);
  const track = entry.channelScopes;
  if (track) {
    for (const c of track.channels ?? []) n += arrayBytes(c);
    for (const st of track.stems ?? []) n += arrayBytes(st);
    for (const st of track.flacStems ?? []) n += arrayBytes(st);
  }
  n += (entry.waveformPeaks?.length ?? 0) * NUMBER_BYTES;
  n += (entry.onsets?.length ?? 0) * NUMBER_BYTES;
  for (const band of entry.frequencyPeaks ?? []) n += band.length * NUMBER_BYTES;
  n += ((entry.beatGrid?.beats.length ?? 0) + (entry.beatGrid?.downbeats.length ?? 0)) * NUMBER_BYTES;
  return n;
}

/** The cache's byte cap. */
export const MAX_CACHE_SIZE_BYTES = MAX_CACHE_SIZE_MB * 1024 * 1024;
let cacheCapBytes = MAX_CACHE_SIZE_BYTES;

/** Set the byte cap (tests use a small one); the default is MAX_CACHE_SIZE_BYTES. */
export function setCacheCapBytes(bytes: number = MAX_CACHE_SIZE_BYTES): void {
  cacheCapBytes = bytes;
}

/** Store pre-rendered audio in cache */
export async function cacheAudio(
  sourceFile: ArrayBuffer,
  filename: string,
  audioData: ArrayBuffer,
  duration: number,
  waveformPeaks: Float32Array,
  sampleRate: number,
  numberOfChannels: number,
  channelScopes?: ChannelScopeTrack,
  renderCapSec: number | null = null,
  playerCallHz?: number,
  /** The SID Settings the audio was rendered with ({} = the header's); default: the current ones. */
  sid: SidForcedPlayback = sidRenderOverrides(sourceFile),
): Promise<void> {
  try {
    const database = await initDB();
    const hash = await renderCacheKey(sourceFile, sid);
    // Check if a stub entry exists (from cacheSourceFile) — preserve its sourceData
    let existingSource: ArrayBuffer | undefined;
    try {
      const existing = await new Promise<CachedAudio | undefined>((resolve) => {
        const tx = database.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(hash);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(undefined);
      });
      existingSource = existing?.sourceData;
    } catch { /* ok */ }

    const entry: CachedAudio = {
      hash,
      filename,
      audioData,
      duration,
      waveformPeaks: Array.from(waveformPeaks),
      sampleRate,
      numberOfChannels,
      timestamp: Date.now(),
      sizeBytes: 0,
      sourceData: existingSource || sourceFile.slice(0), // preserve or store source
      channelScopes,
      scopeRenderVersion: CHANNEL_SCOPE_RENDER_VERSION,
      renderCapSec,
      playerCallHz: playerCallHz ?? null,
    };
    entry.sizeBytes = entryStoredBytes(entry);

    // Make room for the whole entry (it replaces any stub of the same hash).
    await evictIfNeeded(entry.sizeBytes, hash);

    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(entry);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('[DJAudioCache] Failed to cache audio:', err);
    throw err;
  }
}

/** Update access timestamp for LRU */
async function touchCacheEntry(hash: string): Promise<void> {
  try {
    const database = await initDB();
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getRequest = store.get(hash);

    getRequest.onsuccess = () => {
      const entry = getRequest.result as CachedAudio | undefined;
      if (entry) {
        entry.timestamp = Date.now();
        store.put(entry);
      }
    };
  } catch (err) {
    console.warn('[DJAudioCache] Failed to touch cache entry:', err);
  }
}

/** Get cache metadata (real total size, entry count), leaving out `excludeHash`. */
async function getCacheMetadata(excludeHash?: string): Promise<CacheMetadata> {
  try {
    const database = await initDB();

    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      // Use cursor to sum sizes without loading all audioData into memory.
      let totalSizeBytes = 0;
      let entryCount = 0;
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve({ totalSizeBytes, entryCount });
          return;
        }
        const entry = cursor.value as CachedAudio;
        if (entry.hash === excludeHash) { cursor.continue(); return; }
        totalSizeBytes += entryStoredBytes(entry);
        entryCount++;
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return { totalSizeBytes: 0, entryCount: 0 };
  }
}

/**
 * Evict oldest entries so the cache's real total (entryStoredBytes), with the
 * entry `keepHash` about to be written at `newEntrySizeBytes`, fits the cap.
 * The entry being written is never evicted for itself, and its current
 * stored bytes are not counted twice.
 */
async function evictIfNeeded(newEntrySizeBytes: number, keepHash?: string): Promise<void> {
  const metadata = await getCacheMetadata(keepHash);
  const maxSizeBytes = cacheCapBytes;

  // Check size limit
  if (metadata.totalSizeBytes + newEntrySizeBytes > maxSizeBytes) {
    const bytesToFree = (metadata.totalSizeBytes + newEntrySizeBytes) - maxSizeBytes;
    await evictOldestEntries(bytesToFree, 0, keepHash);
  }

  // Check entry count limit
  if (metadata.entryCount >= MAX_CACHE_ENTRIES) {
    await evictOldestEntries(0, metadata.entryCount - MAX_CACHE_ENTRIES + 1, keepHash);
  }
}

/** Evict oldest entries (LRU) until freeing at least `bytesToFree` or `countToFree` entries */
async function evictOldestEntries(bytesToFree = 0, countToFree = 0, keepHash?: string): Promise<void> {
  try {
    const database = await initDB();

    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      const request = index.openCursor(); // Iterates oldest-first

      let bytesFreed = 0;
      let entriesFreed = 0;

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (!cursor) {
          resolve();
          return;
        }

        const entry = cursor.value as CachedAudio;

        // Check if we've freed enough
        if (bytesFreed >= bytesToFree && entriesFreed >= countToFree) {
          resolve();
          return;
        }
        if (entry.hash === keepHash) { cursor.continue(); return; }

        // Delete this entry
        cursor.delete();
        bytesFreed += entryStoredBytes(entry);
        entriesFreed++;

        cursor.continue();
      };

      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('[DJAudioCache] Failed to evict entries:', err);
  }
}

/** Clear entire cache */
export async function clearAudioCache(): Promise<void> {
  try {
    const database = await initDB();

    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('[DJAudioCache] Cache cleared');
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('[DJAudioCache] Failed to clear cache:', err);
    throw err;
  }
}

/** Evict the oldest entries until the cache's real total fits its cap. */
export async function trimCacheToCap(): Promise<void> {
  try { await evictIfNeeded(0); } catch (err) { console.warn('[DJAudioCache] Trim to cap failed:', err); }
}

/** Bytes the cache can still take before it evicts (real total, entryStoredBytes). */
export async function cacheFreeBytes(): Promise<number> {
  return cacheCapBytes - (await getCacheMetadata()).totalSizeBytes;
}

/** Get cache statistics for UI display */
export async function getCacheStats(): Promise<{ sizeMB: number; entryCount: number }> {
  const metadata = await getCacheMetadata();
  return {
    sizeMB: metadata.totalSizeBytes / (1024 * 1024),
    entryCount: metadata.entryCount,
  };
}

/**
 * Update analysis data on an existing cache entry without rewriting audio.
 * This enables async analysis to be stored after the initial render/cache.
 */
export async function updateCacheAnalysis(
  fileBuffer: ArrayBuffer,
  analysis: {
    beatGrid?: BeatGridData;
    bpm?: number;
    bpmConfidence?: number;
    musicalKey?: string;
    keyConfidence?: number;
    onsets?: number[];
    frequencyPeaks?: number[][];
    rmsDb?: number;
    peakDb?: number;
    analysisVersion?: number;
    extended?: ExtendedAnalysis;
    // Genre classification
    genrePrimary?: string;
    genreSubgenre?: string;
    genreConfidence?: number;
    mood?: string;
    energy?: number;
    danceability?: number;
  },
  /** The SID Settings the analysed audio was rendered with; default: the current ones. */
  sid: SidForcedPlayback = sidRenderOverrides(fileBuffer),
): Promise<void> {
  try {
    const database = await initDB();
    const hash = await renderCacheKey(fileBuffer, sid);

    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(hash);

      getReq.onsuccess = () => {
        const entry = getReq.result as CachedAudio | undefined;
        if (!entry) {
          resolve(); // Entry not cached yet — skip
          return;
        }
        // Merge analysis fields
        Object.assign(entry, analysis);
        entry.timestamp = Date.now();
        entry.sizeBytes = entryStoredBytes(entry);
        const putReq = store.put(entry);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  } catch (err) {
    console.error('[DJAudioCache] Failed to update analysis:', err);
  }
}

/** The cache entry stored under `hash` (no LRU touch), or null. */
export async function getCachedEntryByHash(hash: string): Promise<CachedAudio | null> {
  try {
    const database = await initDB();
    return await new Promise<CachedAudio | null>((resolve) => {
      const req = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(hash);
      req.onsuccess = () => resolve((req.result as CachedAudio | undefined) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Store the scope track a background re-render produced on an existing entry
 * and mark the entry scope-rendered. Nothing else changes: the audio, the
 * waveform and the analysis stay as they are (the deck may be playing them).
 * `track` undefined = the render had no per-channel tap; the entry is marked
 * so it is not re-rendered again.
 */
export async function setCacheChannelScopes(hash: string, track: ChannelScopeTrack | undefined): Promise<void> {
  try {
    const database = await initDB();
    // The track (its stems about 4x the WAV) grows the entry: make room for its new size first.
    if (track) {
      const current = await getCachedEntryByHash(hash);
      if (!current) return;
      await evictIfNeeded(entryStoredBytes({ ...current, channelScopes: track }), hash);
    }
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(hash);
      getReq.onsuccess = () => {
        const entry = getReq.result as CachedAudio | undefined;
        if (!entry) { resolve(); return; }
        if (track) entry.channelScopes = track;
        entry.scopeRenderVersion = CHANNEL_SCOPE_RENDER_VERSION;
        entry.sizeBytes = entryStoredBytes(entry);
        const putReq = store.put(entry);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  } catch (err) {
    console.error('[DJAudioCache] Failed to store channel scopes:', err);
  }
}

/** Every old-shape entry that wants a scope re-render (cursor scan: one entry in memory at a time). */
export async function listScopelessEntries(): Promise<Array<{ hash: string; filename: string; duration: number }>> {
  try {
    const database = await initDB();
    return await new Promise((resolve) => {
      const out: Array<{ hash: string; filename: string; duration: number }> = [];
      const req = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) { resolve(out); return; }
        const e = cursor.value as CachedAudio;
        if (needsChannelScopeRerender(e)) out.push({ hash: e.hash, filename: e.filename, duration: e.duration });
        cursor.continue();
      };
      req.onerror = () => resolve(out);
    });
  } catch {
    return [];
  }
}

/** Remove a specific entry from cache */
/**
 * Cache the raw source module file alongside the rendered audio.
 * If the rendered WAV is evicted, we can re-render from this without network.
 * If an entry already exists, adds sourceData to it. Otherwise creates a stub entry.
 */
export async function cacheSourceFile(fileBuffer: ArrayBuffer, filename: string): Promise<void> {
  try {
    const database = await initDB();
    const hash = await renderCacheKey(fileBuffer);

    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const getReq = store.get(hash);
      getReq.onsuccess = () => {
        const existing = getReq.result as CachedAudio | undefined;
        if (existing) {
          // Add source to existing entry
          existing.sourceData = fileBuffer.slice(0);
          existing.timestamp = Date.now();
          existing.sizeBytes = entryStoredBytes(existing);
          store.put(existing);
        } else {
          // Create stub entry with just the source (no rendered audio yet)
          const stub: CachedAudio = {
            hash,
            filename,
            audioData: new ArrayBuffer(0), // empty — not yet rendered
            duration: 0,
            waveformPeaks: [],
            sampleRate: 44100,
            numberOfChannels: 1,
            timestamp: Date.now(),
            sizeBytes: fileBuffer.byteLength,
            sourceData: fileBuffer.slice(0),
          };
          store.put(stub);
        }
        resolve();
      };
      getReq.onerror = () => reject(getReq.error);
    });
  } catch (err) {
    console.warn('[DJAudioCache] Failed to cache source file:', err);
  }
}

/**
 * Retrieve the raw source module file from cache.
 * Returns null if not cached or if no source data was stored.
 */
export async function getSourceFile(fileBuffer: ArrayBuffer): Promise<ArrayBuffer | null> {
  try {
    const database = await initDB();
    const hash = await renderCacheKey(fileBuffer);

    return new Promise((resolve) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(hash);

      request.onsuccess = () => {
        const entry = request.result as CachedAudio | undefined;
        resolve(entry?.sourceData ?? null);
      };
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Check if a source file is cached by its Modland filename.
 * Uses a full scan — call sparingly (use for batch status checks, not per-frame).
 */
export async function isSourceCachedByName(filename: string): Promise<boolean> {
  try {
    const database = await initDB();
    return new Promise((resolve) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      // Use filename index to avoid loading entire cache
      if (store.indexNames.contains('filename')) {
        const index = store.index('filename');
        const request = index.getAll(filename);
        request.onsuccess = () => {
          const entries = request.result as CachedAudio[];
          resolve(entries.some(e => e.audioData.byteLength > 0 || (e.sourceData && e.sourceData.byteLength > 0)));
        };
        request.onerror = () => resolve(false);
      } else {
        // Fallback: cursor scan
        const request = store.openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) { resolve(false); return; }
          const e = cursor.value as CachedAudio;
          if (e.filename === filename && (e.audioData.byteLength > 0 || (e.sourceData && e.sourceData.byteLength > 0))) {
            resolve(true);
            return;
          }
          cursor.continue();
        };
        request.onerror = () => resolve(false);
      }
    });
  } catch {
    return false;
  }
}

/**
 * Batch check which filenames are cached. Returns a Set of cached filenames.
 * Much faster than calling isSourceCachedByName for each track individually.
 */
export async function getCachedFilenames(): Promise<Set<string>> {
  try {
    const database = await initDB();
    return new Promise((resolve) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const names = new Set<string>();
      // Use a cursor to iterate without loading all audioData into memory.
      // getAll() loaded the entire cache (up to 2GB of WAV data) which caused OOM.
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) { resolve(names); return; }
        const e = cursor.value as CachedAudio;
        if (e.audioData.byteLength > 0 || (e.sourceData && e.sourceData.byteLength > 0)) {
          names.add(e.filename);
        }
        cursor.continue();
      };
      request.onerror = () => resolve(new Set());
    });
  } catch {
    return new Set();
  }
}

/**
 * Get cached audio by filename (for playlist tracks that don't have the source buffer).
 * Scans all entries — use sparingly.
 *
 * Returns entries that have EITHER rendered audioData OR raw sourceData. Local
 * files added via cacheSourceFile() have an empty audioData stub but real
 * sourceData, and callers in the playlist loader need the sourceData to
 * decode/render themselves. Filtering purely on audioData.byteLength would
 * make those stubs invisible and force a file picker re-prompt.
 */
export async function getCachedAudioByFilename(filename: string, opts: CacheReadOptions = {}): Promise<CachedAudio | null> {
  try {
    const database = await initDB();
    return asRead(await new Promise<CachedAudio | null>((resolve) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      // Use the filename index (v2+) to load ONE matching record instead of getAll().
      // getAll() loaded the ENTIRE cache (potentially 2GB of WAV data) into memory —
      // with 20 visible playlist rows calling this concurrently, it caused Aw Snap OOM.
      if (store.indexNames.contains('filename')) {
        const index = store.index('filename');
        const request = index.getAll(filename);
        request.onsuccess = () => {
          const entries = (request.result as CachedAudio[]).filter(e =>
            e.audioData.byteLength > 0 || (e.sourceData && e.sourceData.byteLength > 0)
          );
          // A SID can have one render per forced chip model / clock: the one the current SID Settings
          // give first (asRead leaves any other's audio out, so the reader renders it).
          const match = entries.find(e => e.audioData.byteLength > 0 && rendersUnderCurrentSettings(e)) ?? entries[0];
          if (match) void touchCacheEntry(match.hash);
          resolve(match ?? null);
        };
        request.onerror = () => resolve(null);
      } else {
        // Fallback for pre-v2 databases (before filename index exists).
        // Use a cursor to avoid loading all records at once.
        const request = store.openCursor();
        let found: CachedAudio | null = null;
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) { resolve(found); return; }
          const entry = cursor.value as CachedAudio;
          if (entry.filename === filename &&
              (entry.audioData.byteLength > 0 || (entry.sourceData && entry.sourceData.byteLength > 0))) {
            found = entry;
            void touchCacheEntry(entry.hash);
            resolve(found);
            return; // stop iterating
          }
          cursor.continue();
        };
        request.onerror = () => resolve(null);
      }
    }), opts);
  } catch {
    return null;
  }
}

export async function evictCachedAudio(fileBuffer: ArrayBuffer): Promise<void> {
  try {
    const database = await initDB();
    const hash = await renderCacheKey(fileBuffer);

    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(hash);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('[DJAudioCache] Failed to evict cached audio:', err);
    throw err;
  }
}

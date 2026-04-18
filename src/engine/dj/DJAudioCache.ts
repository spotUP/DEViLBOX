/**
 * DJAudioCache - IndexedDB cache for pre-rendered UADE audio files
 *
 * Stores rendered audio buffers (encoded as WAV) keyed by file content hash.
 * Persistent across sessions, evicts oldest entries when storage limit reached.
 *
 * Cache key = SHA-256 hash of file content (handles renamed files, identical content).
 */

const DB_NAME = 'DEViLBOX_AudioCache';
const DB_VERSION = 1;
const STORE_NAME = 'audioCache';
const MAX_CACHE_SIZE_MB = 2000; // 2 GB limit (gig playlists need 200+ tracks)
const MAX_CACHE_ENTRIES = 1000; // Max 1000 cached files

export interface CachedAudio {
  hash: string;           // SHA-256 of source file
  filename: string;       // Original filename (for display)
  audioData: ArrayBuffer; // Encoded WAV audio
  duration: number;       // Seconds
  waveformPeaks: number[]; // Pre-computed overview peaks
  sampleRate: number;
  numberOfChannels: number;
  timestamp: number;      // Cache insertion time (for LRU)
  sizeBytes: number;      // Audio data size

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
  
  // ── Genre classification ──
  genrePrimary?: string;           // e.g. "Electronic", "Hip Hop"
  genreSubgenre?: string;          // e.g. "Techno", "Drum n Bass"
  genreConfidence?: number;        // 0-1
  mood?: string;                   // e.g. "Energetic", "Chill"
  energy?: number;                 // 0-1 (low → high energy)
  danceability?: number;           // 0-1

  // ── Source file (for offline re-rendering) ──
  sourceData?: ArrayBuffer;        // Original module file bytes (MOD/XM/IT etc.)
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
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        // Create object store with hash as key
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'hash' });
        // Index by timestamp for LRU eviction
        store.createIndex('timestamp', 'timestamp', { unique: false });
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

/** Get cached audio by file hash */
export async function getCachedAudio(fileBuffer: ArrayBuffer): Promise<CachedAudio | null> {
  try {
    const database = await initDB();
    const hash = await hashFile(fileBuffer);

    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(hash);

      request.onsuccess = () => {
        const entry = request.result as CachedAudio | undefined;
        if (entry) {
          // Update access time (LRU)
          void touchCacheEntry(hash);
          resolve(entry);
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
    const hash = await hashFile(fileBuffer);

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

/** Store pre-rendered audio in cache */
export async function cacheAudio(
  sourceFile: ArrayBuffer,
  filename: string,
  audioData: ArrayBuffer,
  duration: number,
  waveformPeaks: Float32Array,
  sampleRate: number,
  numberOfChannels: number,
): Promise<void> {
  try {
    const database = await initDB();
    const hash = await hashFile(sourceFile);
    const sizeBytes = audioData.byteLength;

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
      sizeBytes,
      sourceData: existingSource || sourceFile.slice(0), // preserve or store source
    };

    // Check if adding this entry would exceed limits
    await evictIfNeeded(sizeBytes);

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

/** Get cache metadata (total size, entry count) */
async function getCacheMetadata(): Promise<CacheMetadata> {
  try {
    const database = await initDB();

    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const entries = request.result as CachedAudio[];
        const totalSizeBytes = entries.reduce((sum, e) => sum + e.sizeBytes, 0);
        resolve({ totalSizeBytes, entryCount: entries.length });
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return { totalSizeBytes: 0, entryCount: 0 };
  }
}

/** Evict oldest entries if cache limits would be exceeded */
async function evictIfNeeded(newEntrySizeBytes: number): Promise<void> {
  const metadata = await getCacheMetadata();
  const maxSizeBytes = MAX_CACHE_SIZE_MB * 1024 * 1024;

  // Check size limit
  if (metadata.totalSizeBytes + newEntrySizeBytes > maxSizeBytes) {
    const bytesToFree = (metadata.totalSizeBytes + newEntrySizeBytes) - maxSizeBytes;
    await evictOldestEntries(bytesToFree);
  }

  // Check entry count limit
  if (metadata.entryCount >= MAX_CACHE_ENTRIES) {
    await evictOldestEntries(0, metadata.entryCount - MAX_CACHE_ENTRIES + 1);
  }
}

/** Evict oldest entries (LRU) until freeing at least `bytesToFree` or `countToFree` entries */
async function evictOldestEntries(bytesToFree = 0, countToFree = 0): Promise<void> {
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

        // Delete this entry
        cursor.delete();
        bytesFreed += entry.sizeBytes;
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
    analysisVersion?: number;
    // Genre classification
    genrePrimary?: string;
    genreSubgenre?: string;
    genreConfidence?: number;
    mood?: string;
    energy?: number;
    danceability?: number;
  },
): Promise<void> {
  try {
    const database = await initDB();
    const hash = await hashFile(fileBuffer);

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

/** Remove a specific entry from cache */
/**
 * Cache the raw source module file alongside the rendered audio.
 * If the rendered WAV is evicted, we can re-render from this without network.
 * If an entry already exists, adds sourceData to it. Otherwise creates a stub entry.
 */
export async function cacheSourceFile(fileBuffer: ArrayBuffer, filename: string): Promise<void> {
  try {
    const database = await initDB();
    const hash = await hashFile(fileBuffer);

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
    const hash = await hashFile(fileBuffer);

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
      const request = store.getAll();
      request.onsuccess = () => {
        const entries = request.result as CachedAudio[];
        resolve(entries.some(e => e.filename === filename && (e.audioData.byteLength > 0 || (e.sourceData && e.sourceData.byteLength > 0))));
      };
      request.onerror = () => resolve(false);
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
      const request = store.getAll();
      request.onsuccess = () => {
        const entries = request.result as CachedAudio[];
        const names = new Set<string>();
        for (const e of entries) {
          if (e.audioData.byteLength > 0 || (e.sourceData && e.sourceData.byteLength > 0)) {
            names.add(e.filename);
          }
        }
        resolve(names);
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
export async function getCachedAudioByFilename(filename: string): Promise<CachedAudio | null> {
  try {
    const database = await initDB();
    return new Promise((resolve) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const entries = request.result as CachedAudio[];
        const match = entries.find(e =>
          e.filename === filename &&
          (e.audioData.byteLength > 0 || (e.sourceData && e.sourceData.byteLength > 0))
        );
        if (match) void touchCacheEntry(match.hash);
        resolve(match ?? null);
      };
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function evictCachedAudio(fileBuffer: ArrayBuffer): Promise<void> {
  try {
    const database = await initDB();
    const hash = await hashFile(fileBuffer);

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

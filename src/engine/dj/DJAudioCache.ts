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
const MAX_CACHE_SIZE_MB = 500; // 500 MB limit
const MAX_CACHE_ENTRIES = 100; // Max 100 cached files

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
async function hashFile(buffer: ArrayBuffer): Promise<string> {
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

    const entry: CachedAudio = {
      hash,
      filename,
      audioData,
      duration,
      waveformPeaks: Array.from(waveformPeaks), // Convert to plain array for IDB
      sampleRate,
      numberOfChannels,
      timestamp: Date.now(),
      sizeBytes,
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

/** Remove a specific entry from cache */
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

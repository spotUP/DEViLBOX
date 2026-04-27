/**
 * TrackerAnalysisCache - IndexedDB persistence for tracker analysis results
 *
 * Stores genre/mood/BPM analysis keyed by file content hash.
 * Persistent across sessions, lightweight since we only store analysis metadata.
 */

import type { FullAnalysisResult } from '@/stores/useTrackerAnalysisStore';

const DB_NAME = 'DEViLBOX_TrackerAnalysis';
const DB_VERSION = 2; // bumped: CED-based genre classifier replaces hand-rolled BPM waterfall
const STORE_NAME = 'analysisCache';
const MAX_ENTRIES = 500; // Max cached analyses

export interface CachedAnalysis {
  hash: string;              // Content hash of source file
  result: FullAnalysisResult;
  timestamp: number;         // Cache insertion time
}

let db: IDBDatabase | null = null;

// ── Database Management ──────────────────────────────────────────────────────

async function initDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[TrackerAnalysisCache] Failed to open IndexedDB');
      reject(new Error('Failed to open IndexedDB'));
    };

    request.onsuccess = () => {
      db = request.result;
      console.log('[TrackerAnalysisCache] Database initialized');
      resolve(db!);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      // Wipe the store on any version upgrade so stale genre results don't persist.
      if (database.objectStoreNames.contains(STORE_NAME)) {
        database.deleteObjectStore(STORE_NAME);
      }
      const store = database.createObjectStore(STORE_NAME, { keyPath: 'hash' });
      store.createIndex('timestamp', 'timestamp', { unique: false });
    };
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Store an analysis result by file hash.
 */
export async function cacheAnalysis(hash: string, result: FullAnalysisResult): Promise<void> {
  try {
    const database = await initDB();
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const entry: CachedAnalysis = {
      hash,
      result,
      timestamp: Date.now(),
    };

    await promisifyRequest(store.put(entry));
    
    // Evict old entries if over limit
    await evictOldEntries();
    
    console.log(`[TrackerAnalysisCache] Cached analysis for ${hash.slice(0, 8)}`);
  } catch (err) {
    console.error('[TrackerAnalysisCache] Failed to cache:', err);
  }
}

/**
 * Get a cached analysis by file hash.
 */
export async function getCachedAnalysis(hash: string): Promise<FullAnalysisResult | null> {
  try {
    const database = await initDB();
    const tx = database.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    const result = await promisifyRequest<CachedAnalysis | undefined>(store.get(hash));
    
    if (result) {
      console.log(`[TrackerAnalysisCache] Cache hit for ${hash.slice(0, 8)}`);
      return result.result;
    }
    
    return null;
  } catch (err) {
    console.error('[TrackerAnalysisCache] Failed to read:', err);
    return null;
  }
}

/**
 * Load all cached entries (for initial store hydration).
 */
export async function loadAllCachedAnalyses(): Promise<Array<{ hash: string; result: FullAnalysisResult }>> {
  try {
    const database = await initDB();
    const tx = database.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    const all = await promisifyRequest<CachedAnalysis[]>(store.getAll());
    
    console.log(`[TrackerAnalysisCache] Loaded ${all.length} cached analyses`);
    
    return all.map(entry => ({
      hash: entry.hash,
      result: entry.result,
    }));
  } catch (err) {
    console.error('[TrackerAnalysisCache] Failed to load all:', err);
    return [];
  }
}

/**
 * Clear all cached analyses.
 */
export async function clearCache(): Promise<void> {
  try {
    const database = await initDB();
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    await promisifyRequest(store.clear());
    console.log('[TrackerAnalysisCache] Cache cleared');
  } catch (err) {
    console.error('[TrackerAnalysisCache] Failed to clear:', err);
  }
}

/**
 * Get cache statistics.
 */
export async function getCacheStats(): Promise<{ count: number; oldestTimestamp: number | null }> {
  try {
    const database = await initDB();
    const tx = database.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('timestamp');

    const count = await promisifyRequest<number>(store.count());
    
    // Get oldest entry
    const cursor = await promisifyRequest<IDBCursorWithValue | null>(
      index.openCursor()
    );
    
    const oldestTimestamp = cursor?.value?.timestamp ?? null;
    
    return { count, oldestTimestamp };
  } catch (err) {
    console.error('[TrackerAnalysisCache] Failed to get stats:', err);
    return { count: 0, oldestTimestamp: null };
  }
}

// ── Internal Helpers ─────────────────────────────────────────────────────────

async function evictOldEntries(): Promise<void> {
  try {
    const database = await initDB();
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('timestamp');

    const count = await promisifyRequest<number>(store.count());
    
    if (count <= MAX_ENTRIES) return;
    
    // Delete oldest entries
    const toDelete = count - MAX_ENTRIES;
    let deleted = 0;
    
    const cursor = await promisifyRequest<IDBCursorWithValue | null>(
      index.openCursor()
    );
    
    if (cursor) {
      const iterateCursor = async (c: IDBCursorWithValue) => {
        if (deleted >= toDelete) return;
        
        await promisifyRequest(c.delete());
        deleted++;
        
        c.continue();
      };
      
      await iterateCursor(cursor);
    }
    
    if (deleted > 0) {
      console.log(`[TrackerAnalysisCache] Evicted ${deleted} old entries`);
    }
  } catch (err) {
    console.error('[TrackerAnalysisCache] Failed to evict:', err);
  }
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

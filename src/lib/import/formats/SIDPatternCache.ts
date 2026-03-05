/**
 * SIDPatternCache — IndexedDB cache for parsed SID pattern data.
 *
 * Keyed by SHA-256 hash of the SID file content. Saves the expensive
 * 18 000-frame 6502 emulation on subsequent loads of the same file.
 */

import type { Pattern } from '@/types';

const DB_NAME = 'DEViLBOX_SIDPatternCache';
const DB_VERSION = 1;
const STORE_NAME = 'patterns';
const CACHE_VERSION = 1; // bump when parser algorithm changes
const MAX_ENTRIES = 500;

export interface CachedSIDPatterns {
  hash: string;
  cacheVersion: number;
  patterns: Pattern[];
  songPositions: number[];
  restartPosition: number;
  speed: number;
  bpm: number;
  timestamp: number;
}

let db: IDBDatabase | null = null;

async function initDB(): Promise<IDBDatabase> {
  if (db) return db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(new Error('Failed to open SID pattern cache'));
    req.onsuccess = () => { db = req.result; resolve(db!); };
    req.onupgradeneeded = (e) => {
      const database = (e.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'hash' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

async function hashBuffer(buffer: ArrayBuffer): Promise<string> {
  const hashBuf = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Look up cached patterns for a SID file. Returns null on cache miss. */
export async function getCachedPatterns(buffer: ArrayBuffer): Promise<CachedSIDPatterns | null> {
  try {
    const database = await initDB();
    const hash = await hashBuffer(buffer);
    return new Promise((resolve) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(hash);
      req.onsuccess = () => {
        const entry = req.result as CachedSIDPatterns | undefined;
        if (entry && entry.cacheVersion === CACHE_VERSION) {
          resolve(entry);
        } else {
          resolve(null); // stale or missing
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** Store parsed pattern data in the cache. Fire-and-forget. */
export async function cachePatterns(
  buffer: ArrayBuffer,
  patterns: Pattern[],
  songPositions: number[],
  restartPosition: number,
  speed: number,
  bpm: number,
): Promise<void> {
  try {
    const database = await initDB();
    const hash = await hashBuffer(buffer);

    const entry: CachedSIDPatterns = {
      hash, cacheVersion: CACHE_VERSION,
      patterns, songPositions, restartPosition, speed, bpm,
      timestamp: Date.now(),
    };

    // Evict oldest entries if over limit
    const tx1 = database.transaction(STORE_NAME, 'readonly');
    const countReq = tx1.objectStore(STORE_NAME).count();
    await new Promise<void>((resolve) => {
      countReq.onsuccess = async () => {
        if (countReq.result >= MAX_ENTRIES) {
          try {
            const evictTx = database.transaction(STORE_NAME, 'readwrite');
            const idx = evictTx.objectStore(STORE_NAME).index('timestamp');
            const cursor = idx.openCursor(); // ascending = oldest first
            let evicted = 0;
            const toEvict = countReq.result - MAX_ENTRIES + 10; // evict 10 extra
            cursor.onsuccess = () => {
              const c = cursor.result;
              if (c && evicted < toEvict) {
                c.delete();
                evicted++;
                c.continue();
              }
            };
          } catch { /* best effort */ }
        }
        resolve();
      };
      countReq.onerror = () => resolve();
    });

    // Store the entry
    const tx2 = database.transaction(STORE_NAME, 'readwrite');
    tx2.objectStore(STORE_NAME).put(entry);
  } catch {
    // Cache failures are non-fatal
  }
}

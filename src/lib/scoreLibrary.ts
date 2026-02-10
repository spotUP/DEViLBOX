/**
 * Score Library - IndexedDB storage for game high scores
 * Persists Nibbles scores locally in the browser
 */

const DB_NAME = 'devilbox-scores';
const DB_VERSION = 1;
const STORE_NAME = 'nibbles';

export interface NibblesScore {
  id?: number;
  name: string;
  score: number;
  level: number;
  date: Date;
  players: number;
  speed: number;
}

class ScoreLibrary {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[ScoreLibrary] Failed to open database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[ScoreLibrary] Database initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          store.createIndex('score', 'score', { unique: false });
          store.createIndex('date', 'date', { unique: false });
          console.log('[ScoreLibrary] Nibbles score store created');
        }
      };
    });

    return this.initPromise;
  }

  private async ensureDb(): Promise<IDBDatabase> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');
    return this.db;
  }

  /**
   * Save a score to the highscore table
   */
  async saveScore(score: Omit<NibblesScore, 'id' | 'date'>): Promise<number> {
    const db = await this.ensureDb();
    const entry: NibblesScore = {
      ...score,
      date: new Date(),
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(entry);

      request.onsuccess = () => {
        resolve(request.result as number);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Get top highscores
   */
  async getTopScores(limit: number = 10): Promise<NibblesScore[]> {
    const db = await this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('score');
      const request = index.openCursor(null, 'prev'); // Descending order (highest first)
      
      const results: NibblesScore[] = [];
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Clear all scores
   */
  async clearAll(): Promise<void> {
    const db = await this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

// Singleton instance
export const scoreLibrary = new ScoreLibrary();

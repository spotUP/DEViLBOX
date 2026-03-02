// Modland Database Service
// Provides queries against the Modland SQLite database

import initSqlJs, { Database } from 'sql.js';
import type { ModlandFile, ModlandSample, ModlandSearchResult } from '../../types/modland';
import { extractMetadata } from './ModlandMetadata';

class ModlandService {
  private db: Database | null = null;
  private loading: Promise<void> | null = null;

  /**
   * Initialize the database (lazy load)
   */
  async init(): Promise<void> {
    if (this.db) return;
    if (this.loading) return this.loading;

    this.loading = (async () => {
      try {
        const SQL = await initSqlJs({
          locateFile: (file: string) => `/sql-wasm.wasm`
        });

        const response = await fetch('/modland/modland_hash.db');
        if (!response.ok) {
          throw new Error(`Failed to load Modland database: ${response.statusText}`);
        }

        const buffer = await response.arrayBuffer();
        this.db = new SQL.Database(new Uint8Array(buffer));
        console.log('✅ Modland database loaded (865MB, 727K+ files)');
      } catch (error) {
        console.error('Failed to load Modland database:', error);
        throw error;
      }
    })();

    return this.loading;
  }

  /**
   * Find file by hash
   */
  async findByHash(hash: string): Promise<ModlandFile | null> {
    await this.init();
    if (!this.db) return null;

    const stmt = this.db.prepare('SELECT * FROM files WHERE hash_id = ?');
    stmt.bind([hash]);

    if (stmt.step()) {
      const row = stmt.getAsObject() as ModlandFile;
      stmt.free();
      return row;
    }

    stmt.free();
    return null;
  }

  /**
   * Search files by filename
   */
  async searchFiles(query: string, limit = 100): Promise<ModlandSearchResult[]> {
    await this.init();
    if (!this.db) return [];

    const stmt = this.db.prepare(
      'SELECT * FROM files WHERE url LIKE ? LIMIT ?'
    );
    stmt.bind([`%${query}%`, limit]);

    const results: ModlandSearchResult[] = [];
    while (stmt.step()) {
      const file = stmt.getAsObject() as ModlandFile;
      const metadata = extractMetadata(file);
      results.push({ file, metadata });
    }

    stmt.free();
    return results;
  }

  /**
   * Get files by format (extension)
   */
  async getFilesByFormat(extension: string, limit = 100): Promise<ModlandSearchResult[]> {
    await this.init();
    if (!this.db) return [];

    const stmt = this.db.prepare(
      'SELECT * FROM files WHERE url LIKE ? LIMIT ?'
    );
    stmt.bind([`%.${extension}`, limit]);

    const results: ModlandSearchResult[] = [];
    while (stmt.step()) {
      const file = stmt.getAsObject() as ModlandFile;
      const metadata = extractMetadata(file);
      results.push({ file, metadata });
    }

    stmt.free();
    return results;
  }

  /**
   * Get samples for a file
   */
  async getSamplesByFile(songId: number): Promise<ModlandSample[]> {
    await this.init();
    if (!this.db) return [];

    const stmt = this.db.prepare(
      'SELECT * FROM samples WHERE song_id = ? AND text != "" ORDER BY song_sample_id'
    );
    stmt.bind([songId]);

    const samples: ModlandSample[] = [];
    while (stmt.step()) {
      samples.push(stmt.getAsObject() as ModlandSample);
    }

    stmt.free();
    return samples;
  }

  /**
   * Search samples by name
   */
  async searchSamples(query: string, limit = 100): Promise<ModlandSample[]> {
    await this.init();
    if (!this.db) return [];

    const stmt = this.db.prepare(
      'SELECT * FROM samples WHERE text LIKE ? AND length > 0 LIMIT ?'
    );
    stmt.bind([`%${query}%`, limit]);

    const samples: ModlandSample[] = [];
    while (stmt.step()) {
      samples.push(stmt.getAsObject() as ModlandSample);
    }

    stmt.free();
    return samples;
  }

  /**
   * Get random files (for discovery)
   */
  async getRandomFiles(count = 20): Promise<ModlandSearchResult[]> {
    await this.init();
    if (!this.db) return [];

    // SQLite random sampling
    const stmt = this.db.prepare(
      'SELECT * FROM files WHERE song_id IN (SELECT song_id FROM files ORDER BY RANDOM() LIMIT ?)'
    );
    stmt.bind([count]);

    const results: ModlandSearchResult[] = [];
    while (stmt.step()) {
      const file = stmt.getAsObject() as ModlandFile;
      const metadata = extractMetadata(file);
      results.push({ file, metadata });
    }

    stmt.free();
    return results;
  }

  /**
   * Get format statistics
   */
  async getFormatStats(): Promise<Record<string, number>> {
    await this.init();
    if (!this.db) return {};

    const extensions = ['.mod', '.xm', '.it', '.s3m', '.fur', '.ftm', '.sid', '.spc', '.nsf'];
    const stats: Record<string, number> = {};

    for (const ext of extensions) {
      const stmt = this.db.prepare('SELECT COUNT(*) as count FROM files WHERE url LIKE ?');
      stmt.bind([`%${ext}`]);
      
      if (stmt.step()) {
        const result = stmt.getAsObject() as { count: number };
        stats[ext] = result.count;
      }
      stmt.free();
    }

    return stats;
  }

  /**
   * Check if database is loaded
   */
  isLoaded(): boolean {
    return this.db !== null;
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Singleton instance
export const modlandService = new ModlandService();

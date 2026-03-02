/**
 * Modland Hash Database Service
 * 
 * Provides SHA-256 hash lookups for file identification, sample metadata, and pattern matching.
 * Uses the modland_hash.db (865MB, updated daily) for duplicate detection and verification.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = process.env.DB_DIR || path.join(__dirname, '../../data');
const HASH_DB_PATH = path.join(DB_DIR, 'modland_hash.db');

let hashDb: Database.Database | null = null;

/**
 * Initialize the hash database connection (lazy-loaded)
 */
export function initHashDatabase(): Database.Database {
  if (hashDb) return hashDb;

  if (!fs.existsSync(HASH_DB_PATH)) {
    throw new Error(`Modland hash database not found: ${HASH_DB_PATH}`);
  }

  console.log('[ModlandHash] Loading hash database:', HASH_DB_PATH);
  hashDb = new Database(HASH_DB_PATH, { readonly: true });
  
  // Enable memory-mapped I/O for performance
  hashDb.pragma('mmap_size = 30000000000');
  
  console.log('[ModlandHash] Database loaded successfully');
  return hashDb;
}

/**
 * Get database instance (initializes on first call)
 */
function getDb(): Database.Database {
  if (!hashDb) {
    initHashDatabase();
  }
  return hashDb!;
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface HashFile {
  song_id: number;
  hash_id: string;
  pattern_hash: number | null;
  url: string;
}

export interface HashSample {
  hash_id: string;
  song_id: number;
  song_sample_id: number;
  text: string;
  length_bytes: number;
  length: number;
}

export interface HashLookupResult {
  match: boolean;
  file?: HashFile;
  sample_count?: number;
}

// ── Query Functions ─────────────────────────────────────────────────────────

/**
 * Find file by SHA-256 hash
 */
export function findByHash(hash: string): HashLookupResult {
  const db = getDb();
  
  // Query files table
  const file = db.prepare(`
    SELECT song_id, hash_id, pattern_hash, url
    FROM files
    WHERE hash_id = ?
  `).get(hash) as HashFile | undefined;
  
  if (!file) {
    return { match: false };
  }
  
  // Count samples for this file
  const sampleCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM samples
    WHERE song_id = ?
  `).get(file.song_id) as { count: number };
  
  return {
    match: true,
    file,
    sample_count: sampleCount.count
  };
}

/**
 * Get all samples for a file by song_id
 */
export function getSamplesBySongId(songId: number): HashSample[] {
  const db = getDb();
  
  const samples = db.prepare(`
    SELECT hash_id, song_id, song_sample_id, text, length_bytes, length
    FROM samples
    WHERE song_id = ?
    ORDER BY song_sample_id
  `).all(songId) as HashSample[];
  
  return samples;
}

/**
 * Find files with the same pattern hash (remixes, variations)
 */
export function findByPatternHash(patternHash: number): HashFile[] {
  const db = getDb();
  
  const files = db.prepare(`
    SELECT song_id, hash_id, pattern_hash, url
    FROM files
    WHERE pattern_hash = ?
    ORDER BY url
    LIMIT 100
  `).all(patternHash) as HashFile[];
  
  return files;
}

/**
 * Get database statistics
 */
export function getHashDbStats() {
  const db = getDb();
  
  const fileCount = db.prepare('SELECT COUNT(*) as count FROM files').get() as { count: number };
  const sampleCount = db.prepare('SELECT COUNT(*) as count FROM samples').get() as { count: number };
  const uniquePatterns = db.prepare('SELECT COUNT(DISTINCT pattern_hash) as count FROM files WHERE pattern_hash IS NOT NULL').get() as { count: number };
  
  return {
    files: fileCount.count,
    samples: sampleCount.count,
    unique_patterns: uniquePatterns.count
  };
}

/**
 * Close database connection
 */
export function closeHashDatabase() {
  if (hashDb) {
    hashDb.close();
    hashDb = null;
    console.log('[ModlandHash] Database closed');
  }
}

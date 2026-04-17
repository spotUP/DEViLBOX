/**
 * Database setup using better-sqlite3
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = process.env.DB_DIR || path.join(__dirname, '../../data');
const DB_PATH = path.join(DB_DIR, 'devilbox.db');

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_login INTEGER
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS file_revisions (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      revision_number INTEGER NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_revisions_file_id ON file_revisions(file_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_revisions_file_revision ON file_revisions(file_id, revision_number);

    -- Modland file index (ftp.modland.com catalog)
    CREATE TABLE IF NOT EXISTS modland_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      format TEXT NOT NULL,
      author TEXT NOT NULL,
      filename TEXT NOT NULL,
      full_path TEXT NOT NULL UNIQUE,
      extension TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS modland_fts USING fts5(
      author, filename, format,
      content=modland_files, content_rowid=id,
      tokenize='unicode61 remove_diacritics 2'
    );

    -- Triggers to keep FTS in sync
    CREATE TRIGGER IF NOT EXISTS modland_ai AFTER INSERT ON modland_files BEGIN
      INSERT INTO modland_fts(rowid, author, filename, format)
        VALUES (new.id, new.author, new.filename, new.format);
    END;
    CREATE TRIGGER IF NOT EXISTS modland_ad AFTER DELETE ON modland_files BEGIN
      INSERT INTO modland_fts(modland_fts, rowid, author, filename, format)
        VALUES ('delete', old.id, old.author, old.filename, old.format);
    END;

    CREATE TABLE IF NOT EXISTS modland_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- SongDB tables (audacious-uade-tools metadata database)
    CREATE TABLE IF NOT EXISTS songdb_lengths (
      hash TEXT NOT NULL,
      min_subsong INTEGER NOT NULL,
      subsong_data TEXT NOT NULL,
      PRIMARY KEY (hash, min_subsong)
    );

    CREATE TABLE IF NOT EXISTS songdb_modinfos (
      hash TEXT PRIMARY KEY,
      format TEXT,
      channels INTEGER
    );

    CREATE TABLE IF NOT EXISTS songdb_metadata (
      hash TEXT PRIMARY KEY,
      authors TEXT,
      publishers TEXT,
      album TEXT,
      year TEXT
    );

    CREATE TABLE IF NOT EXISTS songdb_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- DJ set recordings (event-based, not waveform)
    CREATE TABLE IF NOT EXISTS dj_sets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      track_list TEXT NOT NULL,
      events TEXT NOT NULL,
      mic_audio_id TEXT,
      play_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_dj_sets_user ON dj_sets(user_id);
    CREATE INDEX IF NOT EXISTS idx_dj_sets_created ON dj_sets(created_at DESC);

    -- Binary blobs for non-Modland module files and mic recordings
    CREATE TABLE IF NOT EXISTS dj_blobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      data BLOB NOT NULL,
      size_bytes INTEGER NOT NULL,
      sha256 TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_dj_blobs_user ON dj_blobs(user_id);
    CREATE INDEX IF NOT EXISTS idx_dj_blobs_sha256 ON dj_blobs(sha256);

    -- Module ratings (Modland + HVSC star ratings by logged-in users)
    CREATE TABLE IF NOT EXISTS module_ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      source TEXT NOT NULL,
      item_key TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(user_id, source, item_key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_ratings_item ON module_ratings(source, item_key);
    CREATE INDEX IF NOT EXISTS idx_ratings_user ON module_ratings(user_id);

    -- Song analysis cache (shared across all users)
    -- Binary-packed arrays for compact storage (~5KB/song vs ~15KB JSON)
    CREATE TABLE IF NOT EXISTS song_analysis (
      hash TEXT PRIMARY KEY,
      bpm REAL,
      bpm_confidence REAL,
      time_signature INTEGER DEFAULT 4,
      musical_key TEXT,
      key_confidence REAL,
      rms_db REAL,
      peak_db REAL,
      genre_primary TEXT,
      genre_subgenre TEXT,
      genre_confidence REAL,
      mood TEXT,
      energy REAL,
      danceability REAL,
      duration REAL,
      beats BLOB,
      downbeats BLOB,
      waveform_peaks BLOB,
      frequency_peaks BLOB,
      analysis_version INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    -- Shared playlists (cloud-saved DJ playlists with public/private visibility)
    CREATE TABLE IF NOT EXISTS shared_playlists (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      playlist_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      visibility TEXT NOT NULL DEFAULT 'private',
      track_count INTEGER DEFAULT 0,
      total_duration INTEGER DEFAULT 0,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_shared_playlists_user ON shared_playlists(user_id);
    CREATE INDEX IF NOT EXISTS idx_shared_playlists_visibility ON shared_playlists(visibility);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_shared_playlists_user_playlist ON shared_playlists(user_id, playlist_id);
  `);

  // Migration: add type column to files table
  const cols = db.prepare("PRAGMA table_info(files)").all() as { name: string }[];
  if (!cols.some(c => c.name === 'type')) {
    db.exec("ALTER TABLE files ADD COLUMN type TEXT NOT NULL DEFAULT 'songs'");
    console.log('[DB] Migration: added type column to files table');
  }

  console.log('[DB] Database initialized at:', DB_PATH);
}

export default db;

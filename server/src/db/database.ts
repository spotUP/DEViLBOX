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

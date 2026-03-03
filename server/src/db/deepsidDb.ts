/**
 * DeepSID database — SQLite mirror of the DeepSID MySQL database.
 * Contains composer profiles, HVSC file metadata, tags, players, etc.
 *
 * Source: https://chordian.net/files/deepsid/DeepSID_Database.zip
 * Converted from MySQL dump → SQLite via mysql2sqlite.py
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = process.env.DB_DIR || path.join(__dirname, '../../data');
const DB_PATH = path.join(DB_DIR, 'deepsid.db');

let deepsidDb: Database.Database | null = null;

export function getDeepSIDDb(): Database.Database | null {
  if (deepsidDb) return deepsidDb;
  if (!fs.existsSync(DB_PATH)) {
    console.warn('[DeepSID] Database not found at:', DB_PATH);
    return null;
  }
  try {
    deepsidDb = new Database(DB_PATH, { readonly: true });
    deepsidDb.pragma('journal_mode = WAL');
    console.log('[DeepSID] Database loaded:', DB_PATH);
    return deepsidDb;
  } catch (err) {
    console.error('[DeepSID] Failed to open database:', err);
    return null;
  }
}

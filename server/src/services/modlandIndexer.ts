/**
 * Modland Indexer - Downloads and indexes ftp.modland.com catalog
 *
 * Uses `allmods.zip` (~6MB) listing file to build a local SQLite FTS5 index.
 * Schedules 24-hour updates. Filters to DEViLBOX-playable formats only.
 */

import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import db from '../db/database';

// ── Format whitelist (modland folder name → file extension) ─────────────────

const PLAYABLE_FORMATS: Record<string, string> = {
  'Protracker': 'mod',
  'Fasttracker': 'xm',
  'Fasttracker 2': 'xm',
  'Impulsetracker': 'it',
  'Screamtracker 3': 's3m',
  'Screamtracker 2': 'stm',
  'OpenMPT MPTM': 'mptm',
  'Composer 669': '669',
  'Digibooster': 'digi',
  'Digibooster Pro': 'dbm',
  'Farandole Composer': 'far',
  'Oktalyzer': 'okt',
  'Ultratracker': 'ult',
  'Multitracker': 'mtm',
  'OctaMED MMD0': 'med',
  'OctaMED MMD1': 'med',
  'OctaMED MMD2': 'med',
  'OctaMED MMD3': 'med',
  'Soundtracker': 'mod',
  'Soundtracker 2.6': 'mod',
  'Soundtracker Pro II': 'mod',
  'Digital Tracker MOD': 'mod',
  'Digital Tracker DTM': 'dtm',
  'Graoumf Tracker': 'gt2',
  'Graoumf Tracker 2': 'gt2',
};

// ── State ───────────────────────────────────────────────────────────────────

let indexingStatus: 'ready' | 'indexing' | 'not_initialized' = 'not_initialized';
let updateTimer: ReturnType<typeof setInterval> | null = null;

// Cached format counts (refreshed on index update)
let cachedFormats: { format: string; count: number }[] | null = null;

// ── Paths ───────────────────────────────────────────────────────────────────

const DATA_DIR = process.env.DB_DIR || path.join(__dirname, '../../data');
const CACHE_DIR = path.join(DATA_DIR, 'modland-cache');
const FILES_CACHE_DIR = path.join(CACHE_DIR, 'files');
const ALLMODS_PATH = path.join(CACHE_DIR, 'allmods.zip');

function ensureCacheDirs() {
  if (!fs.existsSync(FILES_CACHE_DIR)) {
    fs.mkdirSync(FILES_CACHE_DIR, { recursive: true });
  }
}

// ── Parsing ─────────────────────────────────────────────────────────────────

// Line format: <filesize>\t<Format>/<Author>/<filename>
const LINE_REGEX = /^\d+\t([^/]+)\/([^/]+)\/(.+)$/;

interface ParsedEntry {
  format: string;
  author: string;
  filename: string;
  fullPath: string; // pub/modules/<Format>/<Author>/<filename>
  extension: string;
}

function parseAllmodsLine(line: string): ParsedEntry | null {
  const match = line.match(LINE_REGEX);
  if (!match) return null;

  const [, format, author, filename] = match;
  const ext = PLAYABLE_FORMATS[format];
  if (!ext) return null; // Not a playable format

  return {
    format,
    author,
    filename,
    fullPath: `pub/modules/${format}/${author}/${filename}`,
    extension: ext,
  };
}

// ── Download & Index ────────────────────────────────────────────────────────

async function downloadAllmods(): Promise<Buffer> {
  console.log('[Modland] Downloading allmods.zip...');
  const response = await fetch('https://modland.com/allmods.zip');
  if (!response.ok) {
    throw new Error(`Failed to download allmods.zip: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  console.log(`[Modland] Downloaded ${(buffer.length / 1024 / 1024).toFixed(1)}MB`);
  return buffer;
}

function extractAllmodsText(zipBuffer: Buffer): string {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();
  if (entries.length === 0) {
    throw new Error('allmods.zip is empty');
  }
  // The zip contains a single text file
  const text = entries[0].getData().toString('utf8');
  console.log(`[Modland] Extracted listing: ${text.split('\n').length} lines`);
  return text;
}

function indexEntries(text: string): number {
  const lines = text.split('\n');
  const BATCH_SIZE = 10000;

  // Start a transaction for the full replace
  const deleteAll = db.prepare('DELETE FROM modland_files');
  const insert = db.prepare(
    'INSERT OR IGNORE INTO modland_files (format, author, filename, full_path, extension) VALUES (?, ?, ?, ?, ?)'
  );

  let totalInserted = 0;

  db.transaction(() => {
    // Clear old data
    deleteAll.run();

    // Re-populate FTS (delete all FTS content first)
    db.prepare("INSERT INTO modland_fts(modland_fts) VALUES ('delete-all')").run();

    let batch: ParsedEntry[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const entry = parseAllmodsLine(trimmed);
      if (!entry) continue;

      batch.push(entry);

      if (batch.length >= BATCH_SIZE) {
        for (const e of batch) {
          insert.run(e.format, e.author, e.filename, e.fullPath, e.extension);
        }
        totalInserted += batch.length;
        batch = [];
      }
    }

    // Flush remaining
    if (batch.length > 0) {
      for (const e of batch) {
        insert.run(e.format, e.author, e.filename, e.fullPath, e.extension);
      }
      totalInserted += batch.length;
    }

    // Rebuild FTS from content table
    db.prepare("INSERT INTO modland_fts(modland_fts) VALUES ('rebuild')").run();
  })();

  return totalInserted;
}

function setMeta(key: string, value: string) {
  db.prepare('INSERT OR REPLACE INTO modland_meta (key, value) VALUES (?, ?)').run(key, value);
}

function getMeta(key: string): string | undefined {
  const row = db.prepare('SELECT value FROM modland_meta WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

// ── Cache Management ────────────────────────────────────────────────────────

const MAX_CACHE_BYTES = 500 * 1024 * 1024; // 500MB

export function getCacheFilePath(remotePath: string): string {
  // Flatten path into safe filename
  return path.join(FILES_CACHE_DIR, remotePath.replace(/\//g, '__'));
}

export function getCachedFile(remotePath: string): Buffer | null {
  const filePath = getCacheFilePath(remotePath);
  if (!fs.existsSync(filePath)) return null;

  // Touch atime for LRU
  try {
    const now = new Date();
    fs.utimesSync(filePath, now, fs.statSync(filePath).mtime);
  } catch { /* ignore */ }

  return fs.readFileSync(filePath);
}

export function cacheFile(remotePath: string, data: Buffer): void {
  ensureCacheDirs();
  const filePath = getCacheFilePath(remotePath);
  fs.writeFileSync(filePath, data);
}

export function cleanModlandCache(): void {
  if (!fs.existsSync(FILES_CACHE_DIR)) return;

  const files = fs.readdirSync(FILES_CACHE_DIR).map((name) => {
    const fullPath = path.join(FILES_CACHE_DIR, name);
    const stat = fs.statSync(fullPath);
    return { name, fullPath, size: stat.size, atime: stat.atimeMs };
  });

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  if (totalSize <= MAX_CACHE_BYTES) return;

  // Sort by atime ascending (oldest access first)
  files.sort((a, b) => a.atime - b.atime);

  let freed = 0;
  const excess = totalSize - MAX_CACHE_BYTES;

  for (const file of files) {
    if (freed >= excess) break;
    try {
      fs.unlinkSync(file.fullPath);
      freed += file.size;
      console.log(`[Modland] Cache evicted: ${file.name} (${(file.size / 1024).toFixed(0)}KB)`);
    } catch { /* ignore */ }
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export function getIndexStatus(): { totalFiles: number; lastUpdate: string | null; status: string } {
  const row = db.prepare('SELECT COUNT(*) as count FROM modland_files').get() as { count: number };
  const lastUpdate = getMeta('last_index_update') ?? null;
  return {
    totalFiles: row.count,
    lastUpdate,
    status: indexingStatus,
  };
}

export function getFormats(): { format: string; count: number }[] {
  if (cachedFormats) return cachedFormats;

  const rows = db.prepare(
    'SELECT format, COUNT(*) as count FROM modland_files GROUP BY format ORDER BY count DESC'
  ).all() as { format: string; count: number }[];

  cachedFormats = rows;
  return rows;
}

export function invalidateFormatsCache() {
  cachedFormats = null;
}

export async function initModlandIndex(): Promise<void> {
  ensureCacheDirs();

  const lastUpdate = getMeta('last_index_update');
  if (lastUpdate) {
    const elapsed = Date.now() - parseInt(lastUpdate, 10);
    const hours = elapsed / (1000 * 60 * 60);
    if (hours < 24) {
      const { totalFiles } = getIndexStatus();
      if (totalFiles > 0) {
        console.log(`[Modland] Index is fresh (${hours.toFixed(1)}h old, ${totalFiles} files). Skipping update.`);
        indexingStatus = 'ready';
        return;
      }
    }
  }

  await runIndexUpdate();
}

async function runIndexUpdate(): Promise<void> {
  indexingStatus = 'indexing';
  console.log('[Modland] Starting index update...');

  try {
    const zipBuffer = await downloadAllmods();

    // Save zip for potential debugging
    fs.writeFileSync(ALLMODS_PATH, zipBuffer);

    const text = extractAllmodsText(zipBuffer);
    const count = indexEntries(text);

    setMeta('last_index_update', Date.now().toString());
    invalidateFormatsCache();
    indexingStatus = 'ready';

    console.log(`[Modland] Index complete: ${count} files indexed`);

    // Clean up cache after index update
    cleanModlandCache();
  } catch (err) {
    console.error('[Modland] Index update failed:', err);
    // If we have existing data, stay ready
    const { totalFiles } = getIndexStatus();
    indexingStatus = totalFiles > 0 ? 'ready' : 'not_initialized';
  }
}

export function scheduleModlandUpdates(): void {
  if (updateTimer) return;

  // Every 24 hours
  updateTimer = setInterval(() => {
    runIndexUpdate().catch((err) => {
      console.error('[Modland] Scheduled update failed:', err);
    });
  }, 24 * 60 * 60 * 1000);

  console.log('[Modland] Scheduled 24h index updates');
}

export function stopModlandUpdates(): void {
  if (updateTimer) {
    clearInterval(updateTimer);
    updateTimer = null;
  }
}

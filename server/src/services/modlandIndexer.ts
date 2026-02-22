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
  // ── Standard tracker formats (libopenmpt / dedicated parsers) ──────────────
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
  'OctaMED MMDC': 'mmdc',
  'Soundtracker': 'mod',
  'Soundtracker 2.6': 'mod',
  'Soundtracker Pro II': 'mod',
  'Digital Tracker MOD': 'mod',
  'Digital Tracker DTM': 'dtm',
  'Graoumf Tracker': 'gt2',
  'Graoumf Tracker 2': 'gt2',
  'HivelyTracker': 'hvl',
  'AHX': 'ahx',
  'Furnace': 'fur',

  // ── UADE exotic Amiga formats (130+ via 68k + Paula emulation) ─────────────
  // Folder names match ftp.modland.com/pub/modules/<Format>/

  // Jochen Hippel variants
  'Hippel': 'hip',
  'Hippel 7V': 'hip7',
  'Hippel COSO': 'hipc',
  'Hippel ST': 'hst',

  // TFMX variants (prefix-style: mdat.songname / smpl.songname)
  'TFMX': 'tfmx',
  'TFMX ST': 'mdst',

  // Future Composer variants
  'Future Composer 1.3': 'fc13',
  'Future Composer 1.4': 'fc14',
  'Future Composer BSI': 'bsi',

  // SIDMon / SoundMon
  'SidMon 1': 'sid1',
  'SidMon 2': 'sid2',
  'BP SoundMon 2': 'bp',
  'BP SoundMon 3': 'bp3',

  // Named composers / programmers
  'Ben Daglish': 'bd',
  'Ben Daglish SID': 'bds',
  'Dave Lowe': 'dl',
  'Dave Lowe New': 'dln',
  'David Hanney': 'dh',
  'David Whittaker': 'dw',
  'Dirk Bialluch': 'tpu',
  'Fred Gray': 'gray',
  'Howie Davies': 'hd',
  'Jason Brooke': 'jcb',
  'Jason Page': 'jp',
  'Jason Page Old': 'jp',
  'Jeroen Tel': 'jt',
  'Jesper Olsen': 'jo',
  'Janko Mrsic-Flogel': 'jmf',
  'Kim Christensen': 'kim',
  'Kris Hatlelid': 'kh',
  'Mark Cooksey': 'mc',
  'Mark Cooksey Old': 'mco',
  'Martin Walker': 'avp',
  'Mike Davies': 'md',
  'Paul Robotham': 'dat',
  'Paul Shields': 'ps',
  'Paul Summers': 'snk',
  'Paul Tonge': 'pat',
  'Peter Verswyvelen': 'pvp',
  'Pierre Adane Packer': 'pap',
  'Rob Hubbard': 'rh',
  'Rob Hubbard ST': 'rho',
  'Richard Joseph': 'rjp',
  'Ron Klaren': 'rk',
  'Sean Connolly': 'scn',
  'Sean Conran': 'scr',
  'Steve Barrett': 'sb',
  'Steve Turner': 'jpo',
  'Thomas Hermann': 'thm',
  'Tim Follin': 'tf',
  'Wally Beben': 'wb',
  'Major Tom': 'hn',
  'Anders Oland': 'hot',
  'Andrew Parton': 'bye',
  'Ashley Hogg': 'ash',
  'Darius Zendeh': 'dz',

  // Tracker/editor formats
  'FredMon': 'fred',
  'Sonic Arranger': 'sa',
  'JamCracker': 'jam',
  'Images Music System': 'ims',
  'Quadra Composer': 'emod',
  'ChipTracker': 'kris',
  'Pumatracker': 'puma',
  'TCB Tracker': 'tcb',
  'Pretracker': 'prt',
  'SynTracker': 'synmod',
  'Fashion Tracker': 'ex',
  'Time Tracker': 'tmk',
  'Tomy Tracker': 'sg',
  'Mark II': 'mkii',
  'Leggless Music Editor': 'lme',
  'Music Assembler': 'ma',
  'Music Editor': 'ml',

  // Synthesizer / sound system formats
  'Beathoven Synthesizer': 'bss',
  'Dynamic Synthesizer': 'dns',
  'Voodoo Supreme Synthesizer': 'vss',
  'Synth Dream': 'sdr',
  'Synth Pack': 'osp',
  'Professional Sound Artists': 'psa',
  'Sound Master': 'sm',
  'Sound Control': 'sc',
  'Sound Images': 'tw',
  'Sound Programming Language': 'spl',
  'SoundFX': 'sfx',
  'SoundFactory': 'psf',
  'SoundPlayer': 'sjs',
  'MultiMedia Sound': 'mms',
  'IFF-SMUS': 'smus',

  // Delta Music
  'Delta Music': 'dm1',
  'Delta Music 2': 'dm2',

  // Digital Mugician
  'Digital Mugician': 'dmu',
  'Digital Mugician 2': 'dmu2',

  // MusicMaker
  'MusicMaker V8': 'mm8',

  // Game-specific / studio formats
  'Art And Magic': 'aam',
  'Art Of Noise': 'aon',
  'Audio Sculpture': 'adsc',
  'Core Design': 'core',
  'Cinemaware': 'cin',
  'EarAche': 'ea',
  'Forgotten Worlds': 'fw',
  'GlueMon': 'glue',
  'GMC': 'gmc',
  'Infogrames': 'dum',
  'SCUMM': 'scumm',
  'Silmarils': 'mok',
  'Riff Raff': 'riff',
  'Maximum Effect': 'max',
  'Maniacs Of Noise': 'mon',
  'Desire': 'dsr',
  'Digital Sonix And Chrome': 'dsc',
  'Digital Sound Studio': 'dss',

  // Electronic Music System
  'Electronic Music System': 'ems',
  'Electronic Music System v6': 'emsv6',

  // InStereo
  'InStereo!': 'is',
  'InStereo! 2.0': 'is20',

  // Packer / system formats
  'Magnetic Fields Packer': 'mfp',
  'NovoTrade Packer': 'ntp',
  'Mosh Packer': 'mosh',
  'Nick Pelling Packer': 'npp',
  'Titanics Packer': 'tits',
  'Alcatraz Packer': 'alp',
  'Blade Packer': 'uds',
  'Speedy A1 System': 'sas',
  'Speedy System': 'ss',
  'Future Player': 'fp',
  'SUN-Tronic': 'sun',
  'Tronic': 'trc',
  'UFO': 'ufo',
  'AMOS': 'abk',
  'CustomMade': 'cust',
  'Delitracker Custom': 'custom',
  'Actionamics': 'ast',
  'AProSys': 'aps',
  'AM Composer': 'amc',
  'MMDC': 'mmdc',

  // Quartet variants
  'Quartet': 'qpa',
  'Quartet PSG': 'sqt',
  'Quartet ST': 'qts',

  // Special FX
  'Special FX': 'jd',
  'Special FX ST': 'doda',

  // YM / Sierra
  'YM-2149': 'ym',
  'Sierra AGI': 'agi',

  // Medley
  'Medley': 'mso',
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

export async function forceReindex(): Promise<number> {
  console.log('[Modland] Force re-index requested');
  indexingStatus = 'indexing';
  try {
    const zipBuffer = await downloadAllmods();
    fs.writeFileSync(ALLMODS_PATH, zipBuffer);
    const text = extractAllmodsText(zipBuffer);
    const count = indexEntries(text);
    setMeta('last_index_update', Date.now().toString());
    invalidateFormatsCache();
    indexingStatus = 'ready';
    console.log(`[Modland] Force re-index complete: ${count} files indexed`);
    cleanModlandCache();
    return count;
  } catch (err) {
    console.error('[Modland] Force re-index failed:', err);
    const { totalFiles } = getIndexStatus();
    indexingStatus = totalFiles > 0 ? 'ready' : 'not_initialized';
    throw err;
  }
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

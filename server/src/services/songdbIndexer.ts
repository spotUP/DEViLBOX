/**
 * SongDB Indexer - Downloads and indexes the audacious-uade-tools song metadata database
 *
 * Fetches 3 TSV files from GitHub (songlengths, modinfos, metadata) containing ~400K entries
 * indexed by 12-char MD5 prefix. Provides lookup by hash for author, year, album, format, duration.
 *
 * @see https://github.com/mvtiaine/audacious-uade-tools
 */

import db from '../db/database';

// ── TSV URLs (pretty/human-readable MD5-indexed versions) ───────────────────

const BASE_URL = 'https://raw.githubusercontent.com/mvtiaine/audacious-uade-tools/master/tsv/pretty/md5';

const TSV_URLS = {
  songlengths: `${BASE_URL}/songlengths.tsv`,
  modinfos: `${BASE_URL}/modinfos.tsv`,
  metadata: `${BASE_URL}/metadata.tsv`,
} as const;

// ── State ───────────────────────────────────────────────────────────────────

let indexingStatus: 'ready' | 'indexing' | 'not_initialized' = 'not_initialized';
let updateTimer: ReturnType<typeof setInterval> | null = null;

// ── Helpers ─────────────────────────────────────────────────────────────────

function setMeta(key: string, value: string) {
  db.prepare('INSERT OR REPLACE INTO songdb_meta (key, value) VALUES (?, ?)').run(key, value);
}

function getMeta(key: string): string | undefined {
  const row = db.prepare('SELECT value FROM songdb_meta WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

// ── TSV Downloaders & Parsers ───────────────────────────────────────────────

async function downloadTSV(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  return await response.text();
}

/**
 * Parse and insert songlengths.tsv
 * Format: hash\tmin_subsong\tduration1,flags duration2,flags ...
 */
function indexSonglengths(text: string): number {
  const lines = text.split('\n');
  const BATCH_SIZE = 10000;

  const deleteAll = db.prepare('DELETE FROM songdb_lengths');
  const insert = db.prepare(
    'INSERT OR IGNORE INTO songdb_lengths (hash, min_subsong, subsong_data) VALUES (?, ?, ?)'
  );

  let total = 0;

  db.transaction(() => {
    deleteAll.run();

    let batch: { hash: string; minSubsong: number; data: string }[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const parts = trimmed.split('\t');
      if (parts.length < 3) continue;

      const [hash, minSubsongStr, subsongData] = parts;
      if (!hash || hash.length !== 12) continue;

      batch.push({
        hash,
        minSubsong: parseInt(minSubsongStr, 10) || 0,
        data: subsongData,
      });

      if (batch.length >= BATCH_SIZE) {
        for (const e of batch) {
          insert.run(e.hash, e.minSubsong, e.data);
        }
        total += batch.length;
        batch = [];
      }
    }

    if (batch.length > 0) {
      for (const e of batch) {
        insert.run(e.hash, e.minSubsong, e.data);
      }
      total += batch.length;
    }
  })();

  return total;
}

/**
 * Parse and insert modinfos.tsv
 * Format: hash\tformat\tchannels (channels may be empty)
 */
function indexModinfos(text: string): number {
  const lines = text.split('\n');
  const BATCH_SIZE = 10000;

  const deleteAll = db.prepare('DELETE FROM songdb_modinfos');
  const insert = db.prepare(
    'INSERT OR IGNORE INTO songdb_modinfos (hash, format, channels) VALUES (?, ?, ?)'
  );

  let total = 0;

  db.transaction(() => {
    deleteAll.run();

    let batch: { hash: string; format: string; channels: number | null }[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const parts = trimmed.split('\t');
      if (parts.length < 2) continue;

      const [hash, format, channelsStr] = parts;
      if (!hash || hash.length !== 12) continue;

      batch.push({
        hash,
        format: format || '',
        channels: channelsStr ? parseInt(channelsStr, 10) || null : null,
      });

      if (batch.length >= BATCH_SIZE) {
        for (const e of batch) {
          insert.run(e.hash, e.format, e.channels);
        }
        total += batch.length;
        batch = [];
      }
    }

    if (batch.length > 0) {
      for (const e of batch) {
        insert.run(e.hash, e.format, e.channels);
      }
      total += batch.length;
    }
  })();

  return total;
}

/**
 * Parse and insert metadata.tsv
 * Format: hash\tauthors\tpublishers\talbum\tyear
 * Authors/publishers use ~ as separator for multiple values
 */
function indexMetadata(text: string): number {
  const lines = text.split('\n');
  const BATCH_SIZE = 10000;

  const deleteAll = db.prepare('DELETE FROM songdb_metadata');
  const insert = db.prepare(
    'INSERT OR IGNORE INTO songdb_metadata (hash, authors, publishers, album, year) VALUES (?, ?, ?, ?, ?)'
  );

  let total = 0;

  db.transaction(() => {
    deleteAll.run();

    let batch: { hash: string; authors: string; publishers: string; album: string; year: string }[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const parts = trimmed.split('\t');
      if (parts.length < 2) continue;

      const [hash, authors, publishers, album, year] = parts;
      if (!hash || hash.length !== 12) continue;

      batch.push({
        hash,
        authors: authors || '',
        publishers: publishers || '',
        album: album || '',
        year: year || '',
      });

      if (batch.length >= BATCH_SIZE) {
        for (const e of batch) {
          insert.run(e.hash, e.authors, e.publishers, e.album, e.year);
        }
        total += batch.length;
        batch = [];
      }
    }

    if (batch.length > 0) {
      for (const e of batch) {
        insert.run(e.hash, e.authors, e.publishers, e.album, e.year);
      }
      total += batch.length;
    }
  })();

  return total;
}

// ── Lookup ──────────────────────────────────────────────────────────────────

export interface SongDBSubsong {
  duration_ms: number;
  flags: string;
}

export interface SongDBResult {
  found: true;
  format: string;
  channels: number | null;
  authors: string[];
  publishers: string[];
  album: string;
  year: string;
  subsongs: SongDBSubsong[];
}

export interface SongDBNotFound {
  found: false;
}

const lookupModinfo = db.prepare('SELECT format, channels FROM songdb_modinfos WHERE hash = ?');
const lookupMetadata = db.prepare('SELECT authors, publishers, album, year FROM songdb_metadata WHERE hash = ?');
const lookupLengths = db.prepare('SELECT min_subsong, subsong_data FROM songdb_lengths WHERE hash = ?');

/**
 * Parse subsong_data string like "174520,p 42880,l 53120,l" into subsong array
 */
function parseSubsongData(data: string, minSubsong: number): SongDBSubsong[] {
  const entries = data.split(' ').filter(Boolean);
  return entries.map((entry) => {
    const [durationStr, ...flagParts] = entry.split(',');
    return {
      duration_ms: parseInt(durationStr, 10) || 0,
      flags: flagParts.join(','),
    };
  });
}

export function lookupHash(hash: string): SongDBResult | SongDBNotFound {
  const modinfo = lookupModinfo.get(hash) as { format: string; channels: number | null } | undefined;
  const metadata = lookupMetadata.get(hash) as { authors: string; publishers: string; album: string; year: string } | undefined;
  const lengths = lookupLengths.get(hash) as { min_subsong: number; subsong_data: string } | undefined;

  if (!modinfo && !metadata && !lengths) {
    return { found: false };
  }

  const subsongs = lengths ? parseSubsongData(lengths.subsong_data, lengths.min_subsong) : [];

  return {
    found: true,
    format: modinfo?.format || '',
    channels: modinfo?.channels ?? null,
    authors: metadata?.authors ? metadata.authors.split('~').filter(Boolean) : [],
    publishers: metadata?.publishers ? metadata.publishers.split('~').filter(Boolean) : [],
    album: metadata?.album || '',
    year: metadata?.year || '',
    subsongs,
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

export function getSongDBStatus(): { totalMetadata: number; totalModinfos: number; totalLengths: number; lastUpdate: string | null; status: string } {
  const metaCount = (db.prepare('SELECT COUNT(*) as count FROM songdb_metadata').get() as { count: number }).count;
  const modinfoCount = (db.prepare('SELECT COUNT(*) as count FROM songdb_modinfos').get() as { count: number }).count;
  const lengthCount = (db.prepare('SELECT COUNT(*) as count FROM songdb_lengths').get() as { count: number }).count;
  const lastUpdate = getMeta('last_index_update') ?? null;

  return {
    totalMetadata: metaCount,
    totalModinfos: modinfoCount,
    totalLengths: lengthCount,
    lastUpdate,
    status: indexingStatus,
  };
}

async function runIndexUpdate(): Promise<void> {
  indexingStatus = 'indexing';
  console.log('[SongDB] Starting index update...');

  try {
    // Download all 3 TSV files in parallel
    const [songlengthsText, modinfosText, metadataText] = await Promise.all([
      downloadTSV(TSV_URLS.songlengths),
      downloadTSV(TSV_URLS.modinfos),
      downloadTSV(TSV_URLS.metadata),
    ]);

    console.log(`[SongDB] Downloaded: songlengths ${(songlengthsText.length / 1024 / 1024).toFixed(1)}MB, modinfos ${(modinfosText.length / 1024 / 1024).toFixed(1)}MB, metadata ${(metadataText.length / 1024 / 1024).toFixed(1)}MB`);

    // Index each file
    const lengthCount = indexSonglengths(songlengthsText);
    console.log(`[SongDB] Indexed ${lengthCount} song lengths`);

    const modinfoCount = indexModinfos(modinfosText);
    console.log(`[SongDB] Indexed ${modinfoCount} mod infos`);

    const metadataCount = indexMetadata(metadataText);
    console.log(`[SongDB] Indexed ${metadataCount} metadata entries`);

    setMeta('last_index_update', Date.now().toString());
    indexingStatus = 'ready';

    console.log(`[SongDB] Index complete: ${metadataCount} metadata, ${modinfoCount} modinfos, ${lengthCount} lengths`);
  } catch (err) {
    console.error('[SongDB] Index update failed:', err);
    const { totalMetadata } = getSongDBStatus();
    indexingStatus = totalMetadata > 0 ? 'ready' : 'not_initialized';
  }
}

export async function initSongDB(): Promise<void> {
  const lastUpdate = getMeta('last_index_update');
  if (lastUpdate) {
    const elapsed = Date.now() - parseInt(lastUpdate, 10);
    const days = elapsed / (1000 * 60 * 60 * 24);
    if (days < 7) {
      const { totalMetadata } = getSongDBStatus();
      if (totalMetadata > 0) {
        console.log(`[SongDB] Index is fresh (${days.toFixed(1)} days old, ${totalMetadata} entries). Skipping update.`);
        indexingStatus = 'ready';
        return;
      }
    }
  }

  await runIndexUpdate();
}

export function scheduleSongDBUpdates(): void {
  if (updateTimer) return;

  // Every 7 days
  updateTimer = setInterval(() => {
    runIndexUpdate().catch((err) => {
      console.error('[SongDB] Scheduled update failed:', err);
    });
  }, 7 * 24 * 60 * 60 * 1000);

  console.log('[SongDB] Scheduled weekly index updates');
}

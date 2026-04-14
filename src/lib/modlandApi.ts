/**
 * Modland API client - Search, browse, and download tracker modules from ftp.modland.com
 *
 * Uses the server's proxy API (handles CORS, caching, rate limiting).
 */

const API_URL = import.meta.env.VITE_API_URL || 'https://devilbox.uprough.net/api';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ModlandFile {
  id: number;
  format: string;
  author: string;
  filename: string;
  full_path: string;
  extension: string;
  avg_rating?: number;
  vote_count?: number;
}

export interface ModlandSearchResult {
  results: ModlandFile[];
  limit: number;
  offset: number;
  query: string;
}

export interface ModlandFormat {
  format: string;
  count: number;
}

export interface ModlandStatus {
  totalFiles: number;
  lastUpdate: string | null;
  status: 'ready' | 'indexing' | 'not_initialized';
}

export interface ModlandHashFile {
  song_id: number;
  hash_id: string;
  pattern_hash: number | null;
  url: string;
}

export interface ModlandHashSample {
  hash_id: string;
  song_id: number;
  song_sample_id: number;
  text: string;
  length_bytes: number;
  length: number;
}

export interface ModlandHashLookupResult {
  match: boolean;
  file?: ModlandHashFile;
  sample_count?: number;
}

export interface ModlandHashStats {
  files: number;
  samples: number;
  unique_patterns: number;
}

// ── API Functions ───────────────────────────────────────────────────────────

export async function searchModland(params: {
  q?: string;
  format?: string;
  author?: string;
  limit?: number;
  offset?: number;
}): Promise<ModlandSearchResult> {
  const searchParams = new URLSearchParams();
  if (params.q) searchParams.set('q', params.q);
  if (params.format) searchParams.set('format', params.format);
  if (params.author) searchParams.set('author', params.author);
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.offset) searchParams.set('offset', params.offset.toString());

  const response = await fetch(`${API_URL}/modland/search?${searchParams}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Search failed' }));
    throw new Error(err.error || 'Search failed');
  }
  return response.json();
}

export async function getModlandFormats(): Promise<ModlandFormat[]> {
  const response = await fetch(`${API_URL}/modland/formats`);
  if (!response.ok) {
    throw new Error('Failed to get formats');
  }
  const data = await response.json();
  return data.formats;
}

export async function downloadModlandFile(fullPath: string): Promise<ArrayBuffer> {
  const response = await fetch(
    `${API_URL}/modland/download?path=${encodeURIComponent(fullPath)}`
  );
  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Rate limited — try again in a moment');
    }
    const err = await response.json().catch(() => ({ error: 'Download failed' }));
    throw new Error(err.error || 'Download failed');
  }
  return response.arrayBuffer();
}

/**
 * TFMX companion file support.
 *
 * TFMX-Pro songs use two files in the same directory:
 *   mdat.<name>  – module/pattern data (the primary file)
 *   smpl.<name>  – sample data (required companion)
 *
 * Returns null if the file is not a TFMX mdat, or if the companion download fails.
 */
export async function downloadTFMXCompanion(
  mdatPath: string,
): Promise<{ filename: string; buffer: ArrayBuffer } | null> {
  const lastSlash = mdatPath.lastIndexOf('/');
  const dir = lastSlash >= 0 ? mdatPath.slice(0, lastSlash + 1) : '';
  const basename = lastSlash >= 0 ? mdatPath.slice(lastSlash + 1) : mdatPath;

  if (!basename.toLowerCase().startsWith('mdat.')) return null;

  const smplBasename = 'smpl.' + basename.slice(5);
  const smplPath = dir + smplBasename;

  try {
    const buffer = await downloadModlandFile(smplPath);
    return { filename: smplBasename, buffer };
  } catch {
    // Companion not found or download error — proceed without it
    return null;
  }
}

/**
 * UADE/Amiga companion file support.
 *
 * Many UADE formats use two-file pairs:
 *   - Sonix: .instr/.ss companions for instruments
 *   - Jason Page: jpn.* song + smp.* samples
 *   - MFP: .mfp song + smp.* samples  
 *   - Richard Joseph: .dum/.sng song + .ins samples
 *   - AdLib Tracker: .sng song + .ins instruments
 *   - Startrekker AM: .mod song + .nt synthesis definitions
 *
 * Returns array of all found companions (some formats have multiple).
 */
export async function downloadUADECompanions(
  mainPath: string,
): Promise<Array<{ filename: string; buffer: ArrayBuffer }>> {
  const lastSlash = mainPath.lastIndexOf('/');
  const dir = lastSlash >= 0 ? mainPath.slice(0, lastSlash + 1) : '';
  const basename = lastSlash >= 0 ? mainPath.slice(lastSlash + 1) : mainPath;
  const basenameLower = basename.toLowerCase();
  const companions: Array<{ filename: string; buffer: ArrayBuffer }> = [];

  const tryDownload = async (companionName: string) => {
    try {
      const buffer = await downloadModlandFile(dir + companionName);
      companions.push({ filename: companionName, buffer });
    } catch {
      // Companion not found - non-fatal
    }
  };

  // Jason Page: jpn.* → smp.*
  if (basenameLower.startsWith('jpn.') || basenameLower.startsWith('jpnd.') || 
      basenameLower.startsWith('jp.') || basenameLower.startsWith('jpo.') || 
      basenameLower.startsWith('jpold.')) {
    const suffix = basename.slice(basename.indexOf('.') + 1);
    await tryDownload('smp.' + suffix);
  }

  // MFP: mfp.* → smp.*
  if (basenameLower.startsWith('mfp.')) {
    const suffix = basename.slice(4);
    await tryDownload('smp.' + suffix);
  }

  // Richard Joseph / AdLib Tracker: check for .ins companion
  if (basenameLower.endsWith('.dum') || basenameLower.endsWith('.sng')) {
    const nameNoExt = basename.slice(0, basename.lastIndexOf('.'));
    await tryDownload(nameNoExt + '.ins');
    // Also try .INS (uppercase)
    await tryDownload(nameNoExt + '.INS');
  }

  // Startrekker AM: .mod → .nt
  if (basenameLower.endsWith('.mod')) {
    const nameNoExt = basename.slice(0, -4);
    await tryDownload(nameNoExt + '.nt');
  }

  // Sonix: scan for .ss and .instr companions with same base name
  // These follow pattern: basename.ss, basename.instr
  if (basenameLower.endsWith('.smus') || basenameLower.endsWith('.dum')) {
    const nameNoExt = basename.slice(0, basename.lastIndexOf('.'));
    await tryDownload(nameNoExt + '.ss');
    await tryDownload(nameNoExt + '.instr');
  }

  return companions;
}

export async function getModlandStatus(): Promise<ModlandStatus> {
  const response = await fetch(`${API_URL}/modland/status`);
  if (!response.ok) {
    throw new Error('Failed to get status');
  }
  return response.json();
}

export async function reindexModland(): Promise<{ success: boolean; totalFiles: number }> {
  const response = await fetch(`${API_URL}/modland/reindex`, { method: 'POST' });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Reindex failed' }));
    throw new Error(err.error || 'Reindex failed');
  }
  return response.json();
}

// ── Hash-Based Lookup (SHA-256 verification) ────────────────────────────────

/**
 * Look up a file by its SHA-256 hash
 * @param hash - 64-character hex SHA-256 hash
 */
export async function lookupFileByHash(hash: string): Promise<ModlandHashLookupResult> {
  const response = await fetch(`${API_URL}/modland/lookup-hash`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hash }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Hash lookup failed' }));
    throw new Error(err.error || 'Hash lookup failed');
  }
  return response.json();
}

/**
 * Get all samples for a file by song_id
 */
export async function getSamplesBySongId(songId: number): Promise<ModlandHashSample[]> {
  const response = await fetch(`${API_URL}/modland/samples/${songId}`);
  if (!response.ok) {
    throw new Error('Failed to get samples');
  }
  const data = await response.json();
  return data.samples;
}

/**
 * Find files with the same pattern hash (remixes, variations)
 */
export async function findPatternMatches(patternHash: number): Promise<ModlandHashFile[]> {
  const response = await fetch(`${API_URL}/modland/pattern-matches/${patternHash}`);
  if (!response.ok) {
    throw new Error('Failed to find pattern matches');
  }
  const data = await response.json();
  return data.matches;
}

/**
 * Get hash database statistics
 */
export async function getHashStats(): Promise<ModlandHashStats> {
  const response = await fetch(`${API_URL}/modland/hash-stats`);
  if (!response.ok) {
    throw new Error('Failed to get hash stats');
  }
  return response.json();
}

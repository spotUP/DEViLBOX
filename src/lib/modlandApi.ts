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
/**
 * Inspect a MOD buffer's 4-char signature at offset 1080 (0x438) to decide
 * whether this is a Startrekker AM variant that might ship a .nt companion.
 *
 * Every ProTracker-family MOD has a magic here ('M.K.', '4CHN', 'FLT4',
 * 'FLT8', etc.). Only the Startrekker flavours ('FLT4' / 'FLT8' / 'EX04' /
 * 'EX08') are known to carry AM-synthesis data in a side-car .nt file — and
 * even among those, most don't. For everything else, probing `.nt` burns a
 * Modland request per track and paints a red 404 in the browser console
 * (which looks like a real failure to the user). Gate the probe on magic
 * so we only ask when it's plausible.
 */
function isLikelyStartrekkerAM(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 1084) return false;
  const bytes = new Uint8Array(buffer, 1080, 4);
  let magic = '';
  for (const b of bytes) magic += String.fromCharCode(b);
  return magic === 'FLT4' || magic === 'FLT8' || magic === 'EX04' || magic === 'EX08';
}

export async function downloadUADECompanions(
  mainPath: string,
  mainBuffer?: ArrayBuffer,
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
  //
  // Only probe when the buffer's magic byte actually looks Startrekker-ish.
  // Without this gate, every ProTracker MOD in a playlist generates a red
  // 404 in the console as we blind-fetch a .nt that doesn't exist. If no
  // buffer was handed in (legacy caller), fall back to the old blind probe
  // so we don't regress Startrekker support for those paths.
  if (basenameLower.endsWith('.mod')) {
    if (!mainBuffer || isLikelyStartrekkerAM(mainBuffer)) {
      const nameNoExt = basename.slice(0, -4);
      await tryDownload(nameNoExt + '.nt');
    }
  }

  // Sonix (IFF SMUS / SNX / TINY): external instruments live in a sibling Instruments/
  // folder (Modland layout: <song>.smus + Instruments/<instrName>.instr + <name>.ss PCM) —
  // NOT companions sharing the song's basename. Keyed "Instruments/<file>" to match the
  // SonixMusicDriverParser sidecar mapping.
  //
  // The Instruments/ folder is often shared at the AUTHOR level (100+ files across all the
  // artist's songs); downloading all of them per song trips the rate limiter. So fetch ONLY
  // the instruments this song references (INS1 names extracted from the .smus), matched to
  // the folder listing by stem. Falls back to all files if names can't be read (SNX/TINY).
  if (/\.(smus|snx|tiny)$/i.test(basenameLower)) {
    const instrDir = dir.replace(/\/+$/, '') + '/Instruments';
    const files = await listModlandDir(instrDir);
    const needed = mainBuffer ? extractSmusInstrumentNames(mainBuffer) : null;
    for (const f of files) {
      const base = f.full_path.split('/').pop() ?? '';
      if (!/\.(instr|ss)$/i.test(base)) continue;
      if (needed) {
        const stem = base.replace(/\.(instr|ss)$/i, '').toLowerCase();
        if (!needed.has(stem)) continue;
      }
      try {
        const buffer = await downloadModlandFile(f.full_path);
        companions.push({ filename: `Instruments/${base}`, buffer });
      } catch {
        // Per-file best-effort — a missing instrument shouldn't abort the load.
      }
    }
  }

  return companions;
}

/**
 * Extract the instrument names an IFF SMUS song references, from its INS1 chunks, so we
 * fetch only those instruments from a shared Instruments/ folder. Returns lowercased stems,
 * or null if the buffer isn't FORM/SMUS or has no INS1 chunks. Mirrors IffSmusParser's INS1
 * walk (IFF even-padded chunks).
 */
export function extractSmusInstrumentNames(buffer: ArrayBuffer): Set<string> | null {
  const buf = new Uint8Array(buffer);
  if (buf.length < 12) return null;
  const fourcc = (o: number) => String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]);
  if (fourcc(0) !== 'FORM' || fourcc(8) !== 'SMUS') return null;
  const names = new Set<string>();
  let pos = 12;
  while (pos + 8 <= buf.length) {
    const id = fourcc(pos); pos += 4;
    const size = ((buf[pos] << 24) | (buf[pos + 1] << 16) | (buf[pos + 2] << 8) | buf[pos + 3]) >>> 0;
    pos += 4;
    const start = pos;
    if (id === 'INS1' && start + 4 <= buf.length) {
      const type = buf[start + 1];
      const nameLen = size - 4;
      if (type === 0 && nameLen > 0 && start + 4 + nameLen <= buf.length) {
        let s = '';
        for (let i = 0; i < nameLen; i++) {
          const c = buf[start + 4 + i];
          if (c === 0) break;
          s += String.fromCharCode(c);
        }
        s = s.trim();
        if (s) names.add(s.toLowerCase());
      }
    }
    pos = start + size + (size & 1); // IFF even-pad
  }
  return names.size > 0 ? names : null;
}

/** List immediate files under a modland directory prefix (companion discovery). */
export async function listModlandDir(dir: string): Promise<Array<{ full_path: string; filename: string }>> {
  try {
    const resp = await fetch(`${API_URL}/modland/list?dir=${encodeURIComponent(dir)}`);
    if (!resp.ok) return [];
    const data = await resp.json();
    return Array.isArray(data.files) ? data.files : [];
  } catch {
    return [];
  }
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

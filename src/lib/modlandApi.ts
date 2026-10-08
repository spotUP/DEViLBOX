/**
 * Modland API client - Search, browse, and download tracker modules from ftp.modland.com
 *
 * Uses the server's proxy API (handles CORS, caching, rate limiting).
 */

/**
 * Where the server's proxy API lives.
 *
 * `VITE_API_URL` is INLINED by Vite at build time, and the repo's `.env` sets
 * it to `http://localhost:3011/api` so a dev browser talks to the local
 * server. CI never sees that file, so a CI build compiles in the fallback
 * below and works for everyone.
 *
 * A build run on a developer's machine compiles in LOCALHOST. Deployed, the
 * site then asks each visitor's own computer for the modland index and every
 * other API call — "failed to fetch" for all of them. That shipped on
 * 2026-09-18 from a hand-run deploy while GitHub Actions was down for billing.
 *
 * Guarded in three places now, because the value is invisible once inlined:
 * `scripts/deploy-manual.sh` forces the production value and refuses to sync a
 * bundle that still mentions the dev port, and
 * `src/__tests__/ci/deployBundleApiUrl.test.ts` checks both the fallback here
 * and any `dist/` that happens to exist.
 */
const API_URL = import.meta.env.VITE_API_URL || 'https://devilbox.uprough.net/api';

import { gatherCompanions, type CompanionIO } from './import/companionFetch';
import { modlandListing } from './import/companionResolver';

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

export async function downloadModlandFile(fullPath: string, onProgress?: (progress: DownloadProgress) => void): Promise<ArrayBuffer> {
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
  return readBodyWithProgress(response, onProgress);
}

/** How far a download is: bytes in, of `total` (null when the server sent no Content-Length). */
export interface DownloadProgress {
  received: number;
  total: number | null;
}

/**
 * A response body as one buffer, reporting each chunk as it arrives. The one
 * download-progress source: every row that shows a download reads it through
 * the callback. Without a callback, or a body that cannot stream, the plain read.
 */
export async function readBodyWithProgress(
  response: Response,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<ArrayBuffer> {
  if (!onProgress || !response.body) return response.arrayBuffer();
  const length = Number(response.headers.get('content-length'));
  const total = Number.isFinite(length) && length > 0 ? length : null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  onProgress({ received, total });
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onProgress({ received, total });
  }
  const out = new Uint8Array(received);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.byteLength; }
  return out.buffer;
}

/**
 * Modland as a companion source: the directory listing is the server's file
 * index (`/modland/list`), the read is the proxy download. The resolver
 * (companionResolver.ts) decides which listed files belong with the module, in
 * both naming forms (`ins.x` and `x.ins`) with the shared-bank fallback, the
 * same as a local pick, a drop and the jukebox. This module used to carry its
 * own rule list (TFMX smpl, jpn, mfp, .dum/.sng + `.ins`, `.nt`) that asked
 * Modland for blind names: bob4e.dum fetched `bob4e.ins` only, never the
 * `bob4.ins` Modland ships for the set (2026-10-06).
 */
const modlandCompanionIO: CompanionIO = {
  listing(dir) {
    return modlandListing(dir, async (d) =>
      (await listModlandDir(d)).map((f) => f.full_path.split('/').pop() ?? '').filter(Boolean));
  },
  async read(path) {
    try { return await downloadModlandFile(path); } catch { return null; }
  },
};

/** The companions Modland holds beside `mainPath`, keyed by the name the replayer opens. */
async function modlandCompanions(
  mainPath: string,
  mainBuffer?: ArrayBuffer,
): Promise<Array<{ filename: string; buffer: ArrayBuffer }>> {
  const lastSlash = mainPath.lastIndexOf('/');
  const dir = lastSlash >= 0 ? mainPath.slice(0, lastSlash + 1) : '';
  const basename = lastSlash >= 0 ? mainPath.slice(lastSlash + 1) : mainPath;
  const found = await gatherCompanions(basename, dir, mainBuffer, modlandCompanionIO);
  return [...found].map(([filename, buffer]) => ({ filename, buffer }));
}

/**
 * UADE/Amiga companion files for any multi-file format (jpn/smp, mfp/smp,
 * dum/ins with its shared bank, sng/ins, StarTrekker .nt, adsc .as, kh songplay,
 * sci patch.003, smp.set banks, TFMX smpl) - everything the resolver names.
 * Returns array of all found companions (some formats have multiple).
 */
export async function downloadUADECompanions(
  mainPath: string,
  mainBuffer?: ArrayBuffer,
): Promise<Array<{ filename: string; buffer: ArrayBuffer }>> {
  const lastSlash = mainPath.lastIndexOf('/');
  const dir = lastSlash >= 0 ? mainPath.slice(0, lastSlash + 1) : '';
  const basename = lastSlash >= 0 ? mainPath.slice(lastSlash + 1) : mainPath;
  const basenameLower = basename.toLowerCase();
  const companions = await modlandCompanions(mainPath, mainBuffer);

  // Sonix (IFF SMUS / SNX / TINY): external instruments live in a sibling Instruments/
  // folder (Modland layout: <song>.smus + Instruments/<instrName>.instr + <name>.ss PCM) —
  // NOT companions sharing the song's basename. Keyed "Instruments/<file>" to match the
  // SonixMusicDriverParser sidecar mapping.
  //
  // The Instruments/ folder is often shared at the AUTHOR level (100+ files across all the
  // artist's songs); downloading all of them per song trips the rate limiter. So fetch ONLY
  // the instruments this song references (INS1 names extracted from the .smus), matched to
  // the folder listing by stem. Falls back to all files if names can't be read (SNX/TINY).
  // Match both extension form (song.smus) and prefix form (smus.song).
  if (/\.(smus|snx|tiny)$|^(smus|snx|tiny)\./i.test(basenameLower)) {
    const instrDir = dir.replace(/\/+$/, '') + '/Instruments';
    const files = (await listModlandDir(instrDir)).filter((f) =>
      /\.(instr|ss)$/i.test(f.full_path.split('/').pop() ?? ''));
    const needed = mainBuffer ? extractSmusInstrumentNames(mainBuffer) : null;
    // A .instr may reference a .ss whose name differs from the instrument (SampledSound /
    // 32-byte TINY refs). Stem-matching alone misses those and leaves instruments silent.
    // So for a small (per-song) folder, download the whole thing — cheap and complete. Only
    // fall back to targeted INS1-name matching for a LARGE shared author-level Instruments/
    // library (e.g. Ken Holland: 100+ files across all his songs), where downloading all
    // would trip the modland proxy rate limiter (429).
    const LARGE_SHARED_FOLDER = 40;
    const targeted = needed !== null && files.length > LARGE_SHARED_FOLDER;
    for (const f of files) {
      const base = f.full_path.split('/').pop() ?? '';
      if (targeted) {
        const stem = base.replace(/\.(instr|ss)$/i, '').toLowerCase();
        if (!needed!.has(stem)) continue;
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

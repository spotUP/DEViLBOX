/**
 * DeepSID Composer API client — fetches composer profiles, tune metadata,
 * and player info from the local DeepSID database mirror on the server.
 */

const API_URL = import.meta.env.VITE_API_URL || 'https://devilbox.uprough.net/api';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ComposerProfile {
  found: true;
  id: number;
  fullname: string;
  name: string;
  shortname: string;
  handles: string[];
  focus: string;
  born: string | null;
  died: string | null;
  cause: string | null;
  country: string | null;
  notable: string | null;
  employment: { company: string; years: string }[];
  affiliation: string | null;
  csdbType: string;
  csdbId: number | null;
  photoUrl: string | null;
  links: { name: string; url: string }[];
  tuneCount: number;
  activeYears: number[];
  players: { player: string; cnt: number }[];
  tags: { name: string; type: string }[];
}

export interface ComposerNotFound {
  found: false;
}

export type ComposerResult = ComposerProfile | ComposerNotFound;

export interface DeepSIDFileInfo {
  id: number;
  path: string;
  filename: string;
  name: string;
  author: string;
  copyright: string;
  player: string;
  sidModel: string;
  clockSpeed: string;
  subtunes: number;
  startSubtune: number;
  tags: { name: string; type: string }[];
  youtube: { channel: string; videoId: string; subtune: number; isDefault: boolean }[];
  lengths: { subtune: number; length: string }[];
}

export interface DeepSIDStats {
  composers: number;
  files: number;
  tags: number;
  youtubeLinks: number;
  hvscVersion: number;
}

// ── In-memory cache ─────────────────────────────────────────────────────────

const composerCache = new Map<string, ComposerResult>();

// ── API Functions ───────────────────────────────────────────────────────────

/**
 * Fetch composer profile by HVSC folder path or author name.
 * Results are cached in memory for the session.
 */
export async function fetchComposerProfile(opts: {
  hvscPath?: string;
  author?: string;
}): Promise<ComposerResult> {
  const cacheKey = opts.hvscPath || opts.author || '';
  if (composerCache.has(cacheKey)) return composerCache.get(cacheKey)!;

  try {
    const params = new URLSearchParams();
    if (opts.hvscPath) params.set('path', opts.hvscPath);
    if (opts.author) params.set('author', opts.author);

    const res = await fetch(`${API_URL}/deepsid/composer?${params}`);
    if (!res.ok) {
      const result: ComposerNotFound = { found: false };
      composerCache.set(cacheKey, result);
      return result;
    }

    const data: ComposerResult = await res.json();
    composerCache.set(cacheKey, data);
    return data;
  } catch (err) {
    console.warn('[DeepSID] Failed to fetch composer:', err);
    return { found: false };
  }
}

/**
 * Fetch detailed file info (tags, YouTube links, lengths) by file ID.
 */
export async function fetchFileInfo(fileId: number): Promise<DeepSIDFileInfo | null> {
  try {
    const res = await fetch(`${API_URL}/deepsid/file/${fileId}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Fetch file info by HVSC path.
 */
export async function fetchFileInfoByPath(hvscPath: string): Promise<DeepSIDFileInfo | null> {
  try {
    const res = await fetch(`${API_URL}/deepsid/file-by-path?path=${encodeURIComponent(hvscPath)}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Fetch DeepSID database stats.
 */
export async function fetchDeepSIDStats(): Promise<DeepSIDStats | null> {
  try {
    const res = await fetch(`${API_URL}/deepsid/stats`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Get the full URL for a composer photo.
 */
export function getComposerPhotoUrl(photoUrl: string | null): string | null {
  if (!photoUrl) return null;
  // photoUrl is already a relative API path like /api/deepsid/image/composers/xxx.jpg
  return `${API_URL.replace('/api', '')}${photoUrl}`;
}

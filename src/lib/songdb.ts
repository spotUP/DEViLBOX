/**
 * SongDB client — MD5 hash computation + metadata lookup from audacious-uade-tools database
 *
 * Computes a 12-char MD5 hash prefix (48 MSB bits) of a file and looks up
 * author, album, year, format, channels, and subsong duration information.
 */

import { md5 } from 'js-md5';

const API_URL = import.meta.env.VITE_API_URL || 'https://devilbox.uprough.net/api';

// ── Types ───────────────────────────────────────────────────────────────────

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

export type SongDBResponse = SongDBResult | SongDBNotFound;

// ── Hash Computation ────────────────────────────────────────────────────────

/**
 * Compute the 12-char MD5 hex prefix (48 MSB bits) used by the songdb.
 * This matches the hash format in audacious-uade-tools' md5/ TSV files.
 */
export function computeSongDBHash(buffer: ArrayBuffer): string {
  const fullHash = md5(buffer); // 32-char hex string
  return fullHash.slice(0, 12);  // First 12 chars = 48 MSB bits
}

// ── API Lookup ──────────────────────────────────────────────────────────────

/**
 * Look up song metadata by 12-char MD5 hash prefix.
 * Returns null on network error (non-throwing for fire-and-forget usage).
 */
export async function lookupSongDB(hash: string): Promise<SongDBResult | null> {
  try {
    const response = await fetch(`${API_URL}/songdb/lookup?hash=${encodeURIComponent(hash)}`);
    if (!response.ok) return null;

    const data: SongDBResponse = await response.json();
    if (!data.found) return null;

    return data;
  } catch {
    // Network error — silently return null (metadata is optional)
    return null;
  }
}

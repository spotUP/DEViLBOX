/**
 * Module genre client - the server's ModArchive genre for a loaded module.
 *
 * The server (GET /api/genre/:key, server/src/routes/genre.ts) keys modules by the
 * uade songdb key, the same key HippoPlayer computes:
 *   hex(XXH32(first 256 KB, seed 0)) + hex(size & 0xFFFF), 12 lowercase hex chars.
 * A tagged ModArchive genre replaces the in-browser CED guess (TrackerAnalysisPipeline).
 */

import { md5 } from 'js-md5';

import { API_URL } from '@lib/apiBase';
import type { GenreResult } from '@/stores/useTrackerAnalysisStore';

// ── Key Computation ─────────────────────────────────────────────────────────

const PRIME1 = 0x9e3779b1;
const PRIME2 = 0x85ebca77;
const PRIME3 = 0xc2b2ae3d;
const PRIME4 = 0x27d4eb2f;
const PRIME5 = 0x165667b1;

const UADE_KEY_BYTES = 256 * 1024;

function rotl(x: number, r: number): number {
  return ((x << r) | (x >>> (32 - r))) >>> 0;
}

function round(acc: number, lane: number): number {
  return Math.imul(rotl((acc + Math.imul(lane, PRIME2)) >>> 0, 13), PRIME1) >>> 0;
}

/** XXH32 of `bytes` (little-endian lanes, as the reference implementation). */
export function xxh32(bytes: Uint8Array, seed = 0): number {
  const len = bytes.length;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0;
  let h: number;

  if (len >= 16) {
    let v1 = (seed + PRIME1 + PRIME2) >>> 0;
    let v2 = (seed + PRIME2) >>> 0;
    let v3 = seed >>> 0;
    let v4 = (seed - PRIME1) >>> 0;
    const limit = len - 16;
    while (p <= limit) {
      v1 = round(v1, view.getUint32(p, true));
      v2 = round(v2, view.getUint32(p + 4, true));
      v3 = round(v3, view.getUint32(p + 8, true));
      v4 = round(v4, view.getUint32(p + 12, true));
      p += 16;
    }
    h = (rotl(v1, 1) + rotl(v2, 7) + rotl(v3, 12) + rotl(v4, 18)) >>> 0;
  } else {
    h = (seed + PRIME5) >>> 0;
  }

  h = (h + len) >>> 0;

  while (p + 4 <= len) {
    h = Math.imul(rotl((h + Math.imul(view.getUint32(p, true), PRIME3)) >>> 0, 17), PRIME4) >>> 0;
    p += 4;
  }
  while (p < len) {
    h = Math.imul(rotl((h + Math.imul(bytes[p], PRIME5)) >>> 0, 11), PRIME1) >>> 0;
    p++;
  }

  h = Math.imul(h ^ (h >>> 15), PRIME2) >>> 0;
  h = Math.imul(h ^ (h >>> 13), PRIME3) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** The uade songdb key of a decompressed module: 12 lowercase hex chars. */
export function computeUadeKey(bytes: Uint8Array): string {
  const hash = xxh32(bytes.subarray(0, UADE_KEY_BYTES));
  return hash.toString(16).padStart(8, '0') + (bytes.length & 0xffff).toString(16).padStart(4, '0');
}

// ── API Lookup ──────────────────────────────────────────────────────────────

interface GenreResponse {
  key: string;
  genre: string | null;
  source: string;
  modarchiveId: number | null;
}

/**
 * The ModArchive genre tag of a module ("Electronic - Ambient"), or null when the
 * server has none (untagged, not on ModArchive, ambiguous) or cannot answer now.
 * Non-throwing: the CED guess stays when this returns null.
 */
export async function lookupModuleGenre(bytes: Uint8Array, fileName: string): Promise<string | null> {
  const params = new URLSearchParams({ name: fileName, size: String(bytes.length), md5: md5(bytes) });
  try {
    const response = await fetch(`${API_URL}/genre/${computeUadeKey(bytes)}?${params}`);
    if (!response.ok) return null;
    const data: GenreResponse = await response.json();
    return data.source === 'modarchive' && data.genre ? data.genre : null;
  } catch {
    return null;
  }
}

// ── Merge ───────────────────────────────────────────────────────────────────

/**
 * Replace the audio model's genre with a ModArchive tag. "Electronic - Ambient"
 * becomes primary "Electronic", subgenre "Ambient"; a tag with no " - " is the
 * primary alone. Mood, energy, danceability, BPM and key stay from the audio.
 */
export function applyModuleGenre(genre: GenreResult, tag: string): GenreResult {
  const split = tag.indexOf(' - ');
  const primary = split < 0 ? tag : tag.slice(0, split);
  const subgenre = split < 0 ? '' : tag.slice(split + 3);
  return { ...genre, primary: primary.trim(), subgenre: subgenre.trim(), confidence: 1 };
}

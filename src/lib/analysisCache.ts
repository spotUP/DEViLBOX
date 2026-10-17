/**
 * Song Analysis Cache client — lookup and store DJ analysis results on the server.
 *
 * The server stores analysis data binary-packed (~5KB/song) so all users benefit
 * from analysis done by any user. Keyed by SHA-256 of the file content.
 */

import type { ExtendedAnalysis } from '@/engine/dj/autodj/types';

import { API_URL } from '@lib/apiBase';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ServerAnalysis {
  hash: string;
  bpm: number;
  bpmConfidence: number;
  timeSignature: number;
  musicalKey: string;
  keyConfidence: number;
  rmsDb: number;
  peakDb: number;
  genrePrimary: string;
  genreSubgenre: string;
  genreConfidence: number;
  mood: string;
  energy: number;
  danceability: number;
  duration: number;
  beats: number[];
  downbeats: number[];
  waveformPeaks: number[];
  frequencyPeaks: number[][];
  analysisVersion: number;
  /**
   * The Auto DJ extended analysis (activity timelines, loudness set, spectral,
   * chroma), packed on the server. null/absent = a row written before it
   * existed: a partial hit, only the extended analysis is left to compute.
   */
  extended?: ExtendedAnalysis | null;
}

// ── API calls ───────────────────────────────────────────────────────────────

/** The lookups in flight, by hash: two loads of one track (two decks, a preview and a load) ask the server once. */
const lookupsInFlight = new Map<string, Promise<ServerAnalysis | null>>();

/** How long a load waits for the server before analysing locally. A late answer is dropped, never awaited twice. */
export const LOOKUP_TIMEOUT_MS = 3000;

/**
 * Look up cached analysis by SHA-256 hash.
 * Returns null on cache miss, network error or a server slower than
 * LOOKUP_TIMEOUT_MS (non-blocking): the caller then analyses locally, once,
 * and uploads the result - it does not ask again for the same load.
 */
export function lookupServerAnalysis(hash: string): Promise<ServerAnalysis | null> {
  const pending = lookupsInFlight.get(hash);
  if (pending) return pending;
  const request = fetchServerAnalysis(hash).finally(() => { lookupsInFlight.delete(hash); });
  lookupsInFlight.set(hash, request);
  return request;
}

async function fetchServerAnalysis(hash: string): Promise<ServerAnalysis | null> {
  try {
    const res = await fetch(`${API_URL}/analysis/lookup/${hash}`, {
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.found) return null;
    return json.analysis as ServerAnalysis;
  } catch {
    // Network error or timeout — silently fall through to local analysis
    return null;
  }
}

/**
 * Store analysis results on the server (fire-and-forget).
 * Never throws — failures are silently ignored.
 */
export function storeServerAnalysis(data: ServerAnalysis): void {
  fetch(`${API_URL}/analysis/cache`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {
    // Silent — caching is best-effort
  });
}

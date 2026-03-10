/**
 * Song Analysis Cache client — lookup and store DJ analysis results on the server.
 *
 * The server stores analysis data binary-packed (~5KB/song) so all users benefit
 * from analysis done by any user. Keyed by SHA-256 of the file content.
 */

const API_URL = import.meta.env.VITE_API_URL || 'https://devilbox.uprough.net/api';

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
}

// ── API calls ───────────────────────────────────────────────────────────────

/**
 * Look up cached analysis by SHA-256 hash.
 * Returns null on cache miss or network error (non-blocking).
 */
export async function lookupServerAnalysis(hash: string): Promise<ServerAnalysis | null> {
  try {
    const res = await fetch(`${API_URL}/analysis/lookup/${hash}`, {
      signal: AbortSignal.timeout(3000),
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

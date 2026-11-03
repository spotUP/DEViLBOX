/**
 * HippoPlayer playlists, served read-only by our server (server/src/routes/hipPlaylists.ts).
 * The one fetch path for them: the DJ seed import/repair and the Community "HippoPlayer" group.
 */
import { API_URL } from '@lib/apiBase';
import type { DJPlaylist } from '@/stores/useDJPlaylistStore';

export interface HippoPlaylistSummary {
  id: string;
  name: string;
  trackCount: number;
  revision: string;
}

const BASE = `${API_URL}/hip/playlists`;

async function getJson<T>(url: string): Promise<T | null> {
  const resp = await fetch(url);
  if (!resp.ok) return null;
  return (await resp.json()) as T;
}

/** Summaries for the Community list. */
export async function fetchHippoPlaylistSummaries(): Promise<HippoPlaylistSummary[]> {
  return (await getJson<HippoPlaylistSummary[]>(BASE)) ?? [];
}

/** Every playlist with its tracks (seed import and source repair). */
export async function fetchHippoPlaylists(): Promise<DJPlaylist[]> {
  return (await getJson<DJPlaylist[]>(`${BASE}?tracks=1`)) ?? [];
}

export async function fetchHippoPlaylist(id: string): Promise<DJPlaylist | null> {
  return getJson<DJPlaylist>(`${BASE}/${encodeURIComponent(id)}`);
}

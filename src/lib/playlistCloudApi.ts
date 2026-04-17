/**
 * Playlist Cloud API — Save, list, and share DJ playlists via the server.
 *
 * Logged-in users can save playlists to the cloud (private by default)
 * and toggle visibility to share with the community.
 */

import { useAuthStore } from '@/stores/useAuthStore';

const API_URL = import.meta.env.VITE_API_URL || 'https://devilbox.uprough.net/api';

function getAuthHeaders(): HeadersInit {
  const { token } = useAuthStore.getState();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function isAuthenticated(): boolean {
  const { token, user } = useAuthStore.getState();
  return !!token && !!user;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface CloudPlaylistSummary {
  id: string;
  playlistId: string;
  name: string;
  description: string;
  visibility: 'private' | 'public';
  trackCount: number;
  totalDuration: number;
  authorName: string;
  authorId: string;
  createdAt: number;
  updatedAt: number;
}

export interface CloudPlaylistFull extends CloudPlaylistSummary {
  tracks: unknown[];
}

export interface SavePlaylistResult {
  id: string;
  playlistId: string;
  name: string;
  visibility: 'private' | 'public';
  authorName: string;
  updatedAt: number;
}

// ── API Functions ────────────────────────────────────────────────────────────

/** Save or update a playlist to the cloud. Returns the cloud ID. */
export async function savePlaylistToCloud(params: {
  playlistId: string;
  name: string;
  description?: string;
  visibility?: 'private' | 'public';
  tracks: unknown[];
  totalDuration?: number;
}): Promise<SavePlaylistResult> {
  if (!isAuthenticated()) throw new Error('Not authenticated');

  const resp = await fetch(`${API_URL}/playlists`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(params),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Save failed' }));
    throw new Error(err.error || 'Failed to save playlist');
  }

  return resp.json();
}

/** List public community playlists, or own playlists with mine=true. */
export async function listCloudPlaylists(opts?: {
  mine?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ playlists: CloudPlaylistSummary[]; total: number }> {
  const params = new URLSearchParams();
  if (opts?.mine) params.set('mine', 'true');
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.offset) params.set('offset', String(opts.offset));

  const headers: HeadersInit = opts?.mine ? getAuthHeaders() : { 'Content-Type': 'application/json' };

  const resp = await fetch(`${API_URL}/playlists?${params}`, { headers });
  if (!resp.ok) throw new Error('Failed to list playlists');

  return resp.json();
}

/** Get a single cloud playlist with full track data. */
export async function getCloudPlaylist(cloudId: string): Promise<CloudPlaylistFull> {
  const headers: HeadersInit = isAuthenticated() ? getAuthHeaders() : { 'Content-Type': 'application/json' };

  const resp = await fetch(`${API_URL}/playlists/${cloudId}`, { headers });
  if (!resp.ok) throw new Error('Playlist not found');

  return resp.json();
}

/** Toggle a playlist's visibility between private and public. */
export async function setPlaylistVisibility(
  cloudId: string,
  visibility: 'private' | 'public',
): Promise<void> {
  if (!isAuthenticated()) throw new Error('Not authenticated');

  const resp = await fetch(`${API_URL}/playlists/${cloudId}/visibility`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ visibility }),
  });

  if (!resp.ok) throw new Error('Failed to update visibility');
}

/** Remove a playlist from the cloud. */
export async function deleteCloudPlaylist(cloudId: string): Promise<void> {
  if (!isAuthenticated()) throw new Error('Not authenticated');

  const resp = await fetch(`${API_URL}/playlists/${cloudId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });

  if (!resp.ok) throw new Error('Failed to delete playlist');
}

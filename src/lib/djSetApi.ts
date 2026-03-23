/**
 * djSetApi — Client API for DJ set recording storage.
 *
 * Talks to the server's /api/djsets endpoints for CRUD on sets
 * and binary blob upload/download for module files + mic recordings.
 */

import { useAuthStore } from '@/stores/useAuthStore';
import type { DJSet, DJSetMetadata } from '@/engine/dj/recording/DJSetFormat';

const API_URL = import.meta.env.VITE_API_URL || 'https://devilbox.uprough.net/api';

function getHeaders(): HeadersInit {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

function getAuthHeaders(): HeadersInit {
  const token = useAuthStore.getState().token;
  if (!token) throw new Error('Not authenticated');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

// ── Sets ─────────────────────────────────────────────────────────────────

export async function saveDJSet(set: DJSet): Promise<{ id: string }> {
  const res = await fetch(`${API_URL}/djsets`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      name: set.metadata.name,
      durationMs: set.metadata.durationMs,
      trackList: set.metadata.trackList,
      events: set.events,
      micAudioId: set.micAudioId,
    }),
  });
  if (!res.ok) throw new Error(`Save failed: ${res.status}`);
  return res.json();
}

export async function listDJSets(options?: { mine?: boolean; limit?: number; offset?: number }): Promise<{
  sets: (DJSetMetadata & { playCount: number; hasMic: boolean })[];
}> {
  const params = new URLSearchParams();
  if (options?.mine) params.set('mine', 'true');
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));

  const res = await fetch(`${API_URL}/djsets?${params}`, { headers: getHeaders() });
  if (!res.ok) throw new Error(`List failed: ${res.status}`);
  return res.json();
}

export async function getDJSet(id: string): Promise<DJSet> {
  const res = await fetch(`${API_URL}/djsets/${id}`, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Get failed: ${res.status}`);
  return res.json();
}

export async function deleteDJSet(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/djsets/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
}

export async function incrementPlayCount(id: string): Promise<void> {
  await fetch(`${API_URL}/djsets/${id}/play`, { method: 'POST' });
}

// ── Blobs (module files + mic recordings) ────────────────────────────────

export async function uploadBlob(file: File | Blob, filename: string): Promise<{ id: string; deduplicated?: boolean }> {
  const token = useAuthStore.getState().token;
  if (!token) throw new Error('Not authenticated');

  const formData = new FormData();
  formData.append('file', file, filename);

  const res = await fetch(`${API_URL}/djsets/blobs`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}

export async function downloadBlob(id: string): Promise<ArrayBuffer> {
  const res = await fetch(`${API_URL}/djsets/blobs/${id}`);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return res.arrayBuffer();
}

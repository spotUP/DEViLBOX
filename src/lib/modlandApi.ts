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

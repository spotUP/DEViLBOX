/**
 * The Mod Archive client. Search and download go through the Express server
 * (/api/modarchive), which holds the API key; the key never reaches the browser.
 * Rows are shaped like the Modland ones.
 */

import { API_URL } from './apiBase';
import { readBodyWithProgress, type DownloadProgress } from './modlandApi';
import { markKnownSource } from './modland/knownSource';

export interface ModArchiveFile {
  id: number;
  format: string;
  author: string;
  filename: string;
  title: string;
  extension: string;
  bytes: number;
  genre: string;
}

export interface ModArchiveSearchResult {
  results: ModArchiveFile[];
  page: number;
  totalPages: number;
  query: string;
}

/** Search by filename or song title (`q`), or by artist alias (`author`). `page` is 1-based. */
export async function searchModArchive(params: { q?: string; author?: string; page?: number }): Promise<ModArchiveSearchResult> {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.author) search.set('author', params.author);
  if (params.page) search.set('page', String(params.page));
  const response = await fetch(`${API_URL}/modarchive/search?${search}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Search failed' }));
    throw new Error(err.error || 'Search failed');
  }
  return response.json();
}

export async function downloadModArchiveFile(
  id: number,
  filename: string,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<ArrayBuffer> {
  const response = await fetch(`${API_URL}/modarchive/download?id=${id}&filename=${encodeURIComponent(filename)}`);
  if (!response.ok) {
    if (response.status === 429) throw new Error('Rate limited — try again in a moment');
    const err = await response.json().catch(() => ({ error: 'Download failed' }));
    throw new Error(err.error || 'Download failed');
  }
  // Already an archive module: never a contribution candidate.
  markKnownSource(filename);
  return readBodyWithProgress(response, onProgress);
}

/** The browser shows a title next to the filename when the module has one. */
export function modArchiveDisplayName(f: ModArchiveFile): string {
  return f.title && f.title !== f.filename ? `${f.filename} - ${f.title}` : f.filename;
}

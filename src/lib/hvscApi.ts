/**
 * HVSC (High Voltage SID Collection) API client
 * 
 * Access the C64 SID music collection (80K+ tunes).
 * Uses HVSC HTTP mirrors and STIL metadata.
 */

const API_URL = import.meta.env.VITE_API_URL || 'https://devilbox.uprough.net/api';

// HVSC mirrors (HTTP access)
const HVSC_MIRRORS = [
  'https://www.hvsc.c64.org/download/C64Music',
  'https://kohina.duckdns.org/HVSC/C64Music',
];

// ── Types ───────────────────────────────────────────────────────────────────

export interface HVSCEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
}

export interface HVSCBrowseResult {
  entries: HVSCEntry[];
  path: string;
  parent?: string;
}

// ── API Functions ───────────────────────────────────────────────────────────

/**
 * Browse HVSC directory structure
 * 
 * Since HVSC mirrors are HTTP-only (no directory listing API), we use
 * the server's proxy endpoint that maintains a cached directory tree.
 */
export async function browseHVSC(path: string = ''): Promise<HVSCBrowseResult> {
  const encodedPath = encodeURIComponent(path);
  const response = await fetch(`${API_URL}/hvsc/browse?path=${encodedPath}`);
  
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Browse failed' }));
    throw new Error(err.error || 'Failed to browse HVSC');
  }
  
  return response.json();
}

/**
 * Download a .sid file from HVSC
 * 
 * Tries mirrors in order until one succeeds.
 */
export async function downloadHVSCFile(path: string): Promise<ArrayBuffer> {
  // Try server proxy first (handles caching + rate limiting)
  try {
    const encodedPath = encodeURIComponent(path);
    const response = await fetch(`${API_URL}/hvsc/download?path=${encodedPath}`);
    
    if (response.ok) {
      return response.arrayBuffer();
    }
  } catch (err) {
    console.warn('HVSC proxy download failed, trying direct mirrors:', err);
  }
  
  // Fallback: try direct mirror access
  for (const mirror of HVSC_MIRRORS) {
    try {
      const url = `${mirror}/${path}`;
      const response = await fetch(url);
      
      if (response.ok) {
        return response.arrayBuffer();
      }
    } catch (err) {
      console.warn(`HVSC mirror ${mirror} failed:`, err);
    }
  }
  
  throw new Error('Failed to download file from all HVSC mirrors');
}

/**
 * Search HVSC by filename, composer, or path
 */
export async function searchHVSC(query: string, limit = 100, offset = 0): Promise<HVSCEntry[]> {
  const params = new URLSearchParams({
    q: query,
    limit: limit.toString(),
    offset: offset.toString(),
  });
  
  const response = await fetch(`${API_URL}/hvsc/search?${params}`);
  
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Search failed' }));
    throw new Error(err.error || 'Failed to search HVSC');
  }
  
  const data = await response.json();
  return data.results || [];
}

/**
 * Get HVSC statistics
 */
export async function getHVSCStats(): Promise<{ totalFiles: number; totalSize: number }> {
  const response = await fetch(`${API_URL}/hvsc/stats`);
  
  if (!response.ok) {
    // Return fallback stats if endpoint doesn't exist yet
    return { totalFiles: 80000, totalSize: 0 };
  }
  
  return response.json();
}

/**
 * Get popular/featured HVSC tunes (from server's curated list)
 */
export async function getFeaturedTunes(): Promise<HVSCEntry[]> {
  try {
    const response = await fetch(`${API_URL}/hvsc/featured`);
    
    if (response.ok) {
      const data = await response.json();
      return data.entries || [];
    }
  } catch (err) {
    console.warn('Failed to load featured tunes:', err);
  }
  
  // Fallback: return some well-known classics
  return [
    { name: 'Commando.sid', path: 'Hubbard_Rob/Commando.sid', isDirectory: false },
    { name: 'Last_Ninja.sid', path: 'Hubbard_Rob/Last_Ninja.sid', isDirectory: false },
    { name: 'Monty_on_the_Run.sid', path: 'Hubbard_Rob/Monty_on_the_Run.sid', isDirectory: false },
    { name: 'One_Man_and_His_Droid.sid', path: 'Galway_Martin/One_Man_and_His_Droid.sid', isDirectory: false },
    { name: 'Parallax.sid', path: 'Galway_Martin/Parallax.sid', isDirectory: false },
  ];
}

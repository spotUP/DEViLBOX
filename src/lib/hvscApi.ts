/**
 * HVSC (High Voltage SID Collection) API client
 * 
 * Access the C64 SID music collection (80K+ tunes).
 * Uses HVSC HTTP mirrors and STIL metadata.
 */

const API_URL = import.meta.env.VITE_API_URL || 'https://devilbox.uprough.net/api';

// HVSC mirrors (HTTP access)
export const HVSC_MIRRORS = [
  'https://www.hvsc.c64.org/download/C64Music',
  'https://kohina.duckdns.org/HVSC/C64Music',
];

// ── Types ───────────────────────────────────────────────────────────────────

export interface HVSCEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  author?: string;
  player?: string;
  sidModel?: string;
  subtunes?: number;
  avg_rating?: number;
  vote_count?: number;
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
 * **IMPORTANT:** Requires the server to be running (npm run dev:fullstack).
 * HVSC mirrors don't provide directory listing APIs, so we need the server proxy.
 */
export async function browseHVSC(path: string = ''): Promise<HVSCBrowseResult> {
  try {
    const encodedPath = encodeURIComponent(path);
    const response = await fetch(`${API_URL}/hvsc/browse?path=${encodedPath}`);
    
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Browse failed' }));
      throw new Error(err.error || 'Failed to browse HVSC');
    }
    
    return response.json();
  } catch (err) {
    // Check if this is a network error (server not running)
    if (err instanceof TypeError && err.message.includes('fetch')) {
      throw new Error('Server not running. Start with: npm run dev:fullstack');
    }
    throw err;
  }
}

/**
 * Download a .sid file from HVSC
 * 
 * **IMPORTANT:** HVSC mirrors don't support CORS, so direct browser access fails.
 * This function REQUIRES the server proxy to be running (npm run dev:fullstack).
 */
export async function downloadHVSCFile(path: string): Promise<ArrayBuffer> {
  // Try server proxy (required - direct mirror access blocked by CORS)
  try {
    const encodedPath = encodeURIComponent(path);
    const response = await fetch(`${API_URL}/hvsc/download?path=${encodedPath}`);
    
    if (response.ok) {
      return response.arrayBuffer();
    }
    
    // If proxy returns error, throw with details
    const errorData = await response.json().catch(() => ({ error: 'Download failed' }));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  } catch (err) {
    // Check if this is a network error (server not running)
    if (err instanceof TypeError && err.message.includes('fetch')) {
      throw new Error('Server not running. Start with: npm run dev:fullstack');
    }
    throw err;
  }
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
    { name: 'Commando.sid', path: 'MUSICIANS/H/Hubbard_Rob/Commando.sid', isDirectory: false },
    { name: 'Last_Ninja.sid', path: 'MUSICIANS/H/Hubbard_Rob/Last_Ninja.sid', isDirectory: false },
    { name: 'Monty_on_the_Run.sid', path: 'MUSICIANS/H/Hubbard_Rob/Monty_on_the_Run.sid', isDirectory: false },
    { name: 'One_Man_and_His_Droid.sid', path: 'MUSICIANS/G/Galway_Martin/One_Man_and_His_Droid.sid', isDirectory: false },
    { name: 'Parallax.sid', path: 'MUSICIANS/G/Galway_Martin/Parallax.sid', isDirectory: false },
  ];
}

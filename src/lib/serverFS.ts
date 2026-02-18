/**
 * Server File System API
 * Client-side wrapper for file operations on the backend.
 * Falls back to static manifest for GitHub Pages (no backend).
 */

import fileManifest from '@generated/file-manifest.json';

const API_BASE = import.meta.env.VITE_API_URL || 'https://devilbox.uprough.net';

export interface ServerFileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modifiedAt?: string;
}

/**
 * Check if server file system is available
 */
export async function isServerFSAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000); // 1 second timeout

    // Check the public demo endpoint instead of auth-required endpoint
    const response = await fetch(`${API_BASE}/api/demo/songs/`, {
      method: 'HEAD',
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Check if static manifest is available (always true when bundled)
 */
export function isManifestAvailable(): boolean {
  return Array.isArray(fileManifest) && fileManifest.length > 0;
}

/**
 * List directory contents from the static file manifest.
 * Used on GitHub Pages where no backend API exists.
 * Manifest paths are like "/public/data/songs/foo.mod" — we strip "/public/data/" to get relative paths.
 */
export function listManifestDirectory(dirPath: string): ServerFileEntry[] {
  const cleanDir = dirPath.replace(/^\/+/, '').replace(/\/+$/, ''); // e.g. "songs" or "instruments/furnace"

  const dirs = new Set<string>();
  const files: ServerFileEntry[] = [];

  for (const raw of fileManifest as string[]) {
    // Strip "/public/data/" prefix to get relative path like "songs/mod/break the box.mod"
    const rel = raw.replace(/^\/public\/data\//, '');

    // Check if this file is inside the requested directory
    if (cleanDir && !rel.startsWith(cleanDir + '/')) continue;

    // Get the portion after the current directory
    const remainder = cleanDir ? rel.slice(cleanDir.length + 1) : rel;
    if (!remainder) continue;

    const slashIdx = remainder.indexOf('/');
    if (slashIdx !== -1) {
      // There's a subdirectory — record it
      const subdir = remainder.slice(0, slashIdx);
      dirs.add(subdir);
    } else {
      // Direct child file
      files.push({
        name: remainder,
        path: cleanDir ? `${cleanDir}/${remainder}` : remainder,
        isDirectory: false,
      });
    }
  }

  // Build directory entries
  const dirEntries: ServerFileEntry[] = Array.from(dirs).sort().map(d => ({
    name: d,
    path: cleanDir ? `${cleanDir}/${d}` : d,
    isDirectory: true,
  }));

  // Sort files alphabetically
  files.sort((a, b) => a.name.localeCompare(b.name));

  return [...dirEntries, ...files];
}

/**
 * List directory contents (public demo files, no auth required)
 */
export async function listServerDirectory(dirPath: string): Promise<ServerFileEntry[]> {
  const cleanPath = dirPath.replace(/^\/+/, '');

  // Determine type (songs or instruments) and subpath
  let type = 'songs';
  let subpath = '';

  if (cleanPath === '' || cleanPath === 'songs') {
    type = 'songs';
    subpath = '';
  } else if (cleanPath === 'instruments') {
    type = 'instruments';
    subpath = '';
  } else if (cleanPath.startsWith('instruments/')) {
    type = 'instruments';
    subpath = cleanPath.replace(/^instruments\/?/, '');
  } else if (cleanPath.startsWith('songs/')) {
    type = 'songs';
    subpath = cleanPath.replace(/^songs\/?/, '');
  } else {
    // Assume it's a subpath within songs
    type = 'songs';
    subpath = cleanPath;
  }

  const response = await fetch(`${API_BASE}/api/demo/${type}/${subpath}`);

  if (!response.ok) {
    throw new Error(`Failed to list directory: ${response.statusText}`);
  }

  const data = await response.json();

  // New API returns array directly
  if (Array.isArray(data)) {
    return data.map(entry => ({
      name: entry.name,
      path: cleanPath ? `${cleanPath}/${entry.name}` : entry.name,
      isDirectory: entry.isDirectory,
      size: entry.size,
      modifiedAt: entry.modifiedAt,
    }));
  }

  // Fallback for old format
  return data.items || [];
}

/**
 * Read file from server, or fetch statically on GitHub Pages
 */
export async function readServerFile(filePath: string): Promise<ArrayBuffer> {
  const cleanPath = filePath.replace(/^\/+/, '');
  const response = await fetch(`${API_BASE}/api/files/${cleanPath}`);

  if (!response.ok) {
    throw new Error(`Failed to read file: ${response.statusText}`);
  }

  return response.arrayBuffer();
}

/**
 * Read a file from the static deployment (GitHub Pages).
 * Files in public/data/ are served at <base>/data/
 */
export async function readStaticFile(filePath: string): Promise<ArrayBuffer> {
  const cleanPath = filePath.replace(/^\/+/, '');
  const base = import.meta.env.BASE_URL || '/';
  const url = `${base}data/${cleanPath}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch static file: ${response.status} ${url}`);
  }

  return response.arrayBuffer();
}

/**
 * Write file to server (base64 encoded)
 */
export async function writeServerFile(
  filePath: string,
  content: ArrayBuffer | Uint8Array
): Promise<void> {
  const cleanPath = filePath.replace(/^\/+/, '');
  
  // Convert to base64
  const bytes = content instanceof ArrayBuffer ? new Uint8Array(content) : content;
  const base64 = btoa(String.fromCharCode(...bytes));
  
  const response = await fetch(`${API_BASE}/api/files/${cleanPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content: base64 }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to write file: ${response.statusText}`);
  }
}

/**
 * Delete file from server
 */
export async function deleteServerFile(filePath: string): Promise<void> {
  const cleanPath = filePath.replace(/^\/+/, '');
  const response = await fetch(`${API_BASE}/api/files/${cleanPath}`, {
    method: 'DELETE',
  });
  
  if (!response.ok) {
    throw new Error(`Failed to delete file: ${response.statusText}`);
  }
}

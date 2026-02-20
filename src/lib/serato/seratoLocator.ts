/**
 * Serato Library Locator
 *
 * Finds the Serato library on disk, validates the directory structure,
 * and reads the full library (database + crates).
 *
 * Supports:
 * - Electron fs API (desktop: direct filesystem access)
 * - File System Access API (browser: user-picked directory)
 *
 * Serato library layout:
 *   ~/Music/_Serato_/
 *   ├── database V2          (main track database)
 *   ├── Subcrates/           (crate files)
 *   │   └── *.crate
 *   └── History/             (session history, not used here)
 */

import { parseSeratoDatabase, type SeratoTrack } from './seratoDatabase';
import { parseSeratoCrate, type SeratoCrate } from './seratoCrates';
import { isElectron, hasElectronFS } from '@/utils/electron';

// ============================================================================
// TYPES
// ============================================================================

export interface SeratoLibrary {
  tracks: SeratoTrack[];
  crates: SeratoCrate[];
  libraryPath: string;
}

// ============================================================================
// DEFAULT PATHS
// ============================================================================

/**
 * Get the default Serato library path for the current platform.
 * Serato always uses ~/Music/_Serato_ on both macOS and Windows.
 */
export function getDefaultSeratoPath(): string | null {
  if (!isElectron()) return null;

  const platform = window.electron?.platform;
  if (platform === 'darwin') {
    // macOS: ~/Music/_Serato_
    // We can't easily get $HOME in browser context, but Electron can resolve it
    return '/Users/' + getUsername() + '/Music/_Serato_';
  } else if (platform === 'win32') {
    return 'C:\\Users\\' + getUsername() + '\\Music\\_Serato_';
  }
  // Linux: ~/Music/_Serato_
  return '/home/' + getUsername() + '/Music/_Serato_';
}

/**
 * Try to get the current username. Falls back to empty string.
 */
function getUsername(): string {
  // In Electron, we can read from common env paths
  // For now just try to extract from known paths
  try {
    if (typeof process !== 'undefined' && process.env) {
      return process.env.USER || process.env.USERNAME || '';
    }
  } catch {
    // Not available
  }
  return '';
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Check if a directory path looks like a Serato library.
 * Validates that "database V2" file exists.
 */
export async function isSeratoLibrary(dirPath: string): Promise<boolean> {
  if (!hasElectronFS()) return false;

  try {
    const entries = await window.electron!.fs!.readdir(dirPath);
    return entries.some(e => e.name === 'database V2' && !e.isDirectory);
  } catch {
    return false;
  }
}

/**
 * Check if a FileSystemDirectoryHandle is a Serato library (browser mode).
 */
export async function isSeratoLibraryHandle(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    await handle.getFileHandle('database V2');
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// ELECTRON FS READER
// ============================================================================

/**
 * Read the full Serato library using Electron's fs IPC.
 */
export async function readSeratoLibraryElectron(rootPath: string): Promise<SeratoLibrary> {
  const fs = window.electron?.fs;
  if (!fs) throw new Error('Electron filesystem not available');

  // Read database V2
  const dbPath = rootPath + (rootPath.endsWith('/') ? '' : '/') + 'database V2';
  let tracks: SeratoTrack[] = [];
  try {
    const dbBuffer = await fs.readFile(dbPath);
    tracks = parseSeratoDatabase(dbBuffer);
  } catch (err) {
    console.warn('[SeratoLocator] Failed to read database V2:', err);
  }

  // Read crates from Subcrates/
  const crates: SeratoCrate[] = [];
  const cratesPath = rootPath + (rootPath.endsWith('/') ? '' : '/') + 'Subcrates';
  try {
    const crateEntries = await fs.readdir(cratesPath, ['.crate']);
    for (const entry of crateEntries) {
      if (entry.isDirectory || !entry.name.endsWith('.crate')) continue;
      try {
        const crateBuffer = await fs.readFile(entry.path);
        const crate = parseSeratoCrate(crateBuffer, entry.name);
        crates.push(crate);
      } catch (err) {
        console.warn(`[SeratoLocator] Failed to read crate ${entry.name}:`, err);
      }
    }
  } catch {
    // Subcrates folder might not exist
  }

  return { tracks, crates, libraryPath: rootPath };
}

// ============================================================================
// FILE SYSTEM ACCESS API READER (Browser)
// ============================================================================

/**
 * Read the full Serato library using File System Access API (browser).
 * Requires a FileSystemDirectoryHandle pointing to the _Serato_ folder.
 */
export async function readSeratoLibraryBrowser(handle: FileSystemDirectoryHandle): Promise<SeratoLibrary> {
  // Read database V2
  let tracks: SeratoTrack[] = [];
  try {
    const dbFileHandle = await handle.getFileHandle('database V2');
    const dbFile = await dbFileHandle.getFile();
    const dbBuffer = await dbFile.arrayBuffer();
    tracks = parseSeratoDatabase(dbBuffer);
  } catch (err) {
    console.warn('[SeratoLocator] Failed to read database V2:', err);
  }

  // Read crates from Subcrates/
  const crates: SeratoCrate[] = [];
  try {
    const subcratesHandle = await handle.getDirectoryHandle('Subcrates');
    for await (const [name, entryHandle] of (subcratesHandle as unknown as AsyncIterable<[string, FileSystemHandle]>)) {
      if (entryHandle.kind !== 'file' || !name.endsWith('.crate')) continue;
      try {
        const fileHandle = entryHandle as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        const buffer = await file.arrayBuffer();
        const crate = parseSeratoCrate(buffer, name);
        crates.push(crate);
      } catch (err) {
        console.warn(`[SeratoLocator] Failed to read crate ${name}:`, err);
      }
    }
  } catch {
    // Subcrates folder might not exist
  }

  return { tracks, crates, libraryPath: handle.name };
}

// ============================================================================
// UNIFIED READER
// ============================================================================

/**
 * Auto-detect the best method and read the Serato library.
 *
 * - If Electron: try default path, then allow manual selection
 * - If browser: use File System Access API (showDirectoryPicker)
 */
export async function pickAndReadSeratoLibrary(): Promise<SeratoLibrary | null> {
  if (hasElectronFS()) {
    // Electron: show directory picker
    const fs = window.electron!.fs!;
    const paths = await fs.showOpenDialog({
      properties: ['openDirectory'],
    });
    if (!paths || paths.length === 0) return null;

    const dirPath = paths[0];
    if (!await isSeratoLibrary(dirPath)) {
      throw new Error(`"${dirPath}" does not appear to be a Serato library (no "database V2" file found)`);
    }

    return readSeratoLibraryElectron(dirPath);
  }

  // Browser: File System Access API
  if ('showDirectoryPicker' in window) {
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'read' });
      if (!await isSeratoLibraryHandle(handle)) {
        throw new Error('Selected folder does not appear to be a Serato library');
      }
      return readSeratoLibraryBrowser(handle);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return null; // user cancelled
      throw err;
    }
  }

  throw new Error('No file system access available. Use Chrome/Edge for browser mode, or the desktop app.');
}

/**
 * Try to auto-detect the Serato library at the default path (Electron only).
 * Returns null if not found or not in Electron.
 */
export async function autoDetectSeratoLibrary(): Promise<SeratoLibrary | null> {
  if (!hasElectronFS()) return null;

  const defaultPath = getDefaultSeratoPath();
  if (!defaultPath) return null;

  if (await isSeratoLibrary(defaultPath)) {
    return readSeratoLibraryElectron(defaultPath);
  }

  return null;
}

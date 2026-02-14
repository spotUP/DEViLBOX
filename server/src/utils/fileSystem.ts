/**
 * File system utilities for managing user directories and symlinks
 */

import fs from 'fs';
import path from 'path';

const DATA_ROOT = process.env.DATA_ROOT || '/var/www/devilbox/data';
const PUBLIC_DIR = path.join(DATA_ROOT, 'public');
const USERS_DIR = path.join(DATA_ROOT, 'users');

/**
 * Initialize the data directory structure
 */
export function initDataDirectories() {
  // Create public demo directories
  const publicSongs = path.join(PUBLIC_DIR, 'songs');
  const publicInstruments = path.join(PUBLIC_DIR, 'instruments');

  if (!fs.existsSync(publicSongs)) {
    fs.mkdirSync(publicSongs, { recursive: true });
    console.log('[FS] Created public songs directory:', publicSongs);
  }

  if (!fs.existsSync(publicInstruments)) {
    fs.mkdirSync(publicInstruments, { recursive: true });
    console.log('[FS] Created public instruments directory:', publicInstruments);
  }

  // Create users directory
  if (!fs.existsSync(USERS_DIR)) {
    fs.mkdirSync(USERS_DIR, { recursive: true });
    console.log('[FS] Created users directory:', USERS_DIR);
  }

  // Set permissions
  try {
    fs.chmodSync(PUBLIC_DIR, 0o755);
    fs.chmodSync(USERS_DIR, 0o755);
  } catch (error) {
    console.warn('[FS] Could not set permissions (may need sudo):', error);
  }
}

/**
 * Create user directory structure with symlinks to public demos
 */
export function createUserDirectory(userId: string): void {
  const userDir = path.join(USERS_DIR, userId);
  const userSongs = path.join(userDir, 'songs');
  const userInstruments = path.join(userDir, 'instruments');
  const demoLink = path.join(userDir, 'demo');

  // Create user directories
  fs.mkdirSync(userSongs, { recursive: true });
  fs.mkdirSync(userInstruments, { recursive: true });

  // Create symlink to public demos (relative path for portability)
  const relativePublicPath = path.relative(userDir, PUBLIC_DIR);
  try {
    fs.symlinkSync(relativePublicPath, demoLink, 'dir');
    console.log(`[FS] Created user directory with demo symlink: ${userId}`);
  } catch (error) {
    // Symlink might already exist
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      console.error('[FS] Failed to create symlink:', error);
    }
  }

  // Set permissions
  try {
    fs.chmodSync(userDir, 0o755);
    fs.chmodSync(userSongs, 0o755);
    fs.chmodSync(userInstruments, 0o755);
  } catch (error) {
    console.warn('[FS] Could not set permissions:', error);
  }
}

/**
 * Get user's file directory
 */
export function getUserDirectory(userId: string): string {
  return path.join(USERS_DIR, userId);
}

/**
 * Get user's songs directory
 */
export function getUserSongsDirectory(userId: string): string {
  return path.join(USERS_DIR, userId, 'songs');
}

/**
 * Get user's instruments directory
 */
export function getUserInstrumentsDirectory(userId: string): string {
  return path.join(USERS_DIR, userId, 'instruments');
}

/**
 * List files in a directory
 */
export function listDirectory(dirPath: string): { name: string; isDirectory: boolean; size: number }[] {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries.map(entry => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      size: entry.isDirectory() ? 0 : fs.statSync(path.join(dirPath, entry.name)).size
    }));
  } catch (error) {
    console.error('[FS] Error listing directory:', error);
    return [];
  }
}

/**
 * Read file contents
 */
export function readFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Write file contents
 */
export function writeFile(filePath: string, content: string): void {
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Delete file
 */
export function deleteFile(filePath: string): void {
  fs.unlinkSync(filePath);
}

/**
 * Check if path is within allowed directory (security)
 */
export function isPathSafe(basePath: string, targetPath: string): boolean {
  const normalizedBase = path.resolve(basePath);
  const normalizedTarget = path.resolve(targetPath);
  return normalizedTarget.startsWith(normalizedBase);
}

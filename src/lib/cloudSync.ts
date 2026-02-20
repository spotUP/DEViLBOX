/**
 * Cloud Sync Utility
 *
 * Generic sync layer for persisting localStorage data to the server
 * when the user is logged in. Uses the server files API with type='presets'.
 *
 * Each sync "slot" maps to a server file named `__sync_{key}.json`.
 * Data is stored as `{ version: number, data: T, updatedAt: number }`.
 *
 * Conflict resolution: server wins for same-key data; local-only keys are merged.
 * Sync is fire-and-forget — failures are logged but never block the UI.
 */

import {
  isAuthenticated,
  listUserFiles,
  getFile,
  saveFile,
  updateFile,
} from '@/lib/serverFilesApi';

// ── Types ────────────────────────────────────────────────────────────────────

interface SyncEnvelope<T = unknown> {
  version: number;
  data: T;
  updatedAt: number;
}

interface ServerFileRef {
  id: string;
  filename: string;
}

// Cache server file list to avoid repeated LIST calls in the same session
let cachedFileList: ServerFileRef[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 30_000; // 30 seconds

// ── Helpers ──────────────────────────────────────────────────────────────────

function syncFilename(key: string): string {
  return `__sync_${key}.json`;
}

async function getFileList(): Promise<ServerFileRef[]> {
  const now = Date.now();
  if (cachedFileList && now - cacheTimestamp < CACHE_TTL) {
    return cachedFileList;
  }
  try {
    const files = await listUserFiles('presets');
    cachedFileList = files.map((f) => ({ id: f.id, filename: f.filename }));
    cacheTimestamp = now;
    return cachedFileList;
  } catch {
    return cachedFileList || [];
  }
}

/** Invalidate cache after writes so next read sees the new file */
function invalidateCache() {
  cachedFileList = null;
  cacheTimestamp = 0;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Push data to the server for a given sync key.
 * Fire-and-forget — never throws.
 */
export async function pushToCloud<T>(key: string, data: T, version = 1): Promise<void> {
  if (!isAuthenticated()) return;

  const filename = syncFilename(key);
  const envelope: SyncEnvelope<T> = { version, data, updatedAt: Date.now() };

  try {
    const files = await getFileList();
    const existing = files.find((f) => f.filename === filename);

    if (existing) {
      await updateFile(existing.id, filename, envelope as unknown as object);
    } else {
      await saveFile(filename, envelope as unknown as object, 'presets');
      invalidateCache(); // new file created
    }
  } catch (err) {
    console.warn(`[CloudSync] Push failed for "${key}":`, err);
  }
}

/**
 * Pull data from the server for a given sync key.
 * Returns null if not found or not authenticated.
 */
export async function pullFromCloud<T>(key: string): Promise<{ data: T; updatedAt: number } | null> {
  if (!isAuthenticated()) return null;

  const filename = syncFilename(key);

  try {
    const files = await getFileList();
    const existing = files.find((f) => f.filename === filename);
    if (!existing) return null;

    const file = await getFile(existing.id);
    const envelope = file.data as SyncEnvelope<T>;
    if (!envelope || envelope.data === undefined) return null;

    return { data: envelope.data, updatedAt: envelope.updatedAt || 0 };
  } catch (err) {
    console.warn(`[CloudSync] Pull failed for "${key}":`, err);
    return null;
  }
}

/**
 * Sync a localStorage-backed value with the server.
 *
 * Strategy:
 * 1. Pull from server
 * 2. If server has newer data (by updatedAt), use server data and update localStorage
 * 3. If local is newer or server has no data, push local to server
 * 4. Returns the resolved data (whichever won)
 *
 * @param key - Sync slot name (used for server filename)
 * @param localData - Current local data
 * @param localUpdatedAt - When local data was last modified (Date.now() timestamp)
 * @param onServerWins - Called when server has newer data; update local state with this data
 */
export async function syncWithCloud<T>(
  key: string,
  localData: T,
  localUpdatedAt: number,
  onServerWins: (data: T) => void,
): Promise<void> {
  if (!isAuthenticated()) return;

  try {
    const remote = await pullFromCloud<T>(key);

    if (remote && remote.updatedAt > localUpdatedAt) {
      // Server wins
      onServerWins(remote.data);
    } else {
      // Local wins or no remote data — push to server
      await pushToCloud(key, localData);
    }
  } catch (err) {
    console.warn(`[CloudSync] Sync failed for "${key}":`, err);
  }
}

/**
 * Batch sync multiple keys at once. Runs all syncs in parallel.
 * Useful on login to sync all user data at once.
 */
export async function batchSync(
  syncs: Array<{
    key: string;
    localData: unknown;
    localUpdatedAt: number;
    onServerWins: (data: unknown) => void;
  }>,
): Promise<void> {
  if (!isAuthenticated()) return;
  await Promise.allSettled(
    syncs.map((s) => syncWithCloud(s.key, s.localData, s.localUpdatedAt, s.onServerWins)),
  );
}

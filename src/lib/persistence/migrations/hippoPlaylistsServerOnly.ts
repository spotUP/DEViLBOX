/**
 * DJ playlist store v3 to v4: the HippoPlayer playlists live only on the server.
 *
 * Until v3 the store held a local copy of each (ids in HIPPO_SERVER_PLAYLIST_IDS), imported on
 * first launch. They are public and read only now, listed from the server, so the copies go.
 * Only a playlist whose id EXACTLY equals a server id is removed: never a prefix or a name match,
 * so a user's "(Copy)" of one (a fresh id) is kept. The persisted value as it was is written to
 * HIPPO_MIGRATION_BACKUP_KEY first. Everything else is returned untouched.
 */
import { HIPPO_SERVER_PLAYLIST_IDS } from './hippoServerPlaylistIds';

export const HIPPO_MIGRATION_BACKUP_KEY = 'devilbox-dj-playlists.backup-v3';

interface PersistedPlaylists {
  playlists?: Array<{ id: string }>;
  activePlaylistId?: string | null;
  [key: string]: unknown;
}

export function dropServerHippoPlaylists<T extends PersistedPlaylists>(persisted: T): T {
  const playlists = persisted.playlists;
  if (!Array.isArray(playlists)) return persisted;
  const serverIds = new Set(HIPPO_SERVER_PLAYLIST_IDS);
  if (!playlists.some((p) => serverIds.has(p.id))) return persisted;
  try {
    localStorage.setItem(HIPPO_MIGRATION_BACKUP_KEY, JSON.stringify(persisted));
  } catch {
    // The removed playlists are server copies; with storage full the backup is the only thing lost.
  }
  const kept = playlists.filter((p) => !serverIds.has(p.id));
  const active = persisted.activePlaylistId;
  return {
    ...persisted,
    playlists: kept,
    activePlaylistId: active && serverIds.has(active) ? null : active,
  };
}

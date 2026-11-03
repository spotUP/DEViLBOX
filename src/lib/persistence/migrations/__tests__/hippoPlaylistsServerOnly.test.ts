/**
 * DJ playlist store v3 to v4: only playlists whose id is a server HippoPlayer id are removed.
 * The user's playlists (including a "(Copy)" of a HippoPlayer one) come out deep-equal, and the
 * persisted value as it was is kept under a backup key.
 *
 * Reachability: the real persisted store reads a v3 localStorage entry at rehydrate; the sentinel
 * is the backup key (written only when the migration ran).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { HIPPO_SERVER_PLAYLIST_IDS } from '../hippoServerPlaylistIds';
import { dropServerHippoPlaylists, HIPPO_MIGRATION_BACKUP_KEY } from '../hippoPlaylistsServerOnly';

const track = (n: number) => ({ id: `t-${n}`, fileName: `modland:pub/modules/x/${n}.mod`, trackName: `T${n}`, duration: 0, bpm: 0, format: 'mod', addedAt: 1 });
const hippo = (id: string) => ({ id, name: `Hippo ${id}`, createdAt: 1, updatedAt: 1, tracks: [track(1)] });
const mine = (id: string, name: string, n: number) => ({ id, name, createdAt: 2, updatedAt: 2, tracks: Array.from({ length: n }, (_, i) => track(i)) });

const USER = [
  mine('playlist-1730000000000-abc123', 'Spot-Castlevania Anthems (Copy)', 3),
  mine('playlist-1730000000001-def456', 'Klas 50 - Jungle', 2),
  mine('playlist-prg-not-a-server-id', 'Look-alike prefix, not on the server', 1),
];

describe('server HippoPlayer id list', () => {
  it('is exactly the ids in server/src/data/hippo-playlists.json', () => {
    const file = path.resolve(__dirname, '../../../../../server/src/data/hippo-playlists.json');
    const ids = (JSON.parse(fs.readFileSync(file, 'utf-8')) as Array<{ id: string }>).map((p) => p.id);
    expect([...HIPPO_SERVER_PLAYLIST_IDS]).toEqual(ids);
    expect(ids).toHaveLength(74);
  });
});

describe('dropServerHippoPlaylists', () => {
  beforeEach(() => localStorage.clear());

  it('removes only exact server ids, leaves user playlists deep-equal, writes the backup', () => {
    const before = JSON.parse(JSON.stringify({
      playlists: [hippo(HIPPO_SERVER_PLAYLIST_IDS[0]), USER[0], hippo(HIPPO_SERVER_PLAYLIST_IDS[5]), USER[1], USER[2]],
      activePlaylistId: HIPPO_SERVER_PLAYLIST_IDS[0],
    }));
    const original = JSON.stringify(before);
    const after = dropServerHippoPlaylists(JSON.parse(original));
    expect(after.playlists).toEqual(USER);
    expect(after.activePlaylistId).toBeNull();
    expect(localStorage.getItem(HIPPO_MIGRATION_BACKUP_KEY)).toBe(original);
  });

  it('keeps a user active playlist and writes no backup when nothing matches', () => {
    const state = { playlists: USER, activePlaylistId: USER[1].id };
    expect(dropServerHippoPlaylists(state)).toBe(state);
    expect(localStorage.getItem(HIPPO_MIGRATION_BACKUP_KEY)).toBeNull();
  });

  it('through the persisted store: a v3 entry loses its 74 server copies and keeps the user playlists', async () => {
    const all = [...HIPPO_SERVER_PLAYLIST_IDS.map(hippo), ...USER];
    const v3 = JSON.stringify({ state: { playlists: all, activePlaylistId: null, seedSourcesRevision: 2 }, version: 3 });
    localStorage.setItem('devilbox-dj-playlists', v3);
    vi.resetModules();
    const { useDJPlaylistStore } = await import('@/stores/useDJPlaylistStore');
    await useDJPlaylistStore.persist.rehydrate();
    expect(useDJPlaylistStore.getState().playlists.map((p) => p.id)).toEqual(USER.map((p) => p.id));
    expect(JSON.parse(localStorage.getItem(HIPPO_MIGRATION_BACKUP_KEY)!).playlists).toHaveLength(all.length);
  });
});

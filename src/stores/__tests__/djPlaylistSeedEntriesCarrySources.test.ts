/**
 * Regression: the owner's seed playlist "Anathema-Imbasille 3" held six
 * entries stored as bare names ("mozart is a fake.mod", ...). The DJ loader
 * cannot fetch a bare name that is not in this browser's IndexedDB, so Auto
 * DJ marked them bad and alternated the two entries that did load.
 *
 * The seed now carries a source for every entry an archive holds, and a
 * persisted copy of a seed playlist is repaired from it at startup.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import type { DJPlaylist } from '../useDJPlaylistStore';

const SEED_PATH = path.resolve(__dirname, '../../../public/data/playlists/imported-prg.json');
const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf-8')) as DJPlaylist[];
const PLAYLIST_ID = 'playlist-prg-anathema-imbasille-3';
const MOZART = 'modland:pub/modules/Protracker/M-Litz/mozart is a fake.mod';

// Minimum mocks: keep the audio engine and cloud sync out of a store test.
vi.mock('@/lib/cloudSync', () => ({
  pushToCloud: vi.fn(() => Promise.resolve()),
  pullFromCloud: vi.fn(() => Promise.resolve(null)),
}));
vi.mock('@/hooks/useCloudSync', () => ({ SYNC_KEYS: { DJ_PLAYLISTS: 'dj-playlists' } }));
vi.mock('@/stores/useAudioStore', () => ({ useAudioStore: { getState: () => ({ masterEffects: [] }) } }));

/** The playlist as the owner's browser persisted it before the fix. */
function persistedImbasille3(): DJPlaylist {
  const bare = ['quickening.mod', 'stainless.mod', 'echo-logical.mod', 'governmeltdown.mod', 'mozart is a fake.mod', 'weeny-bopper.mod'];
  return {
    id: PLAYLIST_ID,
    name: 'Anathema-Imbasille 3',
    createdAt: 0,
    updatedAt: 0,
    tracks: [
      { id: 't0', fileName: 'modland:pub/modules/Protracker/Blaizer/coop-DWB/ben dover.mod', trackName: 'ben dover.mod', format: 'MOD', bpm: 125, duration: 0, addedAt: 0 },
      { id: 't1', fileName: 'modland:pub/modules/Protracker/DWB/cloudwalker 777.mod', trackName: 'cloudwalker 777.mod', format: 'MOD', bpm: 125, duration: 0, addedAt: 0 },
      ...bare.map((name, i) => ({
        id: `b${i}`, fileName: name, trackName: name, format: 'MOD', bpm: 0, duration: 0, addedAt: 0,
        isBad: true, badReason: 'load failed', badFailCount: 3,
      })),
    ],
  };
}

describe('DJ seed playlist entries carry a loadable source', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(structuredClone(seed)) })));
  });

  it('the bundled seed gives "mozart is a fake.mod" its Modland source', () => {
    const playlist = seed.find((p) => p.id === PLAYLIST_ID);
    expect(playlist?.tracks.map((t) => t.fileName)).toContain(MOZART);
  });

  it('a persisted seed playlist with bare entries is repaired at startup, and only where an archive holds the file', async () => {
    const { useDJPlaylistStore, syncBundledPlaylists } = await import('../useDJPlaylistStore');
    useDJPlaylistStore.setState({ playlists: [persistedImbasille3()] });

    await syncBundledPlaylists();

    const tracks = useDJPlaylistStore.getState().playlists[0].tracks;
    const mozart = tracks.find((t) => t.id === 'b4')!;
    expect(mozart.fileName).toBe(MOZART);
    expect(mozart.isBad).toBe(false);
    expect(mozart.badFailCount).toBe(0);
    // The two good entries are untouched.
    expect(tracks[0].fileName).toBe('modland:pub/modules/Protracker/Blaizer/coop-DWB/ben dover.mod');
    expect(tracks[1].fileName).toBe('modland:pub/modules/Protracker/DWB/cloudwalker 777.mod');
    // No archive holds the other five: they stay as they were, never guessed.
    for (const id of ['b0', 'b1', 'b2', 'b3', 'b5']) {
      const t = tracks.find((x) => x.id === id)!;
      expect(t.fileName).not.toMatch(/:/);
      expect(t.isBad).toBe(true);
    }
  });
});

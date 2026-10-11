/**
 * Regression: the owner's seed playlist "Anathema-Imbasille 3" held six
 * entries stored as bare names ("mozart is a fake.mod", ...). The DJ loader
 * cannot fetch a bare name that is not in this browser's IndexedDB, so Auto
 * DJ marked them bad and alternated the two entries that did load.
 *
 * The seed now carries every entry's own source (the HippoPlayer playlist's
 * URL), and a persisted copy of a seed playlist is repaired from it at
 * startup - also when it has no bare entry left, but sources an older seed
 * gave it (a Modland basename guess).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import type { DJPlaylist } from '../useDJPlaylistStore';

const SEED_PATH = path.resolve(__dirname, '../../../public/data/playlists/imported-prg.json');
const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf-8')) as DJPlaylist[];
const PLAYLIST_ID = 'playlist-prg-anathema-imbasille-3';
const HIPPO = 'http://hippoplayer.se/data/Modules/Protracker';
const MOZART = `${HIPPO}/M/M-Litz/mozart is a fake.mod`;
const HIPPO_SOURCES = [
  `${HIPPO}/D/DWB/quickening.mod`, `${HIPPO}/D/DWB/stainless.mod`, `${HIPPO}/M/M-Litz/echo-logical.mod`,
  `${HIPPO}/M/M-Litz/governmeltdown.mod`, MOZART, `${HIPPO}/M/M-Litz/weeny-bopper.mod`,
];

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

  it('the bundled seed gives all six hippoplayer.se entries their URL', () => {
    const playlist = seed.find((p) => p.id === PLAYLIST_ID);
    expect(playlist?.tracks.map((t) => t.fileName).slice(2)).toEqual(HIPPO_SOURCES);
  });

  it('a persisted seed playlist with bare entries is repaired at startup to the seed sources', async () => {
    vi.resetModules();
    const { useDJPlaylistStore, syncBundledPlaylists, SEED_SOURCES_REVISION } = await import('../useDJPlaylistStore');
    useDJPlaylistStore.setState({ playlists: [persistedImbasille3()], seedSourcesRevision: 0 });

    await syncBundledPlaylists();

    const tracks = useDJPlaylistStore.getState().playlists[0].tracks;
    expect(tracks.slice(2).map((t) => t.fileName)).toEqual(HIPPO_SOURCES);
    for (const t of tracks.slice(2)) {
      expect(t.isBad).toBe(false);
      expect(t.badFailCount).toBe(0);
    }
    // The two good entries are untouched.
    expect(tracks[0].fileName).toBe('modland:pub/modules/Protracker/Blaizer/coop-DWB/ben dover.mod');
    expect(tracks[1].fileName).toBe('modland:pub/modules/Protracker/DWB/cloudwalker 777.mod');
    expect(useDJPlaylistStore.getState().seedSourcesRevision).toBe(SEED_SOURCES_REVISION);
  });

  it('a persisted copy with no bare entry but an older seed source is repaired once', async () => {
    vi.resetModules();
    const { useDJPlaylistStore, syncBundledPlaylists } = await import('../useDJPlaylistStore');
    // As the previous seed left it: mozart as a Modland basename guess, its siblings already sourced.
    const playlist = persistedImbasille3();
    playlist.tracks.slice(2).forEach((t, i) => { t.fileName = HIPPO_SOURCES[i]; });
    playlist.tracks[6].fileName = 'modland:pub/modules/Protracker/M-Litz/mozart is a fake.mod';
    useDJPlaylistStore.setState({ playlists: [playlist], seedSourcesRevision: 1 });

    await syncBundledPlaylists();

    const mozart = useDJPlaylistStore.getState().playlists[0].tracks[6];
    expect(mozart.fileName).toBe(MOZART);
    expect(mozart.isBad).toBe(false);
  });

  it('a user-added local entry in a seed playlist is never replaced', async () => {
    vi.resetModules();
    const { useDJPlaylistStore, syncBundledPlaylists } = await import('../useDJPlaylistStore');
    const playlist = persistedImbasille3();
    playlist.tracks[2].fileName = 'local:quickening.mod';
    useDJPlaylistStore.setState({ playlists: [playlist], seedSourcesRevision: 0 });

    await syncBundledPlaylists();

    expect(useDJPlaylistStore.getState().playlists[0].tracks[2].fileName).toBe('local:quickening.mod');
  });
});

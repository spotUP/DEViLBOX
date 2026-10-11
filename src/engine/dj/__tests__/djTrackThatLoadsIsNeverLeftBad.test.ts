/**
 * Regression (owner 2026-10-11, "Anathema-Nr Seven"): future cockaigne.mod,
 * ray flower.mod and skymines.mod were analysed and played but stayed red
 * (isBad, "pre-render produced no audio"). A transient failure flagged them;
 * the success path only cleared the flag when the CALLER'S track snapshot
 * said isBad - a snapshot taken before the failure was written says "not
 * bad", so the flag was never cleared. It also only looked in the active
 * playlist.
 *
 * Invariant: isBad means "the last attempt to load this source failed". A
 * successful load or render clears it everywhere; nothing but a failed load
 * (or the owner, by hand) sets it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DJPlaylist, PlaylistTrack } from '@/stores/useDJPlaylistStore';

vi.mock('@/lib/cloudSync', () => ({
  pushToCloud: vi.fn(() => Promise.resolve()),
  pullFromCloud: vi.fn(() => Promise.resolve(null)),
}));
vi.mock('@/hooks/useCloudSync', () => ({ SYNC_KEYS: { DJ_PLAYLISTS: 'dj-playlists' } }));
vi.mock('@/stores/useAudioStore', () => ({ useAudioStore: { getState: () => ({ masterEffects: [] }) } }));
// Keep the audio engine out: the render is served from the audio cache.
vi.mock('../DJEngine', () => ({ getDJEngine: vi.fn() }));
vi.mock('../DJPipeline', () => ({ getDJPipeline: vi.fn(), analysisFromCachedAudio: vi.fn(() => undefined) }));
vi.mock('@/lib/song/openSong', () => ({ openDeckTrack: vi.fn() }));
vi.mock('@/stores/useDJStore', () => ({ useDJStore: { getState: vi.fn() } }));
const cache = vi.hoisted(() => ({ hit: true }));
vi.mock('../DJAudioCache', () => ({
  getCachedAudioByFilename: vi.fn(async () => cache.hit
    ? { audioData: new ArrayBuffer(8), filename: 'future cockaigne.mod', bpm: 62.3, duration: 180, waveformPeaks: new Float32Array(4) }
    : null),
}));

const SOURCE = 'modland:pub/modules/Protracker/DWB/future cockaigne.mod';

function track(id: string, extra: Partial<PlaylistTrack> = {}): PlaylistTrack {
  return { id, fileName: SOURCE, trackName: 'future cockaigne.mod', format: 'MOD', bpm: 62.3, duration: 0, addedAt: 0, ...extra };
}
function playlist(id: string, t: PlaylistTrack): DJPlaylist {
  return { id, name: id, createdAt: 0, updatedAt: 0, tracks: [t] };
}

describe('a DJ track that loads is never left flagged bad', () => {
  beforeEach(() => {
    vi.resetModules();
    cache.hit = true;
    // The store's startup seed sync fetches; nothing here needs it.
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false })));
  });

  it('a successful render clears a flag the caller\'s snapshot does not know about, in every playlist', async () => {
    const { useDJPlaylistStore } = await import('@/stores/useDJPlaylistStore');
    const { preRenderTrack } = await import('../DJTrackLoader');
    const bad = { isBad: true, badReason: 'pre-render produced no audio', badFailCount: 1, badTimestamp: 1 };
    useDJPlaylistStore.setState({
      activePlaylistId: 'nr-seven',
      playlists: [playlist('nr-seven', track('t1', bad)), playlist('other', track('t2', bad))],
    });

    // Auto DJ's snapshot of the track, taken before the failed attempt was recorded.
    const result = await preRenderTrack(track('t1'));

    expect(result).not.toBeNull();
    for (const p of useDJPlaylistStore.getState().playlists) {
      expect(p.tracks[0].isBad).toBe(false);
      expect(p.tracks[0].badReason).toBeUndefined();
      expect(p.tracks[0].badFailCount).toBe(0);
    }
  });

  it('a failed render flags it, with the reason', async () => {
    cache.hit = false;
    const { useDJPlaylistStore } = await import('@/stores/useDJPlaylistStore');
    const { preRenderTrack } = await import('../DJTrackLoader');
    // A bare name not in the cache produces no audio.
    const t = { ...track('t1'), fileName: 'future cockaigne.mod' };
    useDJPlaylistStore.setState({ activePlaylistId: 'nr-seven', playlists: [playlist('nr-seven', t)] });

    expect(await preRenderTrack(t)).toBeNull();

    const stored = useDJPlaylistStore.getState().playlists[0].tracks[0];
    expect(stored.isBad).toBe(true);
    expect(stored.badReason).toBe('pre-render produced no audio');
  });

  it('analysis results (a half-tempo BPM) never set the flag', async () => {
    const { useDJPlaylistStore } = await import('@/stores/useDJPlaylistStore');
    useDJPlaylistStore.setState({ activePlaylistId: 'nr-seven', playlists: [playlist('nr-seven', track('t1', { bpm: 0 }))] });

    useDJPlaylistStore.getState().batchUpdateTrackMeta('nr-seven', [{ index: 0, meta: { bpm: 62.3, energy: 0.4, analysisSkipped: false } }]);

    expect(useDJPlaylistStore.getState().playlists[0].tracks[0].isBad).toBeFalsy();
  });
});

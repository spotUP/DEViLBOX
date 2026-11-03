/**
 * Playlist visibility is chosen at creation (default private) and can be toggled locally before the
 * first cloud save. The modal's cloud save sends `playlist.visibility || 'private'` read from this
 * store, so the stored value is what the first save sends. The local toggle must not call the API.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useDJPlaylistStore } from '../useDJPlaylistStore';

describe('playlist visibility on create', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('defaults to private, honours an explicit choice, and flips locally without any network call', () => {
    const fetchSpy = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchSpy);
    const { createPlaylist, setPlaylistVisibility } = useDJPlaylistStore.getState();

    const privateId = createPlaylist('Default');
    const publicId = createPlaylist('Chosen public', 'public');
    const find = (id: string) => useDJPlaylistStore.getState().playlists.find((p) => p.id === id)!;

    expect(find(privateId).visibility).toBe('private');
    expect(find(publicId).visibility).toBe('public');
    expect(find(privateId).cloudId).toBeUndefined();

    setPlaylistVisibility(privateId, 'public');
    // The value the first cloud save reads (DJPlaylistModal: playlist.visibility || 'private').
    expect(find(privateId).visibility || 'private').toBe('public');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

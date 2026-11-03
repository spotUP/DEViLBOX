/**
 * Playlist visibility on create, through the real DJPlaylistModal. The create form's Private/Public
 * choice is stored on the playlist (default private); toggling it while the playlist has no cloudId
 * is local only (no network); "Save to cloud" sends the chosen visibility in the request body.
 * Only the network layer (global fetch) and the auth login state are faked.
 *
 * Sentinel: the single POST to /playlists proves the cloud save path ran.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { DJPlaylistModal } from '../DJPlaylistModal';
import { useDJPlaylistStore } from '@/stores/useDJPlaylistStore';
import { useAuthStore } from '@/stores/useAuthStore';

type FetchCall = { url: string; method: string; body: Record<string, unknown> | null };

describe('DJ playlist modal: visibility chosen when a playlist is created', () => {
  let calls: FetchCall[];

  beforeEach(() => {
    calls = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
      });
      return new Response(JSON.stringify({ id: 'cloud-1', playlistId: 'p', name: 'n', visibility: 'private', authorName: 'a', updatedAt: 1, playlists: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }));
    useDJPlaylistStore.setState({ playlists: [], activePlaylistId: null });
    useAuthStore.setState({ token: 'test-token', user: { id: 'u1', username: 'tester' } as never });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useAuthStore.setState({ token: null, user: null });
  });

  const createPlaylist = (name: string, choose?: 'Private' | 'Public') => {
    fireEvent.click(screen.getByTitle('New playlist'));
    fireEvent.change(screen.getByPlaceholderText('Playlist name...'), { target: { value: name } });
    if (choose) fireEvent.click(screen.getByRole('button', { name: choose }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
  };
  const stored = () => useDJPlaylistStore.getState().playlists;
  const cloudCalls = () => calls.filter((c) => c.method === 'POST' && c.url.endsWith('/playlists'));

  it('creates a Public playlist as public, and a playlist with no choice as private', () => {
    render(<DJPlaylistModal isOpen onClose={() => {}} />);
    createPlaylist('Chosen public', 'Public');
    createPlaylist('No choice');
    expect(stored().find((p) => p.name === 'Chosen public')?.visibility).toBe('public');
    expect(stored().find((p) => p.name === 'No choice')?.visibility).toBe('private');
  });

  it('toggling visibility on a playlist not yet saved to the cloud sends no request', () => {
    render(<DJPlaylistModal isOpen onClose={() => {}} />);
    createPlaylist('Local only');
    expect(stored()[0].cloudId).toBeUndefined();
    const before = calls.length;
    fireEvent.click(screen.getByTitle('Make public'));
    expect(stored()[0].visibility).toBe('public');
    expect(calls.length).toBe(before);
  });

  it('Save to cloud sends the visibility that was chosen', async () => {
    render(<DJPlaylistModal isOpen onClose={() => {}} />);
    createPlaylist('Shared mix', 'Public');
    // The sidebar row and the toolbar both offer Save to cloud; use the sidebar row's.
    fireEvent.click(screen.getAllByTitle('Save to cloud')[0]);
    await waitFor(() => expect(cloudCalls()).toHaveLength(1));
    expect(cloudCalls()[0].body?.visibility).toBe('public');
    expect(cloudCalls()[0].body?.name).toBe('Shared mix');
  });
});

/**
 * The DJ playlist panel lists the server's public HippoPlayer playlists in its Public section,
 * locked, through the real DJPlaylistModal. Only global fetch is faked.
 *
 * Sentinel: the GET to /hip/playlists proves hippoPlaylistApi was the source; opening one entry
 * GETs /hip/playlists/:id and shows its tracks without putting a copy in the store's own playlists.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { DJPlaylistModal } from '../DJPlaylistModal';
import { useDJPlaylistStore } from '@/stores/useDJPlaylistStore';

const SUMMARIES = Array.from({ length: 74 }, (_, i) => ({ id: `playlist-prg-test-${i}`, name: `Hippo list ${i}`, trackCount: 1, revision: 'r' }));
const FULL = {
  id: 'playlist-prg-test-0', name: 'Hippo list 0', createdAt: 1, updatedAt: 1,
  tracks: [{ id: 't-1', fileName: 'modland:pub/modules/x/song.mod', trackName: 'Served Song', duration: 0, bpm: 0, format: 'mod', addedAt: 1 }],
};

describe('DJ playlist panel: Public list from the server', () => {
  let urls: string[];

  beforeEach(() => {
    urls = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      const body = /\/hip\/playlists\/[^/?]+$/.test(url) ? FULL : /\/hip\/playlists$/.test(url) ? SUMMARIES : { playlists: [] };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    useDJPlaylistStore.setState({ playlists: [], activePlaylistId: null, publicPlaylists: [] });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('lists the 74 server playlists, opens one read only, and keeps the store free of copies', async () => {
    render(<DJPlaylistModal isOpen onClose={() => {}} />);
    const section = await screen.findByTestId('public-playlists');
    await waitFor(() => expect(within(section).getAllByText(/Hippo list \d+/)).toHaveLength(74));
    expect(urls.some((u) => /\/hip\/playlists$/.test(u))).toBe(true);
    expect(section.textContent).toContain('Public (74, read only)');

    fireEvent.click(within(section).getByText('Hippo list 0'));
    await waitFor(() => expect(screen.getByText('Public, read only')).toBeTruthy());
    expect(urls.some((u) => /\/hip\/playlists\/playlist-prg-test-0$/.test(u))).toBe(true);
    expect(useDJPlaylistStore.getState().playlists).toEqual([]);
    expect(useDJPlaylistStore.getState().publicPlaylists.map((p) => p.id)).toEqual(['playlist-prg-test-0']);
  });
});

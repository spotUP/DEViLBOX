/**
 * I180a reachability: the web app's entry (AppRouter mount) reads a Selecta share link from
 * location.search and opens the song through openSong with the link's source, path and subsong.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';

const openSong = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
const notifyWarning = vi.hoisted(() => vi.fn());
vi.mock('@/lib/song/openSong', () => ({ openSong }));
vi.mock('@lib/song/openSong', () => ({ openSong, classifySong: vi.fn() }));
vi.mock('@/stores/useNotificationStore', () => ({
  notify: { success: vi.fn(), error: vi.fn(), warning: notifyWarning, info: vi.fn() },
  useNotificationStore: { getState: () => ({}) },
}));

import AppRouter from '@/App';
import { parseSelectaLink } from '../selectaLink';

afterEach(() => { cleanup(); openSong.mockClear(); notifyWarning.mockClear(); window.history.replaceState({}, '', '/'); });

describe('Selecta share links', () => {
  it('AppRouter mount with ?song= opens that modland song once, with the subsong', async () => {
    window.history.replaceState({}, '', '/?embed=pattern-editor&song=modland%2FProTracker%2Fjester%2Ftest.mod&sub=2&t=1500');
    render(<AppRouter />);
    await waitFor(() => expect(openSong).toHaveBeenCalledTimes(1));
    expect(openSong).toHaveBeenCalledWith({ kind: 'modland', path: 'ProTracker/jester/test.mod' }, expect.objectContaining({ subsong: 2 }));
  });

  it('parses the producer forms exactly (t in milliseconds)', () => {
    expect(parseSelectaLink('?song=modland%2Fa%2Fb.mod&sub=3&t=4000')).toEqual({ kind: 'song', source: 'modland', path: 'a/b.mod', sub: 3, tMs: 4000 });
    expect(parseSelectaLink('?playlist=local%2Fmix')).toEqual({ kind: 'playlist', source: 'local', id: 'mix' });
    expect(parseSelectaLink('?view=dj')).toEqual({ kind: 'view', name: 'dj' });
    expect(parseSelectaLink('?x=1')).toBeNull();
  });
});

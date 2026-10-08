/**
 * "i could not reach formats/apb.dw" (2026-10-07). The index keeps ONE song per
 * format, so every other song of a format was unreachable. Typing a file name
 * now lists the matching corpus files (public/data/songs/files.json, built by
 * scripts/build-song-index.ts) as playable rows; pressing play opens the file
 * through openSong and a report lands on the file's format row.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, fireEvent } from '@testing-library/react';

const openSong = vi.fn(async (..._a: unknown[]) => ({ ok: true, companions: 0 }));
vi.mock('@/lib/song/openSong', () => ({ openSong }));
vi.mock('@/bridge/handlers/writeHandlers', () => ({ loadFile: vi.fn(), dismissErrors: vi.fn(), dismissModal: vi.fn(), play: vi.fn() }));

const INDEX = {
  gaps: [],
  dirs: {},
  entries: [{ id: 'david-whittaker', label: 'David Whittaker', formatKey: 'davidWhittaker', files: ['/data/songs/david-whittaker/other.dw'], total: 3, dir: '/data/songs/david-whittaker' }],
};
const FILES = { files: [['/data/songs/formats/apb.dw', 'david-whittaker'], ['/data/songs/david-whittaker/other.dw', 'david-whittaker']] };

describe('jukebox file-name search', { timeout: 60000 }, () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); openSong.mockClear(); });

  it('lists formats/apb.dw for "apb" and plays it through openSong', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).endsWith('/data/songs/index.json')) return new Response(JSON.stringify(INDEX));
      if (String(url).endsWith('/data/songs/files.json')) return new Response(JSON.stringify(FILES));
      if (String(url).includes('/get-data')) return new Response('{}');
      if (String(url).endsWith('apb.dw')) return new Response(new Uint8Array([1, 2, 3]));
      return new Response('', { status: 404 });
    }));
    const { JukeboxPanel } = await import('../JukeboxPanel');
    const { findAllByText, findByText, container } = render(<JukeboxPanel onClose={() => {}} />);
    await findAllByText(/David Whittaker/);

    const list = container.querySelector('[data-captures-typing]') as HTMLElement;
    for (const ch of 'apb') fireEvent.keyDown(list, { key: ch });
    await findByText('formats/apb.dw');

    const play = container.querySelector('button[title="Play (Enter)"]') as HTMLButtonElement;
    // formats rows first: the file row is the one named apb.dw
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.click(play);
    await waitFor(() => expect(openSong).toHaveBeenCalled());
    const src = openSong.mock.calls[0]?.[0] as { kind: string; url: string };
    expect(src.kind).toBe('url');
    expect(src.url).toBe('/data/songs/formats/apb.dw');
  });
});

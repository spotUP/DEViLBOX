/**
 * "i cant flick the switches on the (Modland) songs in the jukebox"
 * (2026-10-07). A Modland row has no local file, and every fault switch was
 * disabled until a file was selected - so a format with nothing local could
 * never be reported. Its report now names the Modland song it fetched, or the
 * row itself before anything was fetched.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, fireEvent } from '@testing-library/react';

vi.mock('@/bridge/handlers/writeHandlers', () => ({ loadFile: vi.fn(), dismissErrors: vi.fn(), dismissModal: vi.fn(), play: vi.fn() }));

const INDEX = { gaps: [{ formatKey: 'zoundMonitor', label: 'Zound Monitor' }], dirs: [], entries: [] };

describe('jukebox Modland rows', { timeout: 60000 }, () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('a Modland row can be reported before a song is fetched', async () => {
    const posts: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { body?: string }) => {
      if (String(url).endsWith('/data/songs/index.json')) return new Response(JSON.stringify(INDEX));
      if (String(url).includes('/push-updates')) { posts.push(init?.body ?? ''); return new Response('{}'); }
      if (String(url).includes('/get-data')) return new Response('{}');
      return new Response('', { status: 404 });
    }));
    const { JukeboxPanel } = await import('../JukeboxPanel');
    const { findAllByText, container } = render(<JukeboxPanel onClose={() => {}} />);
    await findAllByText(/Zound Monitor/);

    const silent = container.querySelector('[title="Loads and plays, but no audio (Alt+2)"] button, button[title="Loads and plays, but no audio (Alt+2)"]') as HTMLButtonElement | null;
    expect(silent, 'the Silent switch renders').not.toBeNull();
    expect(silent!.disabled).toBe(false);

    fireEvent.keyDown(window, { key: '™', code: 'Digit2', altKey: true });
    await waitFor(() => expect(posts.some((b) => b.includes('Zound Monitor') && b.includes('silent'))).toBe(true));
  });
});

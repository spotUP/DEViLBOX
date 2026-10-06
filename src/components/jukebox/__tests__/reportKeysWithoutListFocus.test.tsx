/**
 * Alt+0 / Alt+8 did nothing: the report keys were handled only by the song
 * list's onKeyDown, so once a switch, the pattern editor or a button took the
 * focus, every report key went nowhere. They are now handled on the window
 * while the jukebox is open.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, fireEvent } from '@testing-library/react';

vi.mock('@/bridge/handlers/writeHandlers', () => ({ loadFile: vi.fn(), dismissErrors: vi.fn(), dismissModal: vi.fn(), play: vi.fn() }));

const INDEX = { gaps: [], dirs: [], entries: [{ id: 'actionamics', label: 'actionamics', formatKey: 'uade_ast', files: ['/data/songs/actionamics/dynablaster.ast'], total: 1, dir: '/data/songs/actionamics' }] };

describe('jukebox report keys', { timeout: 60000 }, () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('Alt+8 reports the selected song while focus is outside the song list', async () => {
    const posts: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { body?: string }) => {
      if (String(url).endsWith('/data/songs/index.json')) return new Response(JSON.stringify(INDEX));
      if (String(url).includes('/push-updates')) { posts.push(init?.body ?? ''); return new Response('{}'); }
      if (String(url).includes('/get-data')) return new Response('{}');
      return new Response('', { status: 404 });
    }));
    const { JukeboxPanel } = await import('../JukeboxPanel');
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    const { findAllByText } = render(<JukeboxPanel onClose={() => {}} />);
    await findAllByText(/actionamics/i);
    outside.focus();
    fireEvent.keyDown(window, { key: '™', code: 'Digit8', altKey: true });
    await waitFor(() => expect(posts.some((b) => b.includes('visualizer'))).toBe(true));
  });
});

describe('jukebox list and switches', { timeout: 60000 }, () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('a song marked Visualizer carries a Visualizer chip in the list', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).endsWith('/data/songs/index.json')) return new Response(JSON.stringify(INDEX));
      if (String(url).includes('/get-data')) return new Response(JSON.stringify({ actionamics: { view: 'visualizer' } }));
      return new Response('{}');
    }));
    const { JukeboxPanel } = await import('../JukeboxPanel');
    const { findAllByText, container } = render(<JukeboxPanel onClose={() => {}} />);
    await findAllByText(/actionamics/i);
    await waitFor(() => expect(container.querySelector('[title="This song shows the visualizer instead of the pattern editor"]')?.textContent).toBe('Visualizer'));
  });

  it('offers Missing Notes and Keyboard Silent as their own faults', async () => {
    const { JUKEBOX_FAULTS } = await import('@/lib/jukebox/faultReports');
    const ids = JUKEBOX_FAULTS.map((f) => f.id);
    expect(ids).toContain('missing-notes');
    expect(ids).toContain('keyboard-silent');
    const keys = JUKEBOX_FAULTS.map((f) => f.key).filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

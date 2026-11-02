/**
 * The Online tab of the file browser searches The Mod Archive through the Express
 * server and loads the chosen module through onLoadTrackerModule, the same single
 * load path Modland uses. Only the network is stubbed; panel and client are real.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { OnlinePanel } from '../FilePreviewPanel';
import { modArchiveDisplayName } from '@/lib/modarchiveApi';

const calls: string[] = [];

describe('Mod Archive in the Online panel', () => {
  beforeEach(() => {
    calls.length = 0;
    localStorage.setItem('dvbx_file_browser_memory_v1', JSON.stringify({
      fileSource: 'online', currentPath: '', electronDirectory: null, scroll: {},
      online: { query: '', source: 'modarchive', format: '', results: [], offset: 0, hasMore: false },
    }));
    vi.stubGlobal('fetch', async (input: string | URL) => {
      const url = new URL(String(input), 'http://x');
      calls.push(url.pathname + url.search);
      if (url.pathname.endsWith('/modarchive/search')) {
        return new Response(JSON.stringify({
          results: [{ id: 42, format: 'IT', author: 'Jogeir', filename: 'tune.it', title: 'Tune', extension: 'it', bytes: 4, genre: '' }],
          page: 1, totalPages: 1, query: 'tune',
        }), { status: 200 });
      }
      if (url.pathname.endsWith('/modarchive/download')) return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
      return new Response('{}', { status: 200 });
    });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

  it('searches the Mod Archive route and loads the module through onLoadTrackerModule', async () => {
    const loads: Array<{ size: number; name: string }> = [];
    const view = render(
      <OnlinePanel isOpen onClose={() => {}} onLoadTrackerModule={async (b, name) => { loads.push({ size: b.byteLength, name }); }} />,
    );
    fireEvent.change(view.container.querySelector('input') as HTMLInputElement, { target: { value: 'tune' } });
    const row = await waitFor(() => {
      const el = view.getByText('tune.it - Tune').closest('div[class*="cursor-pointer"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    }, { timeout: 4000 });
    expect(calls.some((c) => c.includes('/modarchive/search?q=tune'))).toBe(true);
    expect(calls.some((c) => c.includes('/modland/search'))).toBe(false);
    fireEvent.doubleClick(row);
    await waitFor(() => expect(loads).toHaveLength(1), { timeout: 4000 });
    expect(loads[0]).toEqual({ size: 4, name: 'tune.it' });
    expect(calls.some((c) => c.includes('/modarchive/download?id=42'))).toBe(true);
  });

  it('shows the title next to the filename only when it adds something', () => {
    const base = { id: 1, format: 'IT', author: 'a', filename: 'a.it', title: 'Song', extension: 'it', bytes: 1, genre: '' };
    expect(modArchiveDisplayName(base)).toBe('a.it - Song');
    expect(modArchiveDisplayName({ ...base, title: '' })).toBe('a.it');
    expect(modArchiveDisplayName({ ...base, title: 'a.it' })).toBe('a.it');
  });
});

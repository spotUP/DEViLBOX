/**
 * The load dialog forgot where it was (owner 2026-10-07): the folder, the
 * scroll position inside it, and the Online (Modland) search with its results
 * were all gone on reopening. A per-viewer convenience kept in localStorage;
 * the dialog still works when storage is blocked.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { FileBrowser } from '../FileBrowser';
import { OnlinePanel } from '../FilePreviewPanel';
import {
  resetFileBrowserMemory, readFileBrowserMemory, updateFileBrowserMemory, rememberScroll, scrollKey,
} from '../fileBrowserMemory';

const noop = () => {};
let searches = 0;

function serve(): void {
  vi.stubGlobal('fetch', async (input: string | URL) => {
    const p = new URL(String(input), 'http://x').pathname;
    if (p.endsWith('/modland/search')) {
      searches++;
      return new Response(JSON.stringify({
        results: [{ id: 1, author: 'Jogeir', filename: 'chiptune.mod', full_path: 'pub/modules/PT/Jogeir/chiptune.mod', format: 'ProTracker', extension: 'mod', avg_rating: null, vote_count: null }],
        limit: 50, offset: 0, query: 'chip',
      }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  });
}

beforeEach(() => { resetFileBrowserMemory(); searches = 0; serve(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetFileBrowserMemory(); });

describe('Online search keeps its query and results', () => {
  it('reopening shows the last query and the same results without searching again', async () => {
    const first = render(<OnlinePanel isOpen onClose={noop} onLoadTrackerModule={async () => {}} />);
    const input = first.container.querySelector('input[type="text"], input:not([type])') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'chip' } });
    await waitFor(() => expect(first.getByText('chiptune.mod')).toBeTruthy(), { timeout: 3000 });
    const before = searches;
    first.unmount();

    const second = render(<OnlinePanel isOpen onClose={noop} onLoadTrackerModule={async () => {}} />);
    const input2 = second.container.querySelector('input[type="text"], input:not([type])') as HTMLInputElement;
    expect(input2.value).toBe('chip');
    expect(second.getByText('chiptune.mod')).toBeTruthy();
    await new Promise((r) => setTimeout(r, 450));
    expect(searches).toBe(before);
  });
});

describe('file browser reopens where it was', () => {
  it('shows the remembered folder', async () => {
    updateFileBrowserMemory({ fileSource: 'demo', currentPath: 'songs/formats/mine' });
    const { findByText } = render(<FileBrowser isOpen mode="load" onClose={noop} onLoad={noop} onLoadTrackerModule={async () => {}} />);
    expect(await findByText('songs/formats/mine')).toBeTruthy();
  });

  it('puts the list back at the remembered scroll position', async () => {
    updateFileBrowserMemory({ fileSource: 'demo', currentPath: 'songs' });
    rememberScroll(scrollKey('demo', 'songs'), 240);
    const { container } = render(<FileBrowser isOpen mode="load" onClose={noop} onLoad={noop} onLoadTrackerModule={async () => {}} />);
    const list = container.querySelector('.overflow-auto') as HTMLElement;
    await waitFor(() => expect(list.scrollTop).toBe(240));
  });

  it('records the scroll position when the list scrolls', async () => {
    updateFileBrowserMemory({ fileSource: 'demo', currentPath: 'songs' });
    const { container } = render(<FileBrowser isOpen mode="load" onClose={noop} onLoad={noop} onLoadTrackerModule={async () => {}} />);
    const list = container.querySelector('.overflow-auto') as HTMLElement;
    await waitFor(() => expect(list).toBeTruthy());
    await new Promise((r) => setTimeout(r, 50));
    list.scrollTop = 99;
    fireEvent.scroll(list);
    expect(readFileBrowserMemory().scroll[scrollKey('demo', 'songs')]).toBe(99);
  });

  it('works with storage blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    updateFileBrowserMemory({ currentPath: 'a/b' });
    expect(readFileBrowserMemory().currentPath).toBe('a/b');
    vi.restoreAllMocks();
  });
});

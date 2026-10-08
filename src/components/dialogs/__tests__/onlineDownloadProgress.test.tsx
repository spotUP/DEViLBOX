/**
 * An Online (Modland) search result shows its download as a progress bar along
 * the bottom of the row (UI7): it fills as bytes arrive (received over
 * Content-Length), pulses while the length is unknown, and is gone when the
 * load is done. Only the network is stubbed; the panel and modlandApi are real.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { OnlinePanel } from '../FilePreviewPanel';
import { readBodyWithProgress, type DownloadProgress } from '@/lib/modlandApi';
import { progressPercent } from '../downloadProgress';

const PATH = 'pub/modules/Protracker/Spot/walk.mod';

/** Serve one Modland hit whose download delivers 4 bytes, waits for `gate`, then 4 more. */
function serve(contentLength: number | null, gate: Promise<void>): void {
  vi.stubGlobal('fetch', async (input: string | URL) => {
    const url = new URL(String(input), 'http://x');
    if (url.pathname.endsWith('/modland/search')) {
      return new Response(JSON.stringify({
        results: [{ id: 1, author: 'Spot', filename: 'walk.mod', full_path: PATH, format: 'Protracker', extension: 'mod', avg_rating: null, vote_count: null }],
        limit: 50, offset: 0, query: 'walk',
      }), { status: 200 });
    }
    if (url.pathname.endsWith('/modland/download')) {
      const body = new ReadableStream<Uint8Array>({
        async start(c) {
          c.enqueue(new Uint8Array([1, 2, 3, 4]));
          await gate;
          c.enqueue(new Uint8Array([5, 6, 7, 8]));
          c.close();
        },
      });
      return new Response(body, { status: 200, headers: contentLength ? { 'content-length': String(contentLength) } : {} });
    }
    return new Response(JSON.stringify({ files: [], results: [], formats: [] }), { status: 200 });
  });
}

async function startLoad(onLoad: (b: ArrayBuffer) => void) {
  const view = render(<OnlinePanel isOpen onClose={() => {}} onLoadTrackerModule={async (b) => { onLoad(b); }} />);
  fireEvent.change(view.container.querySelector('input') as HTMLInputElement, { target: { value: 'walk' } });
  const row = await waitFor(() => view.getByText('walk.mod').closest('div[class*="cursor-pointer"]') as HTMLElement, { timeout: 4000 });
  fireEvent.doubleClick(row);
  return { view, row };
}

describe('the Online search row draws its download as a bottom border', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('fills as bytes arrive and is gone when the load is done', async () => {
    let release!: () => void;
    serve(8, new Promise<void>((r) => { release = r; }));
    const loads: ArrayBuffer[] = [];
    const { row } = await startLoad((b) => loads.push(b));

    const bar = await waitFor(() => {
      const el = row.querySelector('[data-testid="download-progress"]') as HTMLElement | null;
      expect(el?.getAttribute('aria-valuenow')).toBe('50');
      return el as HTMLElement;
    }, { timeout: 4000 });
    expect(bar.style.width).toBe('50%');

    release();
    await waitFor(() => expect(loads).toHaveLength(1), { timeout: 4000 });
    expect(loads[0].byteLength).toBe(8);
    await waitFor(() => expect(row.querySelector('[data-testid="download-progress"]')).toBeNull());
  });

  it('pulses while the server sends no length', async () => {
    let release!: () => void;
    serve(null, new Promise<void>((r) => { release = r; }));
    const { row } = await startLoad(() => {});
    const bar = await waitFor(() => {
      const el = row.querySelector('[data-testid="download-progress"]') as HTMLElement | null;
      expect(el).not.toBeNull();
      return el as HTMLElement;
    }, { timeout: 4000 });
    expect(bar.getAttribute('aria-valuenow')).toBeNull();
    expect(bar.className).toContain('animate-pulse');
    release();
  });
});

describe('the one progress callback', () => {
  it('reports every chunk with the Content-Length, and returns all the bytes', async () => {
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array([1, 2])); c.enqueue(new Uint8Array([3])); c.close(); } });
    const seen: DownloadProgress[] = [];
    const out = await readBodyWithProgress(new Response(body, { headers: { 'content-length': '3' } }), (p) => seen.push(p));
    expect(Array.from(new Uint8Array(out))).toEqual([1, 2, 3]);
    expect(seen).toEqual([{ received: 0, total: 3 }, { received: 2, total: 3 }, { received: 3, total: 3 }]);
  });

  it('the open path hands the same callback to a Modland source', async () => {
    serve(8, Promise.resolve());
    const { acquire } = await import('@/lib/song/acquireSource');
    const seen: DownloadProgress[] = [];
    const { file } = await acquire({ kind: 'modland', path: PATH, onProgress: (p) => seen.push(p) });
    expect(file.size).toBe(8);
    expect(seen.at(-1)).toEqual({ received: 8, total: 8 });
    vi.unstubAllGlobals();
  });

  it('percent is null without a total and clamped with one', () => {
    expect(progressPercent(undefined)).toBeNull();
    expect(progressPercent({ received: 5, total: null })).toBeNull();
    expect(progressPercent({ received: 9, total: 8 })).toBe(100);
    expect(progressPercent({ received: 2, total: 8 })).toBe(25);
  });
});

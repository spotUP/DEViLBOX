/**
 * A Modland bob4e.dum loaded from the file browser plays with bob4.ins.
 * The browser downloaded bob4.ins and pre-wrote it into the UADE filesystem,
 * then called onLoadTrackerModule(buffer, name) with no companions; UADE then
 * reported "file not found '/uade/bob4e.ins'" and "'/uade/bob4.ins'"
 * (2026-10-06). The companions now travel WITH the load. Only the network is
 * stubbed; the panel, modlandApi and the companion resolver are real.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { ModlandPanel } from '../FilePreviewPanel';

const DIR = 'pub/modules/Infogrames/Charles Callet';
const FILES = ['bob4e.dum', 'bob4.ins', 'bob4d.ins', 'bob4f.dum'].map((n) => `${DIR}/${n}`);

function serveModland(): void {
  vi.stubGlobal('fetch', async (input: string | URL) => {
    const url = new URL(String(input), 'http://x');
    const p = url.pathname;
    if (p.endsWith('/modland/search')) {
      return new Response(JSON.stringify({
        results: [{ id: 1, format: 'Infogrames', author: 'Charles Callet', filename: 'bob4e.dum', full_path: `${DIR}/bob4e.dum`, extension: 'dum', avg_rating: null, vote_count: null }],
        limit: 50, offset: 0, query: 'bob4e',
      }), { status: 200 });
    }
    if (p.endsWith('/modland/list')) {
      const dir = url.searchParams.get('dir') ?? '';
      const list = FILES.filter((f) => f.startsWith(dir + '/') && !f.slice(dir.length + 1).includes('/'))
        .map((f) => ({ full_path: f, filename: f.split('/').pop() }));
      return new Response(JSON.stringify({ files: list }), { status: 200 });
    }
    if (p.endsWith('/modland/download')) {
      const path = url.searchParams.get('path') ?? '';
      return FILES.includes(path) ? new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 }) : new Response('{}', { status: 404 });
    }
    return new Response('{}', { status: 404 });
  });
}

describe('a Modland bob4e.dum loaded from the file browser plays with bob4.ins', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('hands bob4.ins to the load itself', async () => {
    serveModland();
    const loads: Array<{ name: string; companions: Map<string, ArrayBuffer> | undefined }> = [];
    const view = render(
      <ModlandPanel isOpen onClose={() => {}} onLoadTrackerModule={async (_b, name, companions) => { loads.push({ name, companions }); }} />,
    );
    const input = view.container.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'bob4e' } });
    const row = await waitFor(() => {
      const el = view.getByText('bob4e.dum').closest('div[class*="cursor-pointer"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    }, { timeout: 4000 });
    fireEvent.doubleClick(row);
    await waitFor(() => expect(loads).toHaveLength(1), { timeout: 4000 });
    expect(loads[0].name).toBe('bob4e.dum');
    expect([...(loads[0].companions?.keys() ?? [])]).toEqual(['bob4.ins']);
  });

  it('no browser pre-writes companions into the UADE filesystem ahead of a separate load', () => {
    // Only a direct preview (write, then loadForPlayback on the same engine) may write.
    for (const f of ['src/components/dialogs/FilePreviewPanel.tsx', 'src/components/dj/DJModlandBrowser.tsx']) {
      const src = readFileSync(f, 'utf8');
      const writes = src.split('\n').filter((l) => l.includes('addCompanionFile'));
      for (const w of writes) expect(w).toMatch(/uade\.addCompanionFile/);
    }
  });
});

/**
 * A preview does not change the editor song's module or companions. The file
 * browser's preview played on UADEEngine.getInstance() - the editor's engine -
 * so previewing a Modland tune replaced the loaded song's module and (now that
 * the load owns the companion set) its partner files. A preview plays on its
 * own engine and its companions travel with ITS load.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';

const engines = vi.hoisted(() => {
  const make = () => ({
    ready: vi.fn(async () => {}),
    stop: vi.fn(),
    play: vi.fn(),
    loadForPlayback: vi.fn(async () => {}),
    output: { connect: vi.fn(), disconnect: vi.fn() },
  });
  return { editor: make(), preview: make() };
});

vi.mock('@engine/uade/UADEEngine', () => ({
  UADEEngine: { getInstance: vi.fn(() => engines.editor), getPreviewInstance: vi.fn(() => engines.preview) },
}));
vi.mock('@/utils/audio-context', () => ({ getDevilboxAudioContext: () => ({ destination: {} }) }));

import { OnlinePanel } from '../FilePreviewPanel';

const DIR = 'pub/modules/Infogrames/Charles Callet';
const FILES = ['bob4e.dum', 'bob4.ins'].map((n) => `${DIR}/${n}`);

describe('previewing a Modland tune', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('plays on the preview engine with its own companions and leaves the editor engine untouched', async () => {
    vi.stubGlobal('fetch', async (input: string | URL) => {
      const url = new URL(String(input), 'http://x');
      const p = url.pathname;
      if (p.endsWith('/modland/search')) {
        return new Response(JSON.stringify({
          results: [{ id: 1, author: 'x', filename: 'bob4e.dum', full_path: `${DIR}/bob4e.dum`, format: 'Infogrames', extension: 'dum', avg_rating: null, vote_count: null }],
          limit: 50, offset: 0, query: 'bob4e',
        }), { status: 200 });
      }
      if (p.endsWith('/modland/list')) {
        const dir = url.searchParams.get('dir') ?? '';
        const files = FILES.filter((f) => f.startsWith(dir + '/')).map((f) => ({ full_path: f, filename: f.split('/').pop() }));
        return new Response(JSON.stringify({ files }), { status: 200 });
      }
      if (p.endsWith('/modland/download')) return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
      return new Response('{}', { status: 404 });
    });
    const view = render(<OnlinePanel isOpen onClose={() => {}} onLoadTrackerModule={async () => {}} />);
    fireEvent.change(view.container.querySelector('input') as HTMLInputElement, { target: { value: 'bob4e' } });
    const button = await waitFor(() => view.getByTitle('Preview'), { timeout: 4000 });
    fireEvent.click(button);
    await waitFor(() => expect(engines.preview.loadForPlayback).toHaveBeenCalledTimes(1), { timeout: 4000 });

    const args = engines.preview.loadForPlayback.mock.calls[0] as unknown as [ArrayBuffer, string, number, boolean, Map<string, ArrayBuffer>];
    expect(args[1]).toBe('bob4e.dum');
    expect([...args[4].keys()]).toEqual(['bob4.ins']);
    expect(engines.editor.loadForPlayback).not.toHaveBeenCalled();
    expect(engines.editor.stop).not.toHaveBeenCalled();
    expect(engines.editor.output.connect).not.toHaveBeenCalled();
  });
});

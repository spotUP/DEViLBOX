/** UPROUGH-GENERATE: hamburger item -> dialog -> server generate -> the tracker holds the generated song. */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import fixture from '@/lib/uprough/__tests__/fixtures/e6.uprough-song.json';

vi.mock('@engine/ToneEngine', () => {
  const engine: unknown = new Proxy({}, { get: (_t, k) => () => (k === 'preloadInstruments' ? Promise.resolve() : undefined) });
  return { getToneEngine: () => engine, ToneEngine: { getInstance: () => engine } };
});
// The toolbar reads it as a hook (InstrumentSelector) and the instrument store calls
// getState(); the real store starts a Worker, which jsdom does not have.
vi.mock('@stores/useInstrumentTypeStore', () => {
  const state = { results: {}, resetClassified: () => undefined, classifyInstruments: () => undefined };
  const hook = (sel: (s: typeof state) => unknown) => sel(state);
  return { useInstrumentTypeStore: Object.assign(hook, { getState: () => state }) };
});
import { FT2Toolbar } from '@components/tracker/FT2Toolbar/FT2Toolbar';
import { useTrackerStore } from '@stores/useTrackerStore';
import { UpRoughGenerateDialog } from '../UpRoughGenerateDialog';
import type { R2Event } from '@/engine/uprough/r2Events';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Generate Up Rough Song from the hamburger menu', () => {
  it('fetches styles, posts the choice once, shows the running phase and loads the returned song into the tracker', async () => {
    // Hold the generate answer so the dialog can be seen while the server works.
    let answer: (r: Response) => void = () => undefined;
    const generated = new Promise<Response>((resolve) => { answer = resolve; });
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url === '/api/uprough/styles'
        ? new Response(JSON.stringify({ styles: ['trap'] }), { status: 200 })
        : generated,
    );
    vi.stubGlobal('fetch', fetchMock);
    useTrackerStore.setState({ upRoughMeta: null });

    const { container } = render(<FT2Toolbar />);
    const burger = container.querySelector('svg.lucide-menu')?.closest('button');
    if (!burger) throw new Error('no hamburger button');
    fireEvent.click(burger);
    fireEvent.click(await screen.findByText('Generate Up Rough Song...'));

    const style = await screen.findByTitle('Style');
    await waitFor(() => expect(style.textContent).toContain('trap'));
    fireEvent.change(screen.getByLabelText('Bars (empty for the whole song)'), { target: { value: '16' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect((await screen.findByRole('status')).textContent).toContain('Generating on the server... 0 s');
    answer(new Response(JSON.stringify(fixture), { status: 200 }));

    await waitFor(() => expect(useTrackerStore.getState().upRoughMeta?.song.style).toBe('trap'), { timeout: 10_000 }); // the import unloads the outgoing song first
    expect(useTrackerStore.getState().upRoughMeta?.song.name).toBe('trap 1');
    const posts = fetchMock.mock.calls.filter((c) => c[0] === '/api/uprough/generate');
    expect(posts).toHaveLength(1);
    const init = posts[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ style: 'trap', seed: 1, key: 'Am', bars: 16 });
  });
});

describe('Generate dialog streams the host events (R2c)', () => {
  it('posts events:true, hands every NDJSON line to onEvent in order across chunk cuts, and loads the done line song', async () => {
    const lines = [
      { seq: 0, type: 'start', mode: 'generate' },
      { seq: 1, type: 'section', section: 0 },
      { seq: 2, type: 'done', mode: 'generate', samples: 0, song: fixture },
    ].map((e) => JSON.stringify(e)).join('\n') + '\n';
    const enc = new TextEncoder().encode(lines);
    const cuts = [11, 60, enc.length];
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url === '/api/uprough/styles'
        ? new Response(JSON.stringify({ styles: ['trap'] }), { status: 200 })
        : new Response(new ReadableStream<Uint8Array>({
          start(c) { let from = 0; for (const to of cuts) { c.enqueue(enc.slice(from, to)); from = to; } c.close(); },
        }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    useTrackerStore.setState({ upRoughMeta: null });
    const seen: R2Event[] = []; // sentinel: the count proves the streaming path ran
    render(<UpRoughGenerateDialog isOpen onClose={() => undefined} onEvent={(e) => seen.push(e)} />);
    const style = await screen.findByTitle('Style');
    await waitFor(() => expect(style.textContent).toContain('trap'));
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    await waitFor(() => expect(useTrackerStore.getState().upRoughMeta?.song.style).toBe('trap'), { timeout: 10_000 });
    expect(seen.map((e) => e.type)).toEqual(['start', 'section', 'done']);
    const post = fetchMock.mock.calls.find((c) => c[0] === '/api/uprough/generate')!;
    expect(JSON.parse((post[1] as RequestInit).body as string).events).toBe(true);
  });
});

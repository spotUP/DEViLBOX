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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Generate Up Rough Song from the hamburger menu', () => {
  it('fetches styles, posts the choice once and loads the returned song into the tracker', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url === '/api/uprough/styles'
        ? new Response(JSON.stringify({ styles: ['trap'] }), { status: 200 })
        : new Response(JSON.stringify(fixture), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    useTrackerStore.setState({ upRoughMeta: null });

    const { container } = render(<FT2Toolbar />);
    const burger = container.querySelector('svg.lucide-menu')?.closest('button');
    if (!burger) throw new Error('no hamburger button');
    fireEvent.click(burger);
    fireEvent.click(await screen.findByText('Generate Up Rough Song...'));

    const select = (await screen.findByLabelText('Style')) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe('trap'));
    fireEvent.change(screen.getByLabelText('Bars (empty for the whole song)'), { target: { value: '16' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    await waitFor(() => expect(useTrackerStore.getState().upRoughMeta?.song.style).toBe('trap'));
    expect(useTrackerStore.getState().upRoughMeta?.song.name).toBe('trap 1');
    const posts = fetchMock.mock.calls.filter((c) => c[0] === '/api/uprough/generate');
    expect(posts).toHaveLength(1);
    const init = posts[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ style: 'trap', seed: 1, key: 'Am', bars: 16 });
  });
});

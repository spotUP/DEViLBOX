/** UPROUGH-PREVIEW: hamburger item -> exported song text -> server render -> the playback path, once. */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import fixture from '@/lib/uprough/__tests__/fixtures/e6.uprough-song.json';

vi.mock('@engine/ToneEngine', () => {
  const engine: unknown = new Proxy({}, { get: (_t, k) => () => (k === 'preloadInstruments' ? Promise.resolve() : undefined) });
  return { getToneEngine: () => engine, ToneEngine: { getInstance: () => engine } };
});
vi.mock('@stores/useInstrumentTypeStore', () => {
  const state = { results: {}, resetClassified: () => undefined, classifyInstruments: () => undefined };
  const hook = (sel: (s: typeof state) => unknown) => sel(state);
  return { useInstrumentTypeStore: Object.assign(hook, { getState: () => state }) };
});
vi.mock('@lib/uprough/auditionPlayer', () => ({
  playAudition: vi.fn(async () => undefined),
  stopAudition: vi.fn(),
}));
import { FT2Toolbar } from '@components/tracker/FT2Toolbar/FT2Toolbar';
import { useTrackerStore } from '@stores/useTrackerStore';
import { playAudition } from '@lib/uprough/auditionPlayer';
import { openUpRoughSong } from '@/lib/uprough/openUpRoughSong';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Preview Up Rough Song from the hamburger menu', () => {
  it('posts the exported song to /api/uprough/render and plays the returned WAV once', async () => {
    const wav = new Uint8Array([82, 73, 70, 70]).buffer;
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(wav, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await openUpRoughSong(JSON.stringify(fixture));
    const exported = useTrackerStore.getState().exportUpRoughSong();

    const { container } = render(<FT2Toolbar />);
    const burger = container.querySelector('svg.lucide-menu')?.closest('button');
    if (!burger) throw new Error('no hamburger button');
    fireEvent.click(burger);
    fireEvent.click(await screen.findByText('Preview Up Rough Song'));

    await waitFor(() => expect(playAudition).toHaveBeenCalledTimes(1));
    const posts = fetchMock.mock.calls.filter((c) => c[0] === '/api/uprough/render');
    expect(posts).toHaveLength(1);
    expect(JSON.parse((posts[0]![1] as RequestInit).body as string)).toEqual({ song: exported });
    expect(Array.from(new Uint8Array((vi.mocked(playAudition).mock.calls[0]![0])))).toEqual([82, 73, 70, 70]);
  });

  it('a second click cancels the render still in flight, so only the newest render plays', async () => {
    vi.mocked(playAudition).mockClear();
    const signals: (AbortSignal | undefined)[] = [];
    let releaseFirst: (r: Response) => void = () => undefined;
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      if (_url !== '/api/uprough/render') return Promise.resolve(new Response('{}', { status: 200 }));
      signals.push(init?.signal ?? undefined);
      if (signals.length === 1) return new Promise<Response>((resolve) => { releaseFirst = resolve; });
      return Promise.resolve(new Response(new Uint8Array([2]).buffer, { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    await openUpRoughSong(JSON.stringify(fixture));

    const { container } = render(<FT2Toolbar />);
    const burger = container.querySelector('svg.lucide-menu')?.closest('button');
    if (!burger) throw new Error('no hamburger button');
    fireEvent.click(burger);
    fireEvent.click(await screen.findByText('Preview Up Rough Song'));
    await waitFor(() => expect(signals).toHaveLength(1));
    fireEvent.click(burger);
    fireEvent.click(await screen.findByText('Preview Up Rough Song'));
    await waitFor(() => expect(playAudition).toHaveBeenCalledTimes(1));

    expect(signals[0]?.aborted).toBe(true);
    releaseFirst(new Response(new Uint8Array([1]).buffer, { status: 200 }));
    await new Promise((r) => setTimeout(r, 0));
    expect(playAudition).toHaveBeenCalledTimes(1);
    expect(Array.from(new Uint8Array(vi.mocked(playAudition).mock.calls[0]![0]))).toEqual([2]);
  });
});

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
import { scriptedGenerateEvents, toNdjson } from '@/lib/uprough/factory/scriptedRun';
import { decideToCells } from '@/lib/uprough/factory/decideToCells';
import { useFactoryStore } from '@/lib/uprough/factory/useFactoryStore';
import { bankVoice } from '@/lib/uprough/factory/voiceAudition';

/** The scripted host stream with the song on the done line, as the server sends it. */
function scriptedStream(): { events: R2Event[]; text: string } {
  const events = scriptedGenerateEvents('trap', 1).map((e) => (e.type === 'done' ? { ...e, song: fixture } : e));
  return { events, text: toNdjson(events) };
}

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

    expect(await screen.findByText('Generating on the server... 0 s', { exact: false })).toBeTruthy();
    answer(new Response(scriptedStream().text, { status: 200 }));

    await waitFor(() => expect(useTrackerStore.getState().upRoughMeta?.song.style).toBe('trap'), { timeout: 10_000 }); // the import unloads the outgoing song first
    expect(useTrackerStore.getState().upRoughMeta?.song.name).toBe('trap 1');
    const posts = fetchMock.mock.calls.filter((c) => c[0] === '/api/uprough/generate');
    expect(posts).toHaveLength(1);
    const init = posts[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ style: 'trap', seed: 1, key: 'Am', bars: 16, events: true });
  });
});

describe('Generate dialog streams the host events (R2c)', () => {
  it('the factory panel receives the streamed events: every line once, across chunk cuts, and the decides fill the tracker', async () => {
    const { events, text } = scriptedStream();
    const enc = new TextEncoder().encode(text);
    const cuts = [11, 60, Math.floor(enc.length / 2), enc.length];
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url === '/api/uprough/styles'
        ? new Response(JSON.stringify({ styles: ['trap'] }), { status: 200 })
        : new Response(new ReadableStream<Uint8Array>({
          start(c) { let from = 0; for (const to of cuts) { c.enqueue(enc.slice(from, to)); from = to; } c.close(); },
        }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    useTrackerStore.setState({ upRoughMeta: null });

    // Expected cells, built the way the fill builds them: one taken set per section and bar.
    const expectedKeys = new Set<string>();
    let expectedCells = 0;
    const taken = new Map<string, Set<string>>();
    for (const ev of events) {
      if (ev.type !== 'decide') continue;
      const key = `${ev.section}:${ev.bar}`;
      if (!taken.has(key)) taken.set(key, new Set());
      const cells = decideToCells(ev.lane, ev.bar, ev.cells, taken.get(key));
      expectedCells += cells.length;
      for (const c of cells) expectedKeys.add(`${ev.section}:${c.lane}:${c.row}`);
    }

    // Sentinels, read when the done line arrives (before the loaded song replaces the filled patterns).
    const seen: R2Event[] = [];
    let eventsSeen = -1;
    let trackerCells = -1;
    const onEvent = (e: R2Event) => {
      seen.push(e);
      if (e.type !== 'done') return;
      eventsSeen = useFactoryStore.getState().state.eventCount;
      trackerCells = 0;
      for (const p of useTrackerStore.getState().patterns) {
        for (const ch of p.channels) trackerCells += ch.rows.filter((cell) => cell.note > 0).length;
      }
    };
    render(<UpRoughGenerateDialog isOpen onClose={() => undefined} onEvent={onEvent} />);
    const style = await screen.findByTitle('Style');
    await waitFor(() => expect(style.textContent).toContain('trap'));
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    await waitFor(() => expect(useTrackerStore.getState().upRoughMeta?.song.style).toBe('trap'), { timeout: 10_000 });

    expect(seen.map((e) => e.seq)).toEqual(events.map((e) => e.seq));
    expect(events.length).toBeGreaterThan(0);
    // Each host event reaches the store exactly once: the local act 1 runs silent on this path.
    expect(eventsSeen).toBe(events.length);
    const shown = useFactoryStore.getState().state;
    expect(new Set(shown.voiceOrder).size).toBe(shown.voiceOrder.length);
    expect(shown.slots.find((x) => x.id === 'snare')!.attachments).toHaveLength(2);
    expect(useFactoryStore.getState().state.cellsWritten).toBe(expectedCells);
    expect(trackerCells).toBe(expectedKeys.size);
    // ...but it still keeps the bank for audition audio.
    expect(bankVoice('kick')?.samples.length).toBeGreaterThan(0);
    const post = fetchMock.mock.calls.find((c) => c[0] === '/api/uprough/generate')!;
    expect(JSON.parse((post[1] as RequestInit).body as string).events).toBe(true);
  });
});

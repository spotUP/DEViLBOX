/** UPROUGH-GENERATE: hamburger item -> dialog -> server generate -> the tracker holds the generated song. */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, act, fireEvent, screen, waitFor } from '@testing-library/react';
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
// The voice chips play through the Devilbox context; count their start() calls (the preview uses the player's own fake).
const chipStarts: { length: number }[] = [];
vi.mock('@/utils/audio-context', () => {
  const dest = {};
  const ctx = {
    destination: dest,
    createBuffer: (_c: number, length: number) => ({ length, copyToChannel: () => undefined }),
    createGain: () => ({ gain: { value: 1 }, connect: () => dest }),
    createBufferSource: () => {
      const node: { buffer: { length: number } | null; connect: (g: unknown) => unknown; start: () => void } = {
        buffer: null, connect: (g) => g, start: () => { if (node.buffer) chipStarts.push(node.buffer); },
      };
      return node;
    },
  };
  return { getDevilboxAudioContext: () => ctx };
});
vi.mock('@/engine/uprough/drumBank', async (orig) => {
  const m = await orig<typeof import('@/engine/uprough/drumBank')>();
  return { ...m, songDrumBank: vi.fn(m.songDrumBank) };
});
import { FT2Toolbar } from '@components/tracker/FT2Toolbar/FT2Toolbar';
import { useTrackerStore } from '@stores/useTrackerStore';
import { UpRoughGenerateDialog } from '../UpRoughGenerateDialog';
import type { R2Event } from '@/engine/uprough/r2Events';
import { scriptedGenerateEvents, toNdjson } from '@/lib/uprough/factory/scriptedRun';
import { decideToCells } from '@/lib/uprough/factory/decideToCells';
import { useFactoryStore } from '@/lib/uprough/factory/useFactoryStore';
import { bankVoice } from '@/lib/uprough/factory/voiceAudition';
import { songDrumBank } from '@/engine/uprough/drumBank';
import { setRenderBackendForTests, type RenderBackend } from '@/lib/uprough/upRoughSongService';
import { setPlayerAudioForTests, setListenWhileBuilding, stopUpRoughSong, upRoughPreviewState, type PlayerAudio } from '@/lib/uprough/upRoughSongPlayer';
import type { PartialMix } from '@/lib/uprough/songRenderJob';

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
    fireEvent.change(screen.getByLabelText('Bars'), { target: { value: '16' } });
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

describe('Replay after a Generate keeps the loaded song', () => {
  it('the scripted Replay drives the panel only: the tracker keeps the generated patterns and their instrument ids', async () => {
    const { text } = scriptedStream();
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url === '/api/uprough/styles'
        ? new Response(JSON.stringify({ styles: ['trap'] }), { status: 200 })
        : new Response(text, { status: 200 })));
    useTrackerStore.setState({ upRoughMeta: null });
    render(<UpRoughGenerateDialog isOpen onClose={() => undefined} />);
    const style = await screen.findByTitle('Style');
    await waitFor(() => expect(style.textContent).toContain('trap'));
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    await waitFor(() => expect(useTrackerStore.getState().upRoughMeta?.song.style).toBe('trap'), { timeout: 10_000 });
    const loaded = useTrackerStore.getState().patterns;

    fireEvent.click(screen.getByRole('button', { name: 'Replay scripted run' }));
    await waitFor(() => expect(useFactoryStore.getState().state.done).toBe(true), { timeout: 10_000 });

    // Before the fix the replay's start event replaced the song's patterns with blank ones and its decides wrote
    // provisional instrument ids (16, 17) that match no instrument of the loaded song: silent channels.
    expect(useTrackerStore.getState().patterns).toBe(loaded);
    expect(useFactoryStore.getState().state.cellsWritten).toBe(0);
  });
});

describe('R2h-01: one Generate run reaches the store, the tracker, the preview and the audition chip', () => {
  it('counts every NDJSON line, writes the decide cells, previews then swaps once, and plays the kept bank voice on a chip click', async () => {
    const { events, text } = scriptedStream();
    const lineCount = text.split('\n').filter((l) => l.trim() !== '').length;
    const enc = new TextEncoder().encode(text);
    vi.stubGlobal('fetch', vi.fn(async (url: string, _init?: RequestInit) =>
      url === '/api/uprough/styles'
        ? new Response(JSON.stringify({ styles: ['trap'] }), { status: 200 })
        : new Response(new ReadableStream<Uint8Array>({ start(c) { c.enqueue(enc); c.close(); } }), { status: 200 }),
    ));
    useTrackerStore.setState({ upRoughMeta: null });

    // Expected cells: summed from decideToCells the way the fill builds them (one taken set per section and bar).
    let expectedCells = 0;
    const taken = new Map<string, Set<string>>();
    for (const ev of events) {
      if (ev.type !== 'decide') continue;
      const key = `${ev.section}:${ev.bar}`;
      if (!taken.has(key)) taken.set(key, new Set());
      expectedCells += decideToCells(ev.lane, ev.bar, ev.cells, taken.get(key)).length;
    }

    // Player audio and render backend fakes: the preview starts are counted, the render is held by hand.
    let previewStarts = 0;
    setPlayerAudioForTests({
      context: {
        currentTime: 0,
        createBuffer: (_c: number, length: number, sampleRate: number) => ({ length, sampleRate, getChannelData: () => new Float32Array(length) }) as unknown as AudioBuffer,
        createBufferSource: () => ({
          buffer: null, loop: false, connect: () => undefined, disconnect: () => undefined, stop: () => undefined,
          start: () => { previewStarts++; },
        }) as unknown as AudioBufferSourceNode,
      },
      destination: {} as AudioNode,
    } satisfies PlayerAudio);
    let onPartial: ((p: PartialMix) => void) | undefined;
    let finish: ((m: Float64Array) => void) | undefined;
    const backend: RenderBackend = {
      render(_e, _o, _s, _r, p) { onPartial = p; return new Promise<Float64Array>((r) => { finish = r; }); },
    };
    setRenderBackendForTests(backend, 5);
    setListenWhileBuilding(true);

    let eventsAtDone = -1;
    let startsAtDone = -1;
    let cellsAtDone = -1;
    const onEvent = (e: R2Event) => {
      if (e.type !== 'done') return;
      eventsAtDone = useFactoryStore.getState().state.eventCount;
      cellsAtDone = useFactoryStore.getState().state.cellsWritten;
      startsAtDone = previewStarts;
    };
    try {
      render(<UpRoughGenerateDialog isOpen onClose={() => undefined} onEvent={onEvent} />);
      const style = await screen.findByTitle('Style');
      await waitFor(() => expect(style.textContent).toContain('trap'));
      fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

      // (a) every line reached the factory store, and there was something to count.
      await waitFor(() => expect(useTrackerStore.getState().upRoughMeta?.song.style).toBe('trap'), { timeout: 10_000 });
      expect(lineCount).toBeGreaterThan(0);
      expect(eventsAtDone).toBe(lineCount);
      expect(useFactoryStore.getState().state.eventCount).toBe(lineCount);
      // (b) the cells written equal the decide cells.
      expect(expectedCells).toBeGreaterThan(0);
      expect(cellsAtDone).toBe(expectedCells);
      expect(useFactoryStore.getState().state.cellsWritten).toBe(expectedCells);

      // (c) the song load starts the render; with Listen while building on, a landed section plays before the mastered mix.
      await waitFor(() => expect(onPartial).toBeDefined(), { timeout: 5_000 });
      expect(previewStarts).toBe(startsAtDone === -1 ? 0 : startsAtDone); // nothing played by the stream itself
      act(() => { onPartial!({ section: 0, start: 0, mix: new Float64Array(22050).fill(0.1) }); });
      expect(previewStarts).toBeGreaterThanOrEqual(1);
      const beforeSwap = previewStarts;
      expect(upRoughPreviewState()).toBe('preview');
      await act(async () => { finish!(new Float64Array(44100).fill(0.9)); await new Promise((r) => setTimeout(r, 20)); });
      expect(upRoughPreviewState()).toBe('mastered');
      expect(previewStarts).toBe(beforeSwap + 1); // exactly one swap

      // (d) the chip plays the kept bank voice once, without rebuilding the bank.
      const kept = bankVoice('kick');
      expect(kept).toBeDefined();
      const builds = vi.mocked(songDrumBank).mock.calls.length;
      const before = chipStarts.length;
      fireEvent.click(screen.getByRole('button', { name: 'Play kick' }));
      expect(chipStarts).toHaveLength(before + 1);
      expect(chipStarts[before]!.length).toBe(kept!.samples.length);
      expect(vi.mocked(songDrumBank).mock.calls.length).toBe(builds);
      expect(bankVoice('kick')!.samples).toBe(kept!.samples);
    } finally {
      stopUpRoughSong();
      setListenWhileBuilding(false);
      setRenderBackendForTests(null);
      setPlayerAudioForTests(null);
    }
  }, 30_000);
});

describe('Generate dialog layout (owner look test)', () => {
  it('scrolls its body inside the modal and wraps a long host error, so the header and the whole error stay readable', async () => {
    const hostError = 'song_file.py: error: unrecognized arguments: --events -\nusage: song_file.py new [-h] --style STYLE';
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error(hostError); }));
    render(<UpRoughGenerateDialog isOpen onClose={() => undefined} />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(hostError);
    expect(alert.className).toContain('whitespace-pre-wrap');
    expect(alert.className).toContain('break-words');

    // The body, not the modal, is the scroll container: flex-1 + min-h-0 lets it shrink below its content.
    const body = alert.closest('.overflow-y-auto');
    expect(body).not.toBeNull();
    expect(body!.className).toContain('min-h-0');
    expect(body!.className).toContain('flex-1');

    // Seed, Key and Bars share one row.
    const row = screen.getByLabelText('Bars').closest('.grid');
    expect(row).not.toBeNull();
    expect(row!.className).toContain('grid-cols-3');
    expect(row!.contains(screen.getByLabelText('Seed (0 to 9999)'))).toBe(true);
  });
});

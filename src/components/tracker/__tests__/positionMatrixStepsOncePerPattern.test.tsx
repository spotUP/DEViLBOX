/**
 * PATTERN-MATRIX-SCROLL (owner 2026-10-14, asked "many many times"): in
 * Hively / AHX / MusicLine the position matrix scrolled at the speed of the
 * pattern editor, one step per ROW. It must move one step per PATTERN played.
 *
 * Cause: every matrix is a PatternEditorCanvas in format mode. A matrix that
 * was not told it plays drew the shared edit cursor's row - and follow-playback
 * (useTransportStore.setCurrentRow) writes the PATTERN row into that cursor
 * every row. MusicLine, told it plays, rode the format clock's row instead,
 * which also counts pattern rows. Earlier fixes (GoatTracker 2b8ae3f6a,
 * MusicLine 8d3859240/ecfb24b1f) edited the classic RAF branch, which a
 * format canvas never reaches, and were tested by source regex.
 *
 * Reachability: each real corpus song is opened through importTrackerModule
 * (the drag-and-drop load path), the format view TrackerView mounts for its
 * editor mode is rendered, and playback is driven through the stores the
 * engine's position stream writes (PlaybackCoordinator -> usePatternPlayback
 * onRowChange: transport row every row, which also moves the edit cursor;
 * song position on each pattern change; the engine's useWasmPositionStore
 * report). The WASM engines need AudioWorklets and cannot run headless. The
 * matrix canvas's render-worker 'playback' row is read after every row: it must
 * equal the song position, change exactly once per pattern boundary and never
 * within a pattern. Sentinel: resolveFormatViewRow ran with rowsArePositions.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

type Msg = { type: string; row?: number; isPlaying?: boolean; canvas?: { el: HTMLCanvasElement } };
const bridges: Msg[][] = [];
vi.mock('@engine/renderer/OffscreenBridge', () => ({
  TrackerOffscreenBridge: class {
    posts: Msg[] = [];
    constructor(_f: unknown, _o: unknown) { bridges.push(this.posts); }
    post(m: Msg) { this.posts.push(m); }
    dispose() {}
  },
}));
vi.mock('@/engine/ToneEngine', () => {
  const engine = {
    releaseAll: vi.fn(), disposeAllInstruments: vi.fn(), preloadInstruments: vi.fn(async () => {}),
    invalidateInstrument: vi.fn(), setBPM: vi.fn(),
    getChannelLevels: (n: number) => new Array(n).fill(0),
    getEngineChannelLevels: () => null,
    getChannelTriggerLevels: (n: number) => new Array(n).fill(0),
    getChannelTriggerGenerations: (n: number) => new Array(n).fill(0),
  };
  return { getToneEngine: () => engine };
});
// The views read the replayer only for seeks and transport; its Tone graph needs a real AudioContext.
vi.mock('@/engine/TrackerReplayer', () => ({
  getTrackerReplayer: () => new Proxy({}, { get: (_t, k) => (k === 'isPlaying' ? () => false : () => undefined) }),
  peekTrackerReplayer: () => null,
}));
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })) }));
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/lib/songdb', () => ({ computeSongDBHash: () => '', lookupSongDB: async () => null }));
const resolverCalls: Array<{ rowsArePositions: boolean }> = [];
vi.mock('@/lib/tracker/playbackNavigation', async (orig) => {
  const real = await orig<typeof import('@/lib/tracker/playbackNavigation')>();
  return {
    ...real,
    resolveFormatViewRow: (i: Parameters<typeof real.resolveFormatViewRow>[0]) => {
      resolverCalls.push(i);
      return real.resolveFormatViewRow(i);
    },
  };
});

import '@stores'; // registers the stores with storeAccess, as the app's boot does

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

let frames: FrameRequestCallback[] = [];
let frameTime = 0;
function runFrames(count: number) {
  for (let k = 0; k < count; k++) {
    frameTime += 1000 / 60;
    const due = frames; frames = [];
    for (const f of due) f(frameTime);
  }
}

async function openSong(path: string, type: string) {
  const { importTrackerModule } = await import('@/lib/song/songBranches');
  const bytes = readFileSync(resolve(ROOT, path));
  const name = path.split('/').pop()!;
  const file = new File([bytes], name);
  await importTrackerModule({
    metadata: { title: name, type, channels: -1, patterns: -1, orders: -1, instruments: -1, samples: -1, duration: 0 },
    arrayBuffer: await file.arrayBuffer(), file,
  } as never, { useLibopenmpt: true } as never);
}

/** The matrix is the first format canvas in the view (above the pattern editor in Hively and MusicLine). */
function matrixPosts(): Msg[] {
  const withEl = bridges
    .map((posts) => ({ posts, el: posts.find((m) => m.type === 'init')?.canvas?.el }))
    .filter((b): b is { posts: Msg[]; el: HTMLCanvasElement } => !!b.el && b.el.isConnected);
  withEl.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  expect(withEl.length).toBeGreaterThanOrEqual(2); // matrix + pattern editor both mounted
  return withEl[0].posts;
}

async function playAndTrace(View: React.FC, positions: number): Promise<{ pos: number; row: number; shown: number }[]> {
  const { useTrackerStore } = await import('@stores/useTrackerStore');
  const { useTransportStore } = await import('@stores/useTransportStore');
  const { useWasmPositionStore } = await import('@stores/useWasmPositionStore');
  const { useEditorStore } = await import('@stores/useEditorStore');

  render(<div style={{ width: 1200, height: 800 }}><View /></div>);
  await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
  act(() => runFrames(2));
  const posts = matrixPosts();

  useEditorStore.setState({ followPlayback: true });
  useTransportStore.setState((s) => { s.isPlaying = true; s.isPaused = false; });
  const { patterns, patternOrder } = useTrackerStore.getState();
  const trace: { pos: number; row: number; shown: number }[] = [];
  for (let pos = 0; pos < positions; pos++) {
    const len = patterns[patternOrder[pos]]?.length ?? 64;
    for (let row = 0; row < len; row++) {
      act(() => {
        useWasmPositionStore.getState().setPosition(row, pos);
        useTransportStore.getState().setCurrentRow(row, len);
        if (row === 0) useTrackerStore.getState().setCurrentPosition(pos, true);
        runFrames(1); // the engine report lands in useWasmPositionStore on the next frame
      });
      act(() => runFrames(1)); // the canvas's frame after React re-rendered the view
      const last = [...posts].reverse().find((m) => m.type === 'playback')!;
      trace.push({ pos, row, shown: last.row! });
    }
  }
  return trace;
}

function assertOneStepPerPattern(trace: { pos: number; row: number; shown: number }[], positions: number) {
  // Rows played inside each pattern well exceed 1 - the case under test.
  expect(trace.length).toBeGreaterThan(positions * 2);
  let changes = 0;
  for (let i = 1; i < trace.length; i++) {
    const moved = trace[i].shown !== trace[i - 1].shown;
    const boundary = trace[i].pos !== trace[i - 1].pos;
    if (moved) changes++;
    expect({ at: trace[i], moved }).toEqual({ at: trace[i], moved: boundary });
  }
  expect(changes).toBe(positions - 1);
  for (const t of trace) expect(t.shown).toBe(t.pos);
}

describe('position matrix steps once per pattern played, never per row', () => {
  beforeEach(() => {
    HTMLCanvasElement.prototype.transferControlToOffscreen = (function (this: HTMLCanvasElement) { return { el: this }; }) as never;
    globalThis.ResizeObserver = class {
      cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) { this.cb = cb; }
      observe(el: Element) { this.cb([{ target: el, contentRect: { width: 1200, height: 400 } } as unknown as ResizeObserverEntry], this as never); }
      unobserve() {}
      disconnect() {}
    } as never;
    frames = []; frameTime = 0; bridges.length = 0; resolverCalls.length = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      setTransform: () => {}, clearRect: () => {}, fillRect: () => {}, fillStyle: '',
    }) as never);
  });
  afterEach(async () => {
    cleanup();
    const { useTransportStore } = await import('@stores/useTransportStore');
    useTransportStore.setState((s) => { s.isPlaying = false; });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const songs: Array<{ path: string; type: string; mode: string; view: () => Promise<React.FC> }> = [
    { path: 'public/data/songs/formats/hexplosion.hvl', type: 'HVL', mode: 'hively',
      view: async () => (await import('@components/hively/HivelyView')).HivelyView as React.FC },
    { path: 'public/data/songs/ahx/amanda.ahx', type: 'AHX', mode: 'hively',
      view: async () => (await import('@components/hively/HivelyView')).HivelyView as React.FC },
    { path: 'public/data/songs/musicline-editor/drax.ml', type: 'ML', mode: 'musicline',
      view: async () => (await import('@/components/musicline/MusicLineView')).MusicLineView as React.FC },
    // FURNACE-ORDER-MATRIX-SCROLL: the Furnace order matrix built its own canvas and scrolled per row.
    { path: 'public/data/songs/furnace/misc/meaningful_connection_es5506.fur', type: 'FUR', mode: 'furnace',
      view: async () => (await import('@components/furnace/FurnaceView')).FurnaceView as React.FC },
  ];

  for (const song of songs) {
    it(`${song.path.split('/').pop()}: the matrix follows the song position across 3 pattern boundaries`, async () => {
      await openSong(song.path, song.type);
      const { useFormatStore } = await import('@stores/useFormatStore');
      expect(useFormatStore.getState().editorMode).toBe(song.mode);
      const trace = await playAndTrace(await song.view(), 4);
      assertOneStepPerPattern(trace, 4);
      expect(resolverCalls.some((c) => c.rowsArePositions)).toBe(true); // the matrix rule ran (sentinel)
    }, 60000);
  }
  // DUP-AUDIT-ORDER-MATRICES: SF2 and CheeseCutter drew their order lists as hand-built DOM click lists, so they
  // never stepped once per pattern (no canvas at all). They play through their own stores, not the tracker store.
  const sidSongs: Array<{ path: string; type: string; mode: string; store: 'sf2' | 'cc'; view: () => Promise<React.FC> }> = [
    { path: 'public/data/songs/sid-factory-2/Driver 11 Test - Filter.sf2', type: 'SF2', mode: 'sidfactory2', store: 'sf2',
      view: async () => (await import('@/components/sidfactory2/SF2View')).SF2View as React.FC },
    { path: 'public/data/songs/cheesecutter/abaddon-trouble.ct', type: 'CT', mode: 'cheesecutter', store: 'cc',
      view: async () => (await import('@/components/cheesecut/CheeseCutterView')).CheeseCutterView as React.FC },
  ];

  for (const song of sidSongs) {
    it(`${song.path.split('/').pop()}: the order matrix follows the song position across 3 pattern boundaries`, async () => {
      await openSong(song.path, song.type);
      const { useFormatStore } = await import('@stores/useFormatStore');
      expect(useFormatStore.getState().editorMode).toBe(song.mode);
      const View = await song.view();
      render(<div style={{ width: 1200, height: 800 }}><View /></div>);
      await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
      act(() => runFrames(2));
      const posts = matrixPosts();

      const { useSF2Store } = await import('@/stores/useSF2Store');
      const { useCheeseCutterStore } = await import('@/stores/useCheeseCutterStore');
      const { useEditorStore } = await import('@stores/useEditorStore');
      useEditorStore.setState({ followPlayback: true });
      const listLen = song.store === 'sf2'
        ? Math.max(...useSF2Store.getState().orderLists.map((o) => o.entries.length))
        : Math.max(...useCheeseCutterStore.getState().trackLists.map((t) => t.length));
      const positions = Math.min(4, listLen);
      expect(positions).toBeGreaterThanOrEqual(2);
      const trace: { pos: number; row: number; shown: number }[] = [];
      for (let pos = 0; pos < positions; pos++) {
        for (let row = 0; row < 8; row++) {
          act(() => {
            if (song.store === 'sf2') useSF2Store.setState({ playing: true, playbackPos: { row, songPos: pos } });
            else useCheeseCutterStore.setState({ playing: true, playbackPos: { row, songPos: pos } });
            runFrames(1);
          });
          act(() => runFrames(1));
          const last = [...posts].reverse().find((m) => m.type === 'playback')!;
          trace.push({ pos, row, shown: last.row! });
        }
      }
      act(() => {
        if (song.store === 'sf2') useSF2Store.setState({ playing: false });
        else useCheeseCutterStore.setState({ playing: false });
      });
      assertOneStepPerPattern(trace, positions);
      expect(resolverCalls.some((c) => c.rowsArePositions)).toBe(true);
    }, 60000);
  }
});

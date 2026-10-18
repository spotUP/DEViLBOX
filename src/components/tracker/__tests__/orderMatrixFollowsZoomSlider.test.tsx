/**
 * PATTERN-MATRIX-ZOOM (owner 2026-10-14): the Furnace order matrix (a format-mode
 * canvas) did not follow the zoom slider like the pattern grid; Fit made it look
 * right again. The worker draws at the scale it is told and divides the row height
 * it receives by that scale, so BOTH must follow the scale in use: a format-mode
 * canvas that keeps the old row height after the slider moves draws rows of the
 * wrong height. Reachability: the real FurnaceView mounts both canvases, the slider
 * value is set in the real UI store, and what each bridge is told is read back.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

type Msg = { type: string; scale?: number; uiState?: { rowHeight: number }; channelLayout?: { offsets: number[]; widths: number[] }; patterns?: unknown[]; bridge?: number };
const posted: Msg[] = [];
let bridgeCount = 0;
vi.mock('@engine/renderer/OffscreenBridge', () => ({
  TrackerOffscreenBridge: class { id = ++bridgeCount; constructor(_f: unknown, _o: unknown) {} post(m: Msg) { posted.push({ ...m, bridge: this.id }); } dispose() {} },
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
const maskCalls: number[] = [];
vi.mock('@/lib/tracker/visibleChannels', async (orig) => {
  const real = await orig<typeof import('@/lib/tracker/visibleChannels')>();
  return {
    ...real,
    visibleChannelMask: (...a: Parameters<typeof real.visibleChannelMask>) => {
      maskCalls.push(a[0].length);
      return real.visibleChannelMask(...a);
    },
  };
});

import '@stores';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const SONG = 'public/data/songs/furnace/misc/meaningful_connection_es5506.fur';

let frames: FrameRequestCallback[] = [];
let frameTime = 0;
function runFrames(count: number) {
  for (let k = 0; k < count; k++) {
    frameTime += 1000 / 60;
    const due = frames; frames = [];
    for (const f of due) f(frameTime);
  }
}

describe('the order matrix follows the zoom slider like the pattern grid', () => {
  beforeEach(() => {
    HTMLCanvasElement.prototype.transferControlToOffscreen = (() => ({})) as never;
    globalThis.ResizeObserver = class {
      cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) { this.cb = cb; }
      observe(el: Element) { this.cb([{ target: el, contentRect: { width: 1900, height: 700 } } as unknown as ResizeObserverEntry], this as never); }
      unobserve() {}
      disconnect() {}
    } as never;
    frames = []; frameTime = 0; posted.length = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      setTransform: () => {}, clearRect: () => {}, fillRect: () => {}, fillStyle: '',
    }) as never);
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('moving the slider re-tells every canvas the scale AND the row height at that scale', async () => {
    const { importTrackerModule } = await import('@/lib/song/songBranches');
    const bytes = readFileSync(resolve(ROOT, SONG));
    const file = new File([bytes], 'meaningful_connection_es5506.fur');
    await importTrackerModule({
      metadata: { title: 'mc', type: 'FUR', channels: -1, patterns: -1, orders: -1, instruments: -1, samples: -1, duration: 0 },
      arrayBuffer: await file.arrayBuffer(), file,
    } as never, { useLibopenmpt: false } as never);

    const { useSettingsStore } = await import('@stores/useSettingsStore');
    const { useUIStore } = await import('@stores/useUIStore');
    useSettingsStore.setState({ fitAllChannelsTracker: false });
    useUIStore.setState({ trackerZoom: 100 });

    const { FurnaceView } = await import('@components/furnace/FurnaceView');
    render(<div style={{ width: 1900, height: 900 }}><FurnaceView /></div>);
    await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
    act(() => runFrames(3));

    const gridBridge = posted.find((m) => m.type === 'init' && (m.patterns?.length ?? 0) > 1)?.bridge;
    expect(gridBridge).toBeDefined();
    const bridges = [...new Set(posted.map((m) => m.bridge!))];
    expect(bridges.length).toBeGreaterThan(1); // the grid and the order matrix

    posted.length = 0;
    act(() => { useUIStore.setState({ trackerZoom: 150 }); });
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    act(() => runFrames(3));

    for (const b of bridges) {
      const mine = posted.filter((m) => m.bridge === b);
      const lastLayout = mine.filter((m) => m.type === 'layout').pop();
      const scale = lastLayout?.scale;
      const rowHeight = lastLayout?.uiState?.rowHeight;
      expect(scale, `bridge ${b} scale`).toBe(1.5);
      expect(rowHeight, `bridge ${b} row height`).toBe(36);
    }
  }, 60000);
});

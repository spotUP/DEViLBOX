/**
 * CHANNELS-AS-NEEDED (owner 2026-10-14): the tracker showed all 32 channels of
 * a Furnace ES5506 song ('Meaningful Connection') while about nine hold notes,
 * and the scope strip showed another count. The columns shown must be the
 * channels that hold data in ANY pattern of the song, the same list in the
 * grid, the headers, the scopes and the fit scale; the song keeps all 32.
 *
 * Reachability (the one test of the wiring): the real corpus song is opened
 * through importTrackerModule, the Furnace view TrackerView mounts for it is
 * rendered, and what the render worker is told to draw (its channelLayout
 * message) and what the scope strip reads (the shared channelLayout) are
 * compared with a count made from the NATIVE song structure (the subsong's
 * per-channel pattern pools), not from the store patterns the mask reads.
 * Sentinel: visibleChannelMask ran from the canvas with the song's patterns.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

type Msg = { type: string; channelLayout?: { offsets: number[]; widths: number[] }; patterns?: unknown[]; bridge?: number };
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

describe('unused chip channels are hidden in the tracker', () => {
  beforeEach(() => {
    HTMLCanvasElement.prototype.transferControlToOffscreen = (() => ({})) as never;
    globalThis.ResizeObserver = class {
      cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) { this.cb = cb; }
      observe(el: Element) { this.cb([{ target: el, contentRect: { width: 1900, height: 700 } } as unknown as ResizeObserverEntry], this as never); }
      unobserve() {}
      disconnect() {}
    } as never;
    frames = []; frameTime = 0; posted.length = 0; maskCalls.length = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      setTransform: () => {}, clearRect: () => {}, fillRect: () => {}, fillStyle: '',
    }) as never);
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('Meaningful Connection: the columns are the channels with data in any pattern, the song keeps all 32', async () => {
    const { importTrackerModule } = await import('@/lib/song/songBranches');
    const bytes = readFileSync(resolve(ROOT, SONG));
    const file = new File([bytes], 'meaningful_connection_es5506.fur');
    await importTrackerModule({
      metadata: { title: 'mc', type: 'FUR', channels: -1, patterns: -1, orders: -1, instruments: -1, samples: -1, duration: 0 },
      arrayBuffer: await file.arrayBuffer(), file,
    } as never, { useLibopenmpt: false } as never);

    const { useFormatStore } = await import('@stores/useFormatStore');
    const { useTrackerStore } = await import('@stores/useTrackerStore');
    expect(useFormatStore.getState().editorMode).toBe('furnace');

    // Count from the native structure: a channel has data when any pattern in its pool has a non-empty row.
    const native = useFormatStore.getState().furnaceNative!;
    const sub = native.subsongs[native.activeSubsong];
    const withData = sub.channels.map((ch) =>
      [...ch.patterns.values()].some((p) => p.rows.some((r) => r.note !== -1 || r.ins !== -1 || r.vol !== -1 || r.effects.length > 0)));
    const expected = withData.filter(Boolean).length;
    expect(sub.channels.length).toBe(32);
    expect(expected).toBeGreaterThan(2);
    expect(expected).toBeLessThan(32);

    const { FurnaceView } = await import('@components/furnace/FurnaceView');
    render(<div style={{ width: 1900, height: 900 }}><FurnaceView /></div>);
    await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
    act(() => runFrames(3));

    // Two canvases mount: the pattern grid and the Furnace order matrix (format mode, one row per
    // position). The pattern grid is the bridge whose init carried the song's patterns (54), not one snapshot.
    const gridBridge = posted.find((m) => m.type === 'init' && (m.patterns?.length ?? 0) > 1)?.bridge;
    expect(gridBridge).toBeDefined();
    const layouts = posted.filter((m) => m.bridge === gridBridge).filter((m) => m.type === 'channelLayout' || m.channelLayout).map((m) => m.channelLayout!);
    const last = layouts[layouts.length - 1];
    const drawn = last.widths.map((w, i) => (w > 0 ? i : -1)).filter((i) => i >= 0);
    expect(drawn).toEqual(withData.map((h, i) => (h ? i : -1)).filter((i) => i >= 0));

    // The order matrix above the grid (one column per channel) shows the same channels: the owner
    // saw 32 order columns over a 16-channel grid (2026-10-14).
    const orderLayouts = posted.filter((m) => m.bridge !== gridBridge && m.channelLayout).map((m) => m.channelLayout!);
    expect(orderLayouts.length).toBeGreaterThan(0);
    const orderLast = orderLayouts[orderLayouts.length - 1];
    expect(orderLast.widths.length).toBe(32);
    const orderDrawn = orderLast.widths.map((w, i) => (w > 0 ? i : -1)).filter((i) => i >= 0);
    expect(orderDrawn).toEqual(drawn);

    // The scope strip reads the same list.
    const { channelLayout, scopeCells } = await import('@/components/tracker/channelLayout');
    const cells = scopeCells(32, 1900, channelLayout).filter((c) => c.w >= 2);
    expect(cells.length).toBe(expected);

    // Hidden is not deleted: the song and its export source keep all channels.
    expect(useTrackerStore.getState().patterns[0].channels.length).toBe(32);

    expect(maskCalls.length).toBeGreaterThan(0); // the mask ran from the canvas (sentinel)
  }, 60000);
});

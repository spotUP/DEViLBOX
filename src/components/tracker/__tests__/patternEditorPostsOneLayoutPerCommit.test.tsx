/**
 * ONE LAYOUT MESSAGE PER COMMIT: every change that shapes the pattern grid
 * (zoom, container size, column visibility) reaches the render worker as a
 * single `layout` message, never as separate uiState / channelLayout / scale /
 * resize posts, so the worker can tween one target instead of seeing a partial
 * one. The real PatternEditorCanvas, its messages to the worker captured.
 * The worker-side tween lives in trackerWorkerTweensLayout.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';

type Msg = {
  type: string; w?: number; h?: number; scale?: number; reducedMotion?: boolean;
  channelLayout?: { offsets: number[]; widths: number[] };
  uiState?: { rowHeight: number; columnVisibility?: { flag1?: boolean; flag2?: boolean; probability?: boolean } };
};
const posted: Msg[] = [];
vi.mock('@engine/renderer/OffscreenBridge', () => ({
  TrackerOffscreenBridge: class { constructor(_f: unknown, _o: unknown) {} post(m: Msg) { posted.push(m); } dispose() {} },
}));
vi.mock('@/engine/ToneEngine', () => ({ getToneEngine: () => new Proxy({}, { get: () => () => Promise.resolve() }) }));
vi.mock('@/engine/TrackerReplayer', () => ({
  getTrackerReplayer: () => new Proxy({}, { get: (_t, k) => (k === 'isPlaying' ? () => false : () => undefined) }),
  peekTrackerReplayer: () => null,
}));

import '@stores';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import { useUIStore } from '@stores/useUIStore';
import { useEditorStore } from '@stores';

const WIDTH = 1900;
const REMOVED_TYPES = ['uiState', 'channelLayout', 'scale', 'resize'];

let observerCallback: ResizeObserverCallback | null = null;
let observedTarget: Element | null = null;

function withChannels(n: number) {
  const base = useTrackerStore.getState().patterns[0];
  const channels = Array.from({ length: n }, (_, i) => ({ ...base.channels[i % base.channels.length], id: `ch${i}` }));
  useTrackerStore.setState({ patterns: [{ ...base, channels }], currentPatternIndex: 0 });
}

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

async function mount() {
  posted.length = 0;
  const view = render(<div style={{ width: WIDTH, height: 600 }}><PatternEditorCanvas /></div>);
  await settle();
  return view;
}

function lastLayoutMsg(): Msg {
  return posted.filter((m) => m.type === 'layout').pop()!;
}

function stubReducedMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    media: query,
    matches: reduce && query.includes('prefers-reduced-motion: reduce'),
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

describe('the pattern editor posts one layout message per commit', () => {
  const realMatchMedia = window.matchMedia;

  beforeEach(() => {
    HTMLCanvasElement.prototype.transferControlToOffscreen = (() => ({})) as never;
    observerCallback = null;
    observedTarget = null;
    globalThis.ResizeObserver = class {
      cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) { this.cb = cb; observerCallback = cb; }
      observe(el: Element) {
        observedTarget = el;
        this.cb([{ target: el, contentRect: { width: WIDTH, height: 600 } } as unknown as ResizeObserverEntry], this as never);
      }
      unobserve() {}
      disconnect() {}
    } as never;
    stubReducedMotion(false);
    // Fit off: the zoom slider alone decides the scale, so the expectations are exact.
    useSettingsStore.setState({ fitAllChannelsTracker: false });
    useUIStore.setState({ trackerZoom: 100, trackerScale: 1 });
    useEditorStore.setState((st) => ({ columnVisibility: { ...st.columnVisibility, flag1: false, flag2: false, probability: false } }));
    withChannels(4);
  });
  afterEach(() => {
    cleanup();
    window.matchMedia = realMatchMedia;
  });

  it('mount posts none of the removed message types', async () => {
    await mount();
    expect(posted.filter((m) => REMOVED_TYPES.includes(m.type))).toEqual([]);
  });

  it('a zoom change posts exactly one layout carrying row height, scale and channel layout', async () => {
    await mount();
    const before = posted.length;
    await act(async () => { useUIStore.setState({ trackerZoom: 150, trackerScale: 1.5 }); });
    await settle();
    const added = posted.slice(before);
    expect(added.map((m) => m.type)).toEqual(['layout']);
    expect(added[0].uiState!.rowHeight).toBe(36); // Math.round(24 * 1.5), PatternEditorCanvas snapshotUI
    expect(added[0].scale).toBe(useUIStore.getState().trackerScale);
    expect(added[0].channelLayout!.offsets).toHaveLength(4);
  });

  it('a container resize posts exactly one layout, and no second one follows', async () => {
    await mount();
    expect(observerCallback).not.toBeNull();
    const before = posted.length;
    await act(async () => {
      observerCallback!([{ target: observedTarget!, contentRect: { width: 1000, height: 600 } } as unknown as ResizeObserverEntry], {} as ResizeObserver);
    });
    const afterResize = posted.slice(before);
    expect(afterResize.map((m) => m.type)).toEqual(['layout']);
    expect(afterResize[0].w).toBe(1000);
    await settle();
    expect(posted.slice(before)).toHaveLength(1);
  });

  it('a column visibility change posts exactly one layout with the wider channels', async () => {
    // Enough channels to overflow the container: a few channels are stretched to
    // fill it, so their widths would not move when a column appears.
    withChannels(16);
    await mount();
    const widthBefore = lastLayoutMsg().channelLayout!.widths[0];
    const before = posted.length;
    await act(async () => {
      useEditorStore.setState((st) => ({ columnVisibility: { ...st.columnVisibility, flag1: true, flag2: false, probability: true } }));
    });
    const added = posted.slice(before);
    expect(added.map((m) => m.type)).toEqual(['layout']);
    expect(added[0].uiState!.columnVisibility!.flag1).toBe(true);
    expect(added[0].channelLayout!.widths[0]).toBeGreaterThan(widthBefore);
  });

  it('init carries the reduced-motion preference of the OS', async () => {
    await mount();
    expect(posted.find((m) => m.type === 'init')!.reducedMotion).toBe(false);
    cleanup();

    stubReducedMotion(true);
    await mount();
    expect(posted.find((m) => m.type === 'init')!.reducedMotion).toBe(true);
  });
});

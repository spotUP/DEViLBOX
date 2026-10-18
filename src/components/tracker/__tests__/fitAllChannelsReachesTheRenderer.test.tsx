/**
 * FIT-ALL-CHANNELS (owner 2026-10-14): a song with many channels scrolled
 * sideways in the tracker. The pattern view now shrinks its text so every
 * channel fits the width (Settings: "Fit all channels in the tracker", on by
 * default), only ever shrinking, and a manual zoom turns it off.
 *
 * The one wiring test: the real PatternEditorCanvas, its messages to the render
 * worker captured. The pure fit maths lives in fitChannelScale.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';

type Msg = {
  type: string; scale?: number;
  channelLayout?: { offsets: number[]; widths: number[] };
  uiState?: { rowHeight: number };
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
import { FIT_SCALE_FLOOR } from '../channelLayout';

const WIDTH = 1900; // narrower than 12 channels at full size, wider than they need at the font floor (10 px)
/** The container width jsdom reports; a test may narrow it. */
let width = WIDTH;

function withChannels(n: number) {
  const base = useTrackerStore.getState().patterns[0];
  const channels = Array.from({ length: n }, (_, i) => ({ ...base.channels[i % base.channels.length], id: `ch${i}` }));
  useTrackerStore.setState({ patterns: [{ ...base, channels }], currentPatternIndex: 0 });
}

/** The scale the worker was last told: init, then any 'layout' message. */
function workerScale(): number {
  let s = 1;
  for (const m of posted) {
    if (m.type === 'init' || m.type === 'layout') s = m.scale ?? 1;
  }
  return s;
}
/** The row height the worker was last told: in init, or a later layout message. */
function lastRowHeight(): number {
  return posted.filter((m) => (m.type === 'init' || m.type === 'layout') && m.uiState !== undefined).pop()!.uiState!.rowHeight;
}
function lastLayout() {
  const m = [...posted].reverse().find((x) => (x.type === 'init' || x.type === 'layout') && x.channelLayout !== undefined && x.channelLayout.widths.length > 0);
  return m!.channelLayout!;
}

async function mount() {
  posted.length = 0;
  const view = render(<div style={{ width, height: 600 }}><PatternEditorCanvas /></div>);
  await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
  return view;
}

describe('the tracker pattern view fits every channel to the width', () => {
  beforeEach(() => {
    HTMLCanvasElement.prototype.transferControlToOffscreen = (() => ({})) as never;
    // jsdom has no layout: report the canvas container at WIDTH x 600.
    globalThis.ResizeObserver = class {
      cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) { this.cb = cb; }
      observe(el: Element) { this.cb([{ target: el, contentRect: { width, height: 600 } } as unknown as ResizeObserverEntry], this as never); }
      unobserve() {}
      disconnect() {}
    } as never;
    width = WIDTH;
    useSettingsStore.setState({ fitAllChannelsTracker: true });
    useUIStore.setState({ trackerZoom: 100, trackerScale: 1, jingleActive: false });
  });
  afterEach(cleanup);

  it('12 channels shrink to fit; 4 keep their size; a manual zoom turns the fit off', async () => {
    withChannels(12);
    let view = await mount();
    const scale = workerScale();
    expect(scale).toBeLessThan(1);
    expect(scale).toBeGreaterThanOrEqual(FIT_SCALE_FLOOR);
    const layout = lastLayout();
    const end = layout.offsets[11] + layout.widths[11];
    expect(layout.offsets).toHaveLength(12);
    expect(end).toBeLessThanOrEqual(WIDTH); // every channel on screen, no sideways scroll
    expect(useUIStore.getState().trackerScale).toBe(scale); // rows shrink with it
    expect(lastRowHeight()).toBe(Math.round(24 * scale));
    view.unmount(); cleanup();

    withChannels(4);
    view = await mount();
    expect(workerScale()).toBe(1); // channels fit: keep the size, never enlarge
    view.unmount(); cleanup();

    withChannels(12);
    act(() => { useUIStore.getState().setTrackerZoom(110); });
    expect(useSettingsStore.getState().fitAllChannelsTracker).toBe(false);
    view = await mount();
    // Fit off: the pattern is drawn at the zoom (fonts, columns and rows), not just taller rows.
    expect(workerScale()).toBe(1.1);
    expect(useUIStore.getState().trackerScale).toBe(1.1);
    expect(lastRowHeight()).toBe(Math.round(24 * 1.1));
    expect(lastLayout().offsets[11] + lastLayout().widths[11]).toBeGreaterThan(WIDTH); // scrolls as before
    view.unmount(); cleanup();

    // Zoomed out by hand below the fit floor: the slider's range goes lower than the fit does.
    act(() => { useUIStore.getState().setTrackerZoom(50); });
    view = await mount();
    expect(workerScale()).toBe(0.5);
  });

  // Owner 2026-10-18: "it is not scaled to fit i see 6,5 channels during the jingle".
  // The jingle's lips are too wide for the 10 px floor in a laptop-sized editor; the jingle has no floor.
  it('the startup jingle fits all 10 lips below the font floor; a song at that width scrolls', async () => {
    width = 850; // 10 channels do not fit here even at the 10 px floor
    withChannels(10);
    let view = await mount();
    expect(workerScale()).toBe(FIT_SCALE_FLOOR);
    expect(lastLayout().offsets[9] + lastLayout().widths[9]).toBeGreaterThan(width);
    view.unmount(); cleanup();

    act(() => { useUIStore.getState().setJingleActive(true); });
    view = await mount();
    expect(workerScale()).toBeLessThan(FIT_SCALE_FLOOR);
    const layout = lastLayout();
    expect(layout.offsets).toHaveLength(10);
    expect(layout.offsets[9] + layout.widths[9]).toBeLessThanOrEqual(width); // every lip on screen
    view.unmount(); cleanup();
    act(() => { useUIStore.getState().setJingleActive(false); });
  });
});

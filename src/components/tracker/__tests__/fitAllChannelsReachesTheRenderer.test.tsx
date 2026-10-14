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

const WIDTH = 1900; // narrower than 16 channels at full size, wider than they need at the font floor

function withChannels(n: number) {
  const base = useTrackerStore.getState().patterns[0];
  const channels = Array.from({ length: n }, (_, i) => ({ ...base.channels[i % base.channels.length], id: `ch${i}` }));
  useTrackerStore.setState({ patterns: [{ ...base, channels }], currentPatternIndex: 0 });
}

/** The scale the worker was last told: init, then any 'scale' message. */
function workerScale(): number {
  let s = 1;
  for (const m of posted) {
    if (m.type === 'init' || m.type === 'scale') s = m.scale ?? 1;
  }
  return s;
}
function lastLayout() {
  const m = [...posted].reverse().find((x) => x.channelLayout !== undefined && x.channelLayout.widths.length > 0);
  return m!.channelLayout!;
}

async function mount() {
  posted.length = 0;
  const view = render(<div style={{ width: WIDTH, height: 600 }}><PatternEditorCanvas /></div>);
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
      observe(el: Element) { this.cb([{ target: el, contentRect: { width: WIDTH, height: 600 } } as unknown as ResizeObserverEntry], this as never); }
      unobserve() {}
      disconnect() {}
    } as never;
    useSettingsStore.setState({ fitAllChannelsTracker: true });
    useUIStore.setState({ trackerZoom: 100, trackerFitScale: 1 });
  });
  afterEach(cleanup);

  it('16 channels shrink to fit; 4 keep their size; a manual zoom turns the fit off', async () => {
    withChannels(16);
    let view = await mount();
    const scale = workerScale();
    expect(scale).toBeLessThan(1);
    expect(scale).toBeGreaterThanOrEqual(FIT_SCALE_FLOOR);
    const layout = lastLayout();
    const end = layout.offsets[15] + layout.widths[15];
    expect(layout.offsets).toHaveLength(16);
    expect(end).toBeLessThanOrEqual(WIDTH); // every channel on screen, no sideways scroll
    expect(useUIStore.getState().trackerFitScale).toBe(scale); // rows shrink with it
    expect(posted.filter((m) => m.type === 'uiState').pop()!.uiState!.rowHeight).toBe(Math.round(24 * scale));
    view.unmount(); cleanup();

    withChannels(4);
    view = await mount();
    expect(workerScale()).toBe(1); // channels fit: keep the size, never enlarge
    view.unmount(); cleanup();

    withChannels(16);
    act(() => { useUIStore.getState().setTrackerZoom(110); });
    expect(useSettingsStore.getState().fitAllChannelsTracker).toBe(false);
    view = await mount();
    expect(workerScale()).toBe(1);
    expect(lastLayout().offsets[15] + lastLayout().widths[15]).toBeGreaterThan(WIDTH); // scrolls as before
  });
});

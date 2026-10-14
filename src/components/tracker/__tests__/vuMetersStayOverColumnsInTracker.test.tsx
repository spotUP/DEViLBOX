/**
 * VU-FOLLOWS-FIT-SCALE, tracker side (owner re-test 2026-10-14: "meters sit
 * offset to the right when the pattern font is scaled"). The deck view had a
 * test; the tracker's wiring was untested. This drives the real
 * PatternEditorCanvas at a fitted scale below 1 and compares where the meters
 * are drawn on screen (overlay left + canvas x) with the columns the render
 * worker is told to draw (its layout message): every meter centre must be
 * within 1 px of a column centre. Pure geometry lives in channelLayout.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';

type Msg = { type: string; scale?: number; channelLayout?: { offsets: number[]; widths: number[] } };
const posted: Msg[] = [];
vi.mock('@engine/renderer/OffscreenBridge', () => ({
  TrackerOffscreenBridge: class { constructor(_f: unknown, _o: unknown) {} post(m: Msg) { posted.push(m); } dispose() {} },
}));
// Every channel has just been triggered at full level, and again each frame.
let generation = 1;
vi.mock('@/engine/ToneEngine', () => ({
  getToneEngine: () => ({
    getChannelLevels: (n: number) => new Array(n).fill(0),
    getEngineChannelLevels: () => null,
    getChannelTriggerLevels: (n: number) => new Array(n).fill(0.8),
    getChannelTriggerGenerations: (n: number) => new Array(n).fill(generation),
  }),
}));
vi.mock('@/engine/TrackerReplayer', () => ({
  getTrackerReplayer: () => new Proxy({}, { get: (_t, k) => (k === 'isPlaying' ? () => false : () => undefined) }),
  peekTrackerReplayer: () => null,
}));

import '@stores';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import { useUIStore } from '@stores/useUIStore';
import { _setSoundingForTest } from '@/engine/audio/signalPresence';

const WIDTH = 1900;

function withChannels(n: number) {
  const base = useTrackerStore.getState().patterns[0];
  const channels = Array.from({ length: n }, (_, i) => ({ ...base.channels[i % base.channels.length], id: `ch${i}` }));
  useTrackerStore.setState({ patterns: [{ ...base, channels }], currentPatternIndex: 0 });
}

let frames: FrameRequestCallback[] = [];
let frameTime = 0;
function runFrames(count: number) {
  for (let k = 0; k < count; k++) {
    frameTime += 1000 / 60;
    generation++;
    const due = frames; frames = [];
    for (const f of due) f(frameTime);
  }
}

interface Fill { canvas: HTMLCanvasElement; x: number; w: number }
const fills: Fill[] = [];

describe('tracker channel VU meters at a fitted pattern scale', () => {
  beforeEach(() => {
    HTMLCanvasElement.prototype.transferControlToOffscreen = (() => ({})) as never;
    globalThis.ResizeObserver = class {
      cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) { this.cb = cb; }
      observe(el: Element) { this.cb([{ target: el, contentRect: { width: WIDTH, height: 600 } } as unknown as ResizeObserverEntry], this as never); }
      unobserve() {}
      disconnect() {}
    } as never;
    useSettingsStore.setState({ fitAllChannelsTracker: true, vuMeterSwing: false, vuMeterStyle: 'segments', vuMeterMirror: false });
    useUIStore.setState({ trackerZoom: 100, trackerScale: 1 });
    frames = []; frameTime = 0; generation = 1; fills.length = 0; posted.length = 0;
    _setSoundingForTest(true);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      return {
        setTransform: () => {}, clearRect: () => {}, fillStyle: '',
        fillRect: (x: number, _y: number, w: number) => { fills.push({ canvas: this, x, w }); },
      } as never;
    });
  });
  afterEach(() => {
    cleanup();
    _setSoundingForTest(false);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('every meter is centred on its pattern column (within 1 px) when 12 channels are fitted below scale 1', async () => {
    withChannels(12);
    const view = render(<div style={{ width: WIDTH, height: 600 }}><PatternEditorCanvas /></div>);
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    act(() => runFrames(3));

    const scale = useUIStore.getState().trackerScale;
    expect(scale).toBeLessThan(1); // the case under test: fitted, not full size
    const layout = [...posted].reverse().find((m) => m.channelLayout && m.channelLayout.widths.length > 0)!.channelLayout!;
    expect(layout.offsets).toHaveLength(12);

    const vu = view.container.querySelector('canvas.vu-meters-canvas') as HTMLCanvasElement;
    expect(vu).not.toBeNull();
    const overlayLeft = parseFloat(vu.parentElement!.style.left); // the overlay's left edge inside the pattern container
    const meters = fills.filter((f) => f.canvas === vu);
    expect(meters.length).toBeGreaterThan(0); // the meters ran (sentinel)

    const columnCentres =layout.offsets.map((o, i) => o + layout.widths[i] / 2);
    const covered = new Set<number>();
    for (const m of meters) {
      const centre = overlayLeft + m.x + m.w / 2;
      const nearest = columnCentres.reduce((best, c, i) => (Math.abs(c - centre) < Math.abs(columnCentres[best] - centre) ? i : best), 0);
      expect(Math.abs(centre - columnCentres[nearest])).toBeLessThanOrEqual(1);
      covered.add(nearest);
    }
    expect(covered.size).toBe(12); // one meter per column, none lost
  });
});

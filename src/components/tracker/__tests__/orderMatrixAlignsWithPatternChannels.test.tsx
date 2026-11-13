/**
 * Owner 2026-11-13: "it's a bit hard to see which channel i edit the matrix and the channels are not equally
 * wide, make the matrix channels always the same width as the pattern channels."
 *
 * The real PatternEditorCanvas (main editor) next to the shared SongOrderMatrix, each render-worker bridge's
 * messages captured: the matrix must post the main editor's channel offsets, widths and scale, and follow its
 * horizontal scroll.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';

type Msg = { type: string; scale?: number; x?: number; channelLayout?: { offsets: number[]; widths: number[] } };
const bridges: Msg[][] = [];
vi.mock('@engine/renderer/OffscreenBridge', () => ({
  TrackerOffscreenBridge: class {
    log: Msg[] = [];
    constructor(_f: unknown, _o: unknown) { bridges.push(this.log); }
    post(m: Msg) { this.log.push(m); }
    dispose() {}
  },
}));
vi.mock('@/engine/ToneEngine', () => ({ getToneEngine: () => new Proxy({}, { get: () => () => Promise.resolve() }) }));
vi.mock('@/engine/TrackerReplayer', () => ({
  getTrackerReplayer: () => new Proxy({}, { get: (_t, k) => (k === 'isPlaying' ? () => false : () => undefined) }),
  peekTrackerReplayer: () => null,
}));

import '@stores';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import { SongOrderMatrix } from '@/components/shared/SongOrderMatrix';
import { channelLayout, notifyChannelLayout } from '@/components/tracker/channelLayout';
import type { ColumnDef, FormatChannel } from '@/components/shared/format-editor-types';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import { useUIStore } from '@stores/useUIStore';

const N = 12;
const WIDTH = 1900;
let viewWidth = WIDTH;

const COLS: ColumnDef[] = [{
  key: 'pat', label: 'Pat', charWidth: 2, color: '#fff', emptyColor: '#888', emptyValue: undefined, type: 'hex',
  hexDigits: 2, formatter: (v) => v.toString(16).padStart(2, '0'),
}];
const matrixChannels: FormatChannel[] = Array.from({ length: N }, (_, i) => ({
  label: `${i + 1}`, patternLength: 4, rows: [{ pat: 0 }, { pat: 1 }, { pat: 2 }, { pat: 3 }],
}));

function lastLayout(log: Msg[]) {
  return [...log].reverse().find((m) => (m.type === 'init' || m.type === 'layout') && (m.channelLayout?.widths.length ?? 0) > 0)!;
}

describe('the song order matrix lines up with the pattern channels', () => {
  beforeEach(() => {
    HTMLCanvasElement.prototype.transferControlToOffscreen = (() => ({})) as never;
    globalThis.ResizeObserver = class {
      cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) { this.cb = cb; }
      observe(el: Element) { this.cb([{ target: el, contentRect: { width: viewWidth, height: 400 } } as unknown as ResizeObserverEntry], this as never); }
      unobserve() {}
      disconnect() {}
    } as never;
    useSettingsStore.setState({ fitAllChannelsTracker: true });
    useUIStore.setState({ trackerZoom: 100, trackerScale: 1, jingleActive: false });
    const base = useTrackerStore.getState().patterns[0];
    const channels = Array.from({ length: N }, (_, i) => ({ ...base.channels[i % base.channels.length], id: `ch${i}` }));
    useTrackerStore.setState({ patterns: [{ ...base, channels }], currentPatternIndex: 0 });
    bridges.length = 0;
    viewWidth = WIDTH;
  });
  afterEach(cleanup);

  const mount = (w: number) => render(
    <div>
      <div style={{ width: w, height: 200 }}>
        <SongOrderMatrix label="ORDERS" width={w} height={200} formatColumns={COLS} formatChannels={matrixChannels} />
      </div>
      <div style={{ width: w, height: 400 }}><PatternEditorCanvas /></div>
    </div>,
  );
  const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 80)); });

  it('uses the main editor offsets, widths and scale', async () => {
    mount(WIDTH);
    await settle();
    expect(bridges).toHaveLength(2);
    const [matrixLog, mainLog] = bridges;
    const main = lastLayout(mainLog);
    const matrix = lastLayout(matrixLog);
    expect(main.channelLayout!.widths).toHaveLength(N);
    expect(matrix.channelLayout!.widths).toEqual(main.channelLayout!.widths);
    expect(matrix.channelLayout!.offsets).toEqual(main.channelLayout!.offsets);
    expect(matrix.scale).toBe(main.scale);
    // The sub-editor no longer overwrites the scale the main editor published.
    expect(useUIStore.getState().trackerScale).toBe(main.scale);
  });

  it('scrolls sideways with the main editor when the channels overflow', async () => {
    useSettingsStore.setState({ fitAllChannelsTracker: false });
    viewWidth = 600;
    mount(viewWidth);
    await settle();
    const [matrixLog] = bridges;
    act(() => { channelLayout.scrollLeft = 120; notifyChannelLayout(); });
    await settle();
    expect(matrixLog.filter((m) => m.type === 'scroll').pop()?.x).toBe(120);
  });
});

/**
 * SONG-LOAD COVER: the pattern editor tells the render worker when the song-load
 * panel covers it (useSongLoadStore.depth above 0) so the worker holds the
 * channel-count fade. One post on mount, then one per crossing of 0, none for
 * depth changes that stay above 0. The real PatternEditorCanvas, messages captured.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';

type Msg = { type: string; covered?: boolean };
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
import { useSongLoadStore } from '@stores/useSongLoadStore';

const covers = () => posted.filter((m) => m.type === 'cover').map((m) => m.covered);
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });
const setDepth = (depth: number) => act(async () => { useSongLoadStore.setState({ depth }); });

describe('the pattern editor tells the worker when the song-load panel covers it', () => {
  beforeEach(async () => {
    HTMLCanvasElement.prototype.transferControlToOffscreen = (() => ({})) as never;
    globalThis.ResizeObserver = class {
      cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) { this.cb = cb; }
      observe(el: Element) { this.cb([{ target: el, contentRect: { width: 1900, height: 600 } } as unknown as ResizeObserverEntry], this as never); }
      unobserve() {}
      disconnect() {}
    } as never;
    useSongLoadStore.setState({ depth: 0 });
    posted.length = 0;
    render(<div style={{ width: 1900, height: 600 }}><PatternEditorCanvas /></div>);
    await settle();
  });
  afterEach(() => { cleanup(); useSongLoadStore.setState({ depth: 0 }); });

  it('posts uncovered once on mount, true on 0 to 1, nothing on 1 to 2, false on return to 0', async () => {
    expect(covers()).toEqual([false]);
    await setDepth(1);
    expect(covers()).toEqual([false, true]);
    await setDepth(2);
    expect(covers()).toEqual([false, true]);
    await setDepth(1);
    expect(covers()).toEqual([false, true]);
    await setDepth(0);
    expect(covers()).toEqual([false, true, false]);
  });
});

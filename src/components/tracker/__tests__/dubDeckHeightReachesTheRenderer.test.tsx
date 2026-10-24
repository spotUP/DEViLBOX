/**
 * DUB DECK PUSHES THE EDITOR: the open dub deck's height reaches the render
 * worker as `referenceH` (grid height + deck height) in the layout message, so
 * the worker keeps the edit row where it sat with the deck closed (editRowTop).
 * The real PatternEditorCanvas, its messages to the worker captured. The
 * position rule itself is tested in lib/tracker/__tests__/editRowAnchor.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';

type Msg = { type: string; w?: number; h?: number; referenceH?: number; referenceHeight?: number };
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
import { useUIStore } from '@stores/useUIStore';

const GRID_HEIGHT = 600;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });
const lastLayout = (): Msg => posted.filter((m) => m.type === 'layout').pop()!;

describe('the dub deck height reaches the renderer', () => {
  beforeEach(() => {
    HTMLCanvasElement.prototype.transferControlToOffscreen = (() => ({})) as never;
    globalThis.ResizeObserver = class {
      cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) { this.cb = cb; }
      observe(el: Element) {
        this.cb([{ target: el, contentRect: { width: 1900, height: GRID_HEIGHT } } as unknown as ResizeObserverEntry], this as never);
      }
      unobserve() {}
      disconnect() {}
    } as never;
    useUIStore.setState({ dubDeckHeight: 0 });
    posted.length = 0;
  });
  afterEach(() => {
    cleanup();
    useUIStore.setState({ dubDeckHeight: 0 });
  });

  it('posts grid height + deck height as the reference height, and re-posts when the deck resizes', async () => {
    render(<div style={{ width: 1900, height: GRID_HEIGHT }}><PatternEditorCanvas /></div>);
    await settle();
    expect(lastLayout().h).toBe(GRID_HEIGHT);
    expect(lastLayout().referenceH).toBe(GRID_HEIGHT);

    await act(async () => { useUIStore.getState().setDubDeckHeight(250); });
    await settle();
    expect(lastLayout().h).toBe(GRID_HEIGHT);
    expect(lastLayout().referenceH).toBe(GRID_HEIGHT + 250);

    await act(async () => { useUIStore.getState().setDubDeckHeight(0); });
    await settle();
    expect(lastLayout().referenceH).toBe(GRID_HEIGHT);
  });
});

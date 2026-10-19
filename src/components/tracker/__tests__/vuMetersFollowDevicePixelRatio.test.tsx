/**
 * Owner 2026-10-20: the tracker's channel meters sat "offset to the right" and
 * did not "scale as the patterns". The meter canvas sized its backing store
 * with the devicePixelRatio read once at mount, while the draw loop and the
 * pattern canvas read the current one: after a browser zoom (or a move to a
 * display with another ratio) every meter was drawn scaled and shifted right.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';

vi.mock('@/engine/ToneEngine', () => ({ getToneEngine: () => new Proxy({}, { get: () => () => [] }) }));

import { ChannelVUMeters } from '@/components/tracker/ChannelVUMeters';

let observed: { cb: ResizeObserverCallback; el: Element } | null = null;
function resizeTo(width: number, height: number) {
  const { cb, el } = observed!;
  act(() => { cb([{ target: el, contentRect: { width, height } } as unknown as ResizeObserverEntry], {} as ResizeObserver); });
}

describe('tracker channel VU meter canvas', () => {
  beforeEach(() => {
    observed = null;
    globalThis.ResizeObserver = class {
      cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) { this.cb = cb; }
      observe(el: Element) { observed = { cb: this.cb, el }; }
      unobserve() {}
      disconnect() {}
    } as never;
    vi.stubGlobal('devicePixelRatio', 2);
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('sizes its backing store with the device pixel ratio in force at each resize', () => {
    const { container } = render(<div style={{ width: 600, height: 400 }}><ChannelVUMeters channelOffsets={[40]} channelWidths={[200]} /></div>);
    const canvas = container.querySelector('canvas')!;
    resizeTo(600, 400);
    expect([canvas.width, canvas.height]).toEqual([1200, 800]);

    vi.stubGlobal('devicePixelRatio', 2.2); // browser zoom to 110%
    resizeTo(545, 364);
    expect([canvas.width, canvas.height]).toEqual([Math.round(545 * 2.2), Math.round(364 * 2.2)]);
  });
});

/**
 * The tracker pattern view picked its row from the replayer's display ring at
 * Tone.now() + 10 ms - ahead of the sound, so the play head led the audio. It
 * must ask for the row the listener hears: the context's currentTime minus the
 * output latency (heardContextTime). Mounts the real PatternEditorCanvas
 * (main-thread path) while playing and records the time it asks the ring for.
 * This file is the sibling for the main-thread Canvas2D loop, used when the
 * OffscreenCanvas worker is unavailable (iOS, no WebGL2).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';

const LATENCY = 0.0333;
const CTX_TIME = 12.5;
const probe = vi.hoisted(() => ({ times: [] as number[] }));

vi.mock('tone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('tone')>()),
  now: () => 99, // Tone.now() = currentTime + lookAhead; must NOT be what the view reads
  getContext: () => ({ rawContext: { currentTime: 12.5, outputLatency: 0.0333, baseLatency: 0.005 } }),
}));
vi.mock('@engine/renderer/TrackerCanvas2DRenderer', () => ({
  TrackerCanvas2DRenderer: class {
    constructor() {
      return new Proxy(this, { get: (_t, k) => (k === 'then' ? undefined : () => undefined) });
    }
  },
}));
vi.mock('@engine/renderer/OffscreenBridge', () => ({
  TrackerOffscreenBridge: class { constructor(_f: unknown, _o: unknown) {} post() {} dispose() {} },
}));
vi.mock('@/engine/ToneEngine', () => ({ getToneEngine: () => new Proxy({}, { get: () => () => Promise.resolve() }) }));
vi.mock('@/engine/TrackerReplayer', () => ({
  getTrackerReplayer: () => new Proxy({}, {
    get: (_t, k) => (k === 'getStateAtTime'
      ? (t: number) => { probe.times.push(t); return null; }
      : k === 'isPlaying' ? () => true : () => undefined),
  }),
  peekTrackerReplayer: () => null,
}));

import '@stores';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import { useTransportStore } from '@stores/useTransportStore';
import { useEditorStore } from '@stores/useEditorStore';

describe('tracker pattern view reads the heard row (main-thread loop)', () => {
  beforeEach(() => {
    probe.times.length = 0;
    // No OffscreenCanvas transfer: the component takes its non-WebGL branch
    // (setWebglUnsupported) and runs the Canvas2D loop on the main thread.
    delete (HTMLCanvasElement.prototype as unknown as Record<string, unknown>).transferControlToOffscreen;
    globalThis.ResizeObserver = class {
      cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) { this.cb = cb; }
      observe(el: Element) { this.cb([{ target: el, contentRect: { width: 1200, height: 600 } } as unknown as ResizeObserverEntry], this as never); }
      unobserve() {}
      disconnect() {}
    } as never;
    useTransportStore.setState({ isPlaying: true, currentRow: 0 } as never);
    useEditorStore.setState({ followPlayback: true } as never);
  });
  afterEach(() => { cleanup(); useTransportStore.setState({ isPlaying: false } as never); });

  it('asks the display ring for currentTime minus output latency, not Tone.now() + 10 ms', async () => {
    render(<div style={{ width: 1200, height: 600 }}><PatternEditorCanvas /></div>);
    await act(async () => { await new Promise((r) => setTimeout(r, 120)); });
    expect(probe.times.length).toBeGreaterThan(0); // sentinel: the loop ran and reached the ring
    for (const t of probe.times) expect(t).toBeCloseTo(CTX_TIME - LATENCY, 9);
  });
});

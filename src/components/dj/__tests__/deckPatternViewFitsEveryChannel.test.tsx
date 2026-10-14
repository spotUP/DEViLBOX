/**
 * FIT-ALL-CHANNELS (owner 2026-10-14), DJ deck pattern views: a deck showing a
 * song with more channels than fit its width used to clip the right-hand
 * channels. The view now draws the pattern at a smaller scale so every channel
 * fits (Settings: "Fit all channels on the decks"), never enlarging.
 *
 * The real ReadOnlyPatternCanvas (DeckPatternDisplay's pattern canvas), its
 * messages to the render worker captured; the width comes from a stubbed
 * ResizeObserver. The fit maths is tested in tracker/__tests__/fitChannelScale.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Msg = { type: string; width?: number; w?: number; dpr?: number; layout?: { offsets: number[]; widths: number[] } };
const posted: Msg[] = [];
vi.mock('@engine/renderer/OffscreenBridge', () => ({
  OffscreenBridge: class { constructor(_f: unknown, _o: unknown) {} post(m: Msg) { posted.push(m); } dispose() {} },
}));
vi.mock('@/workers/readonly-pattern.worker.ts?worker', () => ({ default: class {} }));

import { render, cleanup, act } from '@testing-library/react';
import type { Pattern } from '@/types';
import { ReadOnlyPatternCanvas } from '@/components/tracker/ReadOnlyPatternCanvas';
import { useSettingsStore } from '@/stores/useSettingsStore';

const WIDTH = 900;

function pattern(nc: number): Pattern {
  return { id: 'p', length: 16, channels: Array.from({ length: nc }, (_, c) => ({ id: `c${c}`, rows: [] })) } as unknown as Pattern;
}

async function mount(nc: number) {
  posted.length = 0;
  const view = render(<div style={{ width: WIDTH, height: 300 }}><ReadOnlyPatternCanvas pattern={pattern(nc)} currentRow={0} numChannels={nc} /></div>);
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  return view;
}

/** What the worker was told, reduced to the scale it draws at (its canvas is WIDTH / scale wide). */
function workerView() {
  const resize = [...posted].reverse().find((m) => m.type === 'resize')!;
  const layout = [...posted].reverse().find((m) => m.layout && m.layout.widths.length > 0)!.layout!;
  const scale = WIDTH / resize.w!;
  const last = layout.offsets.length - 1;
  return { scale, end: layout.offsets[last] + layout.widths[last], canvasWidth: resize.w! };
}

describe('a deck pattern view fits every channel to its width', () => {
  beforeEach(() => {
    HTMLCanvasElement.prototype.transferControlToOffscreen = (() => ({})) as never;
    globalThis.ResizeObserver = class {
      cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) { this.cb = cb; }
      observe(el: Element) { this.cb([{ target: el, contentRect: { width: WIDTH, height: 300 } } as unknown as ResizeObserverEntry], this as never); }
      unobserve() {}
      disconnect() {}
    } as never;
    useSettingsStore.setState({ fitAllChannelsDeck: true, deckPatternZoom: 100 });
  });
  afterEach(cleanup);

  it('6 channels shrink to fit, 4 keep their size, and the setting off clips as before', async () => {
    let view = await mount(6);
    let v = workerView();
    expect(v.scale).toBeLessThan(1);
    expect(v.end).toBeLessThanOrEqual(v.canvasWidth); // the worker's last channel ends inside its canvas
    view.unmount(); cleanup();

    view = await mount(4);
    v = workerView();
    expect(v.scale).toBe(1);
    view.unmount(); cleanup();

    useSettingsStore.setState({ fitAllChannelsDeck: false });
    view = await mount(6);
    v = workerView();
    expect(v.scale).toBe(1);
    expect(v.end).toBeGreaterThan(v.canvasWidth);
    view.unmount(); cleanup();

    // Fit off: the deck zoom slider's scale draws the pattern (and is reported to the slider).
    useSettingsStore.setState({ fitAllChannelsDeck: false, deckPatternZoom: 150 });
    const reported: number[] = [];
    posted.length = 0;
    view = render(<div style={{ width: WIDTH, height: 300 }}><ReadOnlyPatternCanvas pattern={pattern(4)} currentRow={0} numChannels={4} onScale={(sc) => reported.push(sc)} /></div>);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(workerView().scale).toBeCloseTo(1.5, 6);
    expect(reported.at(-1)).toBe(1.5);
  });
});

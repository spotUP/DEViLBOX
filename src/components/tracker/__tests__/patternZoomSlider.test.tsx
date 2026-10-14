/**
 * PATTERN-ZOOM-SLIDER (owner 2026-10-14): fit-all made the fonts too small, so
 * the pattern editor gets a zoom slider with a Fit control beside it.
 *
 * Rules pinned here, on the real bar the tracker mounts:
 *  - the slider shows the scale in use: the fit result while fit is on;
 *  - moving the slider hands the size to the user: fit goes off and the zoom
 *    becomes exactly what the slider showed;
 *  - Fit turns fit back on;
 *  - a persisted v1 zoom (row height only) starts again at 100.
 * That the zoom reaches the worker (fonts, columns, rows) is the reachability
 * test in fitAllChannelsReachesTheRenderer.test.tsx.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import '@stores';
import { PatternBottomBar } from '../PatternBottomBar';
import { useUIStore } from '@stores/useUIStore';
import { useSettingsStore } from '@stores/useSettingsStore';

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value() {} });
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', { configurable: true, value() {} });
  // happy-dom has no layout: a 72 px track.
  HTMLElement.prototype.getBoundingClientRect = function () {
    return { width: 72, height: 14, left: 0, top: 0, right: 72, bottom: 14, x: 0, y: 0, toJSON() {} } as DOMRect;
  };
  useSettingsStore.setState({ fitAllChannelsTracker: true });
  useUIStore.setState({ trackerZoom: 100, trackerScale: 0.8 });
});
afterEach(cleanup);

const track = (c: HTMLElement) => c.querySelector('.cursor-ew-resize') as HTMLElement;
const readout = (c: HTMLElement) => c.textContent ?? '';

describe('the pattern zoom slider', () => {
  it('shows the fit result while fit is on, and moving it turns fit off at that size', () => {
    const { container } = render(<PatternBottomBar />);
    expect(readout(container)).toContain('80%');

    fireEvent.pointerDown(track(container), { pointerId: 1, clientX: 20 });
    fireEvent.pointerMove(track(container), { pointerId: 1, clientX: 20 + 10 });
    fireEvent.pointerUp(track(container), { pointerId: 1, clientX: 30 });

    expect(useSettingsStore.getState().fitAllChannelsTracker).toBe(false);
    const zoom = useUIStore.getState().trackerZoom;
    expect(zoom).toBeGreaterThan(80); // a rightward drag from the shown 80% zooms in
    expect(zoom).toBeLessThanOrEqual(200);
  });

  it('a leftward drag zooms out, never below 50', () => {
    useUIStore.setState({ trackerScale: 0.55 });
    const { container } = render(<PatternBottomBar />);
    fireEvent.pointerDown(track(container), { pointerId: 1, clientX: 40 });
    fireEvent.pointerMove(track(container), { pointerId: 1, clientX: -400 });
    fireEvent.pointerUp(track(container), { pointerId: 1, clientX: -400 });
    expect(useUIStore.getState().trackerZoom).toBe(50);
  });

  it('Fit turns fit all channels back on', () => {
    useSettingsStore.setState({ fitAllChannelsTracker: false });
    useUIStore.setState({ trackerZoom: 130, trackerScale: 1.3 });
    const { getByText } = render(<PatternBottomBar />);
    act(() => { fireEvent.click(getByText('Fit')); });
    expect(useSettingsStore.getState().fitAllChannelsTracker).toBe(true);
  });

  it('the zoom is clamped to the slider range', () => {
    useUIStore.getState().setTrackerZoom(900);
    expect(useUIStore.getState().trackerZoom).toBe(200);
    useUIStore.getState().setTrackerZoom(3);
    expect(useUIStore.getState().trackerZoom).toBe(50);
  });

  it('a v1 persisted zoom (row height only) starts again at 100', async () => {
    const opts = (useUIStore as unknown as { persist: { getOptions: () => { migrate: (s: unknown, v: number) => Record<string, unknown> } } }).persist.getOptions();
    expect(opts.migrate({ trackerZoom: 150, showPatterns: true }, 1)).toEqual({ trackerZoom: 100, showPatterns: true });
    expect(opts.migrate({ trackerZoom: 150 }, 2)).toEqual({ trackerZoom: 150 });
  });
});

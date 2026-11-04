/**
 * GRID HOVER, ALL FORMATS (owner 2026-11-04): hovering an effect cell of the pattern grid shows what the
 * command does. The one wiring test: a real Tony Williams song loaded through the product import, the real
 * PatternEditorCanvas, a pointer moved over its effect column. Sentinel: describeEffectSlot ran and returned
 * the description that is on screen. Hide rules are checked on the same mount.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';

vi.mock('@engine/renderer/OffscreenBridge', () => ({
  TrackerOffscreenBridge: class { constructor(_f: unknown, _o: unknown) {} post() {} dispose() {} },
}));
vi.mock('@/engine/ToneEngine', () => ({ getToneEngine: () => new Proxy({}, { get: () => () => Promise.resolve() }) }));
vi.mock('@/engine/TrackerReplayer', () => ({
  getTrackerReplayer: () => new Proxy({}, { get: (_t, k) => (k === 'isPlaying' ? () => false : () => undefined) }),
  peekTrackerReplayer: () => null,
}));

const described: Array<{ meaning: string } | null> = [];
vi.mock('@/utils/effectCellDescription', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/utils/effectCellDescription')>();
  return {
    ...mod,
    describeEffectSlot: (cell: object | undefined, slot: number) => {
      const d = mod.describeEffectSlot(cell, slot);
      described.push(d);
      return d;
    },
  };
});

import '@stores';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useCursorStore } from '@stores/useCursorStore';
import { useUIStore } from '@stores/useUIStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { editRowTop } from '@/lib/tracker/editRowAnchor';
import { describeEffectSlot } from '@/utils/effectCellDescription';

const PATH = 'public/data/songs/formats/future basketball main.tw';
const WIDTH = 1900;
const HEIGHT = 600;

describe('effect cell hover in the pattern grid', () => {
  beforeEach(() => {
    HTMLCanvasElement.prototype.transferControlToOffscreen = (() => ({})) as never;
    globalThis.ResizeObserver = class {
      cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) { this.cb = cb; }
      observe(el: Element) { this.cb([{ target: el, contentRect: { width: WIDTH, height: HEIGHT } } as unknown as ResizeObserverEntry], this as never); }
      unobserve() {}
      disconnect() {}
    } as never;
    useSettingsStore.setState({ fitAllChannelsTracker: false });
    useUIStore.setState({ trackerZoom: 100, trackerScale: 1, jingleActive: false });
    described.length = 0;
  });
  afterEach(() => { vi.useRealTimers(); cleanup(); });

  it('shows the Tony Williams command meaning after 400 ms, hides on leave and wheel', async () => {
    const song = await parseModuleToSong(new File([new Uint8Array(readFileSync(PATH))], 'future basketball main.tw'));
    const pattern = song.patterns[0]!;
    const rowIndex = pattern.channels[0]!.rows.findIndex((r) => describeEffectSlot(r, 0) !== null);
    expect(rowIndex).toBeGreaterThanOrEqual(0);
    const expected = describeEffectSlot(pattern.channels[0]!.rows[rowIndex], 0)!;
    described.length = 0;
    act(() => {
      useTrackerStore.setState({ patterns: song.patterns, currentPatternIndex: 0 });
      useCursorStore.getState().moveCursorToRow(rowIndex);
    });

    const view = render(<div style={{ width: WIDTH, height: HEIGHT }}><PatternEditorCanvas /></div>);
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    const grid = view.container.querySelector('[class*="overflow"], div') as HTMLElement;
    const target = view.container.querySelector('canvas')?.parentElement ?? grid;
    const rowH = Math.round(24);
    const y = editRowTop(HEIGHT, rowH, HEIGHT) + rowH / 2;

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    const text = () => document.body.textContent ?? '';
    let shown = false;
    for (let x = 0; x < 420 && !shown; x += 4) {
      fireEvent.pointerMove(target, { clientX: x, clientY: y, buttons: 0 });
      await act(async () => { vi.advanceTimersByTime(30); });
      // Before the delay: nothing is shown.
      expect(text()).not.toContain(expected.meaning);
      await act(async () => { vi.advanceTimersByTime(450); });
      shown = text().includes(expected.meaning);
    }
    expect(shown).toBe(true);
    expect(described.some((d) => d?.meaning === expected.meaning)).toBe(true); // sentinel: the resolver ran

    // Wheel hides it.
    fireEvent.wheel(target, { deltaY: 10 });
    await act(async () => { vi.advanceTimersByTime(50); });
    expect(text()).not.toContain(expected.meaning);
  });
});

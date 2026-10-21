/**
 * R2f-24c (host-only chops and vocals strip rows), R2f-32 (the press waveform grows to the master), R2f-59 (auto-scroll,
 * status line, sound toggle) through the real panel and the real factory seam.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Peaks } from '@/engine/uprough/r2Peaks';

const drawn: (Peaks | undefined)[] = [];
vi.mock('@/lib/uprough/factory/draw', async (orig) => {
  const m = await orig<typeof import('@/lib/uprough/factory/draw')>();
  return { ...m, drawWave: vi.fn((...a: Parameters<typeof m.drawWave>) => { drawn.push(a[3]); return m.drawWave(...a); }) };
});
vi.mock('@/utils/audio-context', () => ({ getDevilboxAudioContext: () => undefined }));

import { FactoryPanel } from '@components/uprough/FactoryPanel';
import { useFactoryStore, factoryOnEvent } from '../useFactoryStore';
import { scriptedGenerateEvents } from '../scriptedRun';
import { SLOT_OF_VOICE } from '../factoryModel';
import { growHeights } from '../motion';
import { useTrackerStore } from '@stores/useTrackerStore';
import type { R2Event } from '@/engine/uprough/r2Events';
import { peaks } from '@/engine/uprough/r2Peaks';

const feed = (evs: readonly R2Event[]): void => { act(() => { for (const ev of evs) factoryOnEvent(ev); }); };
const runClock = (ms = 60_000): void => { act(() => { vi.advanceTimersByTime(ms); }); };
const cellCount = (): number => useTrackerStore.getState().patterns.reduce((n, p) => n + p.channels.reduce((m, c) => m + c.rows.filter((r) => r.note > 0).length, 0), 0);

beforeEach(() => {
  // jsdom has no 2D context: a stub that accepts every drawing call, so the draw spy sees what the panel draws.
  const ctx = new Proxy({}, { get: (_t, k) => (k === 'canvas' ? undefined : () => undefined), set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'clearTimeout'] });
  vi.advanceTimersByTime(5);
  drawn.length = 0;
  useFactoryStore.getState().reset();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('R2f-24c host-only strip rows', () => {
  it('the Sample chops and Vocals rows count the non-empty decides and never write the tracker', () => {
    render(<FactoryPanel />);
    const evs = scriptedGenerateEvents('trap', 3);
    const chops = evs.filter((e) => e.type === 'decide' && e.lane === 'chops' && e.cells.length > 0).length;
    const vocals = evs.filter((e) => e.type === 'decide' && e.lane === 'vocals' && e.cells.length > 0).length;
    expect(chops).toBe(3);
    expect(vocals).toBe(1);

    // Sentinel: replay the run without the host-only lanes, then with them; the tracker cells must not differ.
    feed(evs.filter((e) => !(e.type === 'decide' && (e.lane === 'chops' || e.lane === 'vocals'))));
    const without = cellCount();
    expect(without).toBeGreaterThan(0);
    expect(screen.getAllByText('Sample chops')).toHaveLength(1);
    expect(screen.getByTestId('factory-chops-1').querySelectorAll('[data-filled="true"]')).toHaveLength(0);
    feed(evs);
    expect(cellCount()).toBe(without);

    const chopCells = screen.getByTestId('factory-chops-1').querySelectorAll('[data-filled="true"]');
    expect(chopCells).toHaveLength(chops);
    expect(chopCells[0]!.getAttribute('aria-label')).toBe('Bar 1: 1 break loop');
    expect(chopCells[1]!.getAttribute('aria-label')).toBe('Bar 2: 2 triggers, operation reverse');
    expect(screen.getByTestId('factory-vocals-2').querySelectorAll('[data-filled="true"]')).toHaveLength(vocals);
    expect(screen.getByTestId('factory-vocals-2').querySelector('[data-filled="true"]')!.getAttribute('aria-label')).toBe('Bar 1: 2 words, starting "she"');
    // Rows exist only for sections whose layers name the lane.
    expect(screen.queryByTestId('factory-chops-0')).toBeNull();
    expect(screen.queryByTestId('factory-vocals-1')).toBeNull();
  });
});

describe('R2f-32 record press growth', () => {
  const mk = (amp: number, f: number): Peaks => peaks(Float64Array.from({ length: 512 }, (_, i) => Math.sin(i / f) * amp * (1 + (i % 50) / 50)));
  const tex = mk(0.4, 7), master = mk(0.95, 3);
  const maxOf = (p: Peaks): number => Math.max(...p.max);

  it('growHeights: t=0 is the texture, t=1 the master, the midpoint strictly between, reduced motion the master', () => {
    expect(growHeights(tex, master, 0, false)).toEqual(tex);
    expect(growHeights(tex, master, 1, false)).toEqual(master);
    const hiTex = tex.max.findIndex((v, i) => v !== master.max[i]);
    const mid = growHeights(tex, master, 0.5, false);
    const lo = Math.min(tex.max[hiTex]!, master.max[hiTex]!), hi = Math.max(tex.max[hiTex]!, master.max[hiTex]!);
    expect(mid.max[hiTex]!).toBeGreaterThan(lo);
    expect(mid.max[hiTex]!).toBeLessThan(hi);
    expect(growHeights(tex, master, 0.2, true)).toEqual(master);
  });

  it('the master waveform is drawn growing from the texture and ends at the master peaks', () => {
    render(<FactoryPanel />);
    feed([{ seq: 0, type: 'start', mode: 'render', rate: 22050, style: 'trap', seed: 3, sections: [] },
      { seq: 1, type: 'texture', peaks: tex }]);
    feed([{ seq: 2, type: 'master', peaks: master }]);
    drawn.length = 0;
    runClock(50);
    const i = tex.max.findIndex((v, k) => v !== master.max[k]);
    const between = (v: number): boolean => v > Math.min(tex.max[i]!, master.max[i]!) && v < Math.max(tex.max[i]!, master.max[i]!);
    expect(drawn.some((p) => p && between(p.max[i]!))).toBe(true);
    runClock(5000);
    const last = drawn.filter((p): p is Peaks => !!p).at(-1)!;
    expect(maxOf(last)).toBe(maxOf(master));
  });
});

describe('R2f-59 auto-scroll and controls', () => {
  it('scrolls each building voice slot into view once, in build order, and never after done', () => {
    const order: string[] = [];
    Element.prototype.scrollIntoView = vi.fn(function (this: Element) { order.push(this.getAttribute('data-testid')!); });
    render(<FactoryPanel />);
    const evs = scriptedGenerateEvents('trap', 3);
    feed(evs.filter((e) => e.type !== 'done'));
    runClock(60_000);
    const voices = useFactoryStore.getState().state.voiceOrder;
    expect(voices).toHaveLength(13);
    expect(order).toHaveLength(13);
    expect(order[0]).toBe('factory-slot-kick');
    expect(order).toEqual(voices.map((v) => `factory-slot-${SLOT_OF_VOICE[v]}`));
    feed(evs.filter((e) => e.type === 'done'));
    const n = order.length;
    runClock(60_000);
    expect(order).toHaveLength(n);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
  });

  it('keeps the status line, sound toggle and Replay button', () => {
    const replay = vi.fn();
    render(<FactoryPanel onReplay={replay} />);
    const status = screen.getByTestId('factory-status');
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    const toggle = screen.getByRole('button', { name: /Factory sounds/ });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /Replay scripted run/ }));
    expect(replay).toHaveBeenCalledTimes(1);
  });
});

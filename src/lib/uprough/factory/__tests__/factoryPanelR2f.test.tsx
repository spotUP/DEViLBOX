/**
 * R2f-24c (host-only chops and vocals strip rows), R2f-32 (the press waveform grows to the master), R2f-59 (auto-scroll,
 * status line, sound toggle) through the real panel and the real factory seam.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Peaks } from '@/engine/uprough/r2Peaks';

const drawn: (Peaks | undefined)[] = [];
const waveCalls: { peaks: Peaks | undefined; reference: number | undefined; tallest: number }[] = [];
const bandCalls: { offset: number; chips: number }[] = [];
vi.mock('@/lib/uprough/factory/draw', async (orig) => {
  const m = await orig<typeof import('@/lib/uprough/factory/draw')>();
  return {
    ...m,
    drawWave: vi.fn((...a: Parameters<typeof m.drawWave>) => {
      drawn.push(a[3]);
      // Measure what is really drawn: the tallest bar above the centre line, as a fraction of the half box.
      let top = a[2] / 2;
      const rec = new Proxy(a[0], { get: (t, k) => (k === 'fillRect' ? (x: number, y: number, w: number, h: number) => { top = Math.min(top, y); t.fillRect(x, y, w, h); } : Reflect.get(t, k) as unknown) });
      m.drawWave(rec, ...(a.slice(1) as [never, never, never, never, never, never, never, never?, never?]));
      waveCalls.push({ peaks: a[3], reference: a[9], tallest: (a[2] / 2 - top) / (a[2] / 2 - 1) });
    }),
    drawConveyor: vi.fn((...a: Parameters<typeof m.drawConveyor>) => { bandCalls.push({ offset: a[3], chips: a[5]?.length ?? 0 }); return m.drawConveyor(...a); }),
  };
});
vi.mock('@/utils/audio-context', () => ({ getDevilboxAudioContext: () => undefined }));
// The fill opens its blank song through applySong: jsdom has no AudioContext and no Worker.
vi.mock('@engine/ToneEngine', () => import('@/test/mocks/silentToneEngine'));
vi.mock('@stores/useInstrumentTypeStore', () => import('@/test/mocks/inertInstrumentTypeStore'));

import { FactoryPanel } from '@components/uprough/FactoryPanel';
import { useFactoryStore, factoryOnEvent } from '../useFactoryStore';
import { patternFillLoaded } from '../patternFill';
import { scriptedGenerateEvents } from '../scriptedRun';
import { SLOT_OF_VOICE } from '../factoryModel';
import { bandBusy, chipPosition, growHeights } from '../motion';
import { useTrackerStore } from '@stores/useTrackerStore';
import type { R2Event } from '@/engine/uprough/r2Events';
import { peaks } from '@/engine/uprough/r2Peaks';

const feed = (evs: readonly R2Event[]): void => { act(() => { for (const ev of evs) factoryOnEvent(ev); }); };
/** A generate run the way the host streams it: the blank song lands after the start line, before the decides. */
const feedRun = async (evs: readonly R2Event[]): Promise<void> => {
  feed(evs.slice(0, 1));
  await act(() => patternFillLoaded());
  feed(evs.slice(1));
};
const runClock = (ms = 60_000): void => { act(() => { vi.advanceTimersByTime(ms); }); };
const cellCount = (): number => useTrackerStore.getState().patterns.reduce((n, p) => n + p.channels.reduce((m, c) => m + c.rows.filter((r) => r.note > 0).length, 0), 0);

beforeEach(() => {
  // jsdom has no 2D context: a stub that accepts every drawing call, so the draw spy sees what the panel draws.
  const ctx = new Proxy({}, { get: (_t, k) => (k === 'canvas' ? undefined : () => undefined), set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'clearTimeout'] });
  vi.advanceTimersByTime(5);
  drawn.length = 0; waveCalls.length = 0; bandCalls.length = 0;
  useFactoryStore.getState().reset();
});
// A start event loads the run's blank song; finish it inside the file, or its instrument load lands after
// teardown, when the module mocks are gone, and reaches the real classifier Worker.
afterEach(async () => {
  await act(() => patternFillLoaded());
  cleanup(); vi.useRealTimers(); vi.restoreAllMocks();
});

describe('R2f-24c host-only strip rows', () => {
  it('the Sample chops and Vocals rows count the non-empty decides and never write the tracker', async () => {
    render(<FactoryPanel />);
    const evs = scriptedGenerateEvents('trap', 3);
    const chops = evs.filter((e) => e.type === 'decide' && e.lane === 'chops' && e.cells.length > 0).length;
    const vocals = evs.filter((e) => e.type === 'decide' && e.lane === 'vocals' && e.cells.length > 0).length;
    expect(chops).toBe(3);
    expect(vocals).toBe(1);

    // Sentinel: replay the run without the host-only lanes, then with them; the tracker cells must not differ.
    await feedRun(evs.filter((e) => !(e.type === 'decide' && (e.lane === 'chops' || e.lane === 'vocals'))));
    const without = cellCount();
    expect(without).toBeGreaterThan(0);
    expect(screen.getAllByText('Sample chops')).toHaveLength(1);
    expect(screen.getByTestId('factory-chops-1').querySelectorAll('[data-filled="true"]')).toHaveLength(0);
    await feedRun(evs);
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

  it('the press draws in absolute amplitude: t=0 is texture.scale/master.scale of the master height, t=1 the master height', () => {
    expect(tex.scale).toBeLessThan(master.scale);
    render(<FactoryPanel />);
    feed([{ seq: 0, type: 'start', mode: 'render', rate: 22050, style: 'trap', seed: 3, sections: [] },
      { seq: 1, type: 'texture', peaks: tex }]);
    waveCalls.length = 0;
    feed([{ seq: 2, type: 'master', peaks: master }]);
    const height = (c: { tallest: number }): number => c.tallest;
    const press = (): typeof waveCalls => waveCalls.filter((c) => c.peaks && c.reference !== undefined);
    const start = height(press().find((c) => c.peaks!.scale === tex.scale)!);
    runClock(5000);
    const end = height(press().at(-1)!);
    expect(end).toBeCloseTo(maxOf(master) / 127, 1);
    expect(start / end).toBeCloseTo(tex.scale / master.scale, 2);
  });
});

describe('R2f-56 conveyor chips and idle band', () => {
  it('chipPosition: 0 at birth, monotone, capped so the chip stays on the band', () => {
    expect(chipPosition(10, 10, 240, 60)).toBe(0);
    expect(chipPosition(10, 10.5, 240, 60)).toBe(30);
    let prev = -1;
    for (let t = 10; t < 20; t += 0.25) { const x = chipPosition(10, t, 240, 60); expect(x).toBeGreaterThanOrEqual(prev); prev = x; }
    expect(chipPosition(10, 1000, 240, 60)).toBeLessThanOrEqual(240);
    expect(chipPosition(10, 9, 240, 60)).toBe(0);
  });

  it('bandBusy: only an event inside the window makes the band busy', () => {
    expect(bandBusy(5000, undefined)).toBe(false);
    expect(bandBusy(5000, 4500)).toBe(true);
    expect(bandBusy(5000, 2000)).toBe(false);
  });

  it('a chip rides for each of 7 real section events, and none ride without section events', () => {
    render(<FactoryPanel />);
    feed([{ seq: 0, type: 'start', mode: 'render', rate: 22050, style: 'trap', seed: 3, sections: [] }]);
    runClock(100);
    expect(Math.max(...bandCalls.map((c) => c.chips))).toBe(0);
    const sections = Array.from({ length: 7 }, (_, i) => ({ name: `s${i}`, bars: 4, layers: [] as string[] }));
    feed([{ seq: 1, type: 'start', mode: 'render', rate: 22050, style: 'trap', seed: 3, sections },
      ...sections.map((s, i): R2Event => ({ seq: 2 + i, type: 'section', section: i, name: s.name, bars: 4, cached: false }))]);
    bandCalls.length = 0;
    runClock(50);
    expect(Math.max(...bandCalls.map((c) => c.chips))).toBe(7);
  });

  it('the band does not advance with busy true but no event for 2 s', () => {
    render(<FactoryPanel />);
    feed([{ seq: 0, type: 'start', mode: 'render', rate: 22050, style: 'trap', seed: 3, sections: [] }]);
    runClock(100);
    expect(useFactoryStore.getState().state.done).toBe(false);
    expect(bandCalls.some((c) => c.offset > 0)).toBe(true);
    runClock(2000);
    bandCalls.length = 0;
    runClock(500);
    expect(bandCalls.length).toBeGreaterThan(0);
    expect(new Set(bandCalls.map((c) => c.offset))).toEqual(new Set([0]));
  });
});

describe('R2f-59 auto-scroll and controls', () => {
  it('scrolls each building voice slot into view once, in build order, and never after done', () => {
    const order: string[] = [];
    Element.prototype.scrollIntoView = vi.fn(function (this: Element, o?: boolean | ScrollIntoViewOptions) { if (typeof o === 'object' && o.block === 'nearest') order.push(this.getAttribute('data-testid')!); }); // the finale scroll to the top (G20) uses block 'start'
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

  it('a hat pool of eight keeps the hat chips on one row, so the slot does not grow taller', () => {
    render(<FactoryPanel />);
    const pk = peaks(new Float64Array(256).map((_, i) => Math.sin(i / 4)));
    act(() => {
      for (const e of scriptedGenerateEvents('trap', 3)) {
        factoryOnEvent(e.type === 'hatpool' ? { ...e, variants: Array.from({ length: 8 }, (_, i) => ({ name: `hat_${i}`, peaks: pk })) } : e);
      }
    });
    const row = screen.getByTestId('factory-chips-hat');
    expect(row.querySelectorAll('button[aria-label^="Play"]').length).toBeGreaterThanOrEqual(8);
    // One row whatever the count: a column-flow grid never wraps; a wrapping flex row grows the card per extra line.
    expect(row.className).toContain('grid-flow-col');
    expect(row.className).not.toContain('flex-wrap');
  });

  it('keeps the status line, sound toggle and Replay button', () => {
    const replay = vi.fn();
    render(<FactoryPanel onReplay={replay} />);
    const status = screen.getByTestId('factory-status');
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    const toggle = screen.getByRole('button', { name: /Factory sounds/ });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: /Replay scripted run/ }));
    expect(replay).toHaveBeenCalledTimes(1);
  });
});

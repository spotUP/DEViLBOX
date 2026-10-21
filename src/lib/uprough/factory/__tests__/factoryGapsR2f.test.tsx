/**
 * Song-factory gap fixes against the golden draft (G2, G5, G6, G7, G9, G10, G13, G14, G15, G16, G18, G20), driven
 * through the real panel and the real factory seam.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import type { Peaks } from '@/engine/uprough/r2Peaks';

const waveCalls: { peaks: Peaks | undefined; reference: number | undefined; tallest: number }[] = [];
vi.mock('@/lib/uprough/factory/draw', async (orig) => {
  const m = await orig<typeof import('@/lib/uprough/factory/draw')>();
  return {
    ...m,
    drawWave: vi.fn((...a: Parameters<typeof m.drawWave>) => {
      let top = a[2] / 2;
      const rec = new Proxy(a[0], { get: (t, k) => (k === 'fillRect' ? (x: number, y: number, w: number, h: number) => { top = Math.min(top, y); t.fillRect(x, y, w, h); } : Reflect.get(t, k) as unknown) });
      m.drawWave(rec, ...(a.slice(1) as [never, never, never, never, never, never, never, never?, never?]));
      waveCalls.push({ peaks: a[3], reference: a[9], tallest: (a[2] / 2 - top) / (a[2] / 2 - 1) });
    }),
  };
});
vi.mock('@/utils/audio-context', () => ({ getDevilboxAudioContext: () => undefined }));

import { FactoryPanel, ABSOLUTE_HEADROOM } from '@components/uprough/FactoryPanel';
import { useFactoryStore, factoryOnEvent } from '../useFactoryStore';
import { scriptedGenerateEvents } from '../scriptedRun';
import type { R2Event } from '@/engine/uprough/r2Events';

const feed = (evs: readonly R2Event[]): void => { act(() => { for (const ev of evs) factoryOnEvent(ev); }); };
const runClock = (ms = 60_000): void => { act(() => { vi.advanceTimersByTime(ms); }); };
const maxOf = (p: Peaks): number => Math.max(...p.max);

beforeEach(() => {
  const ctx = new Proxy({}, { get: (_t, k) => (k === 'canvas' ? undefined : () => undefined), set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'clearTimeout'] });
  vi.advanceTimersByTime(5);
  waveCalls.length = 0;
  useFactoryStore.getState().reset();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('G2 absolute scale', () => {
  it('every kick stage is drawn against the finished kick peak plus 15 percent, so early stages are smaller than the box', () => {
    render(<FactoryPanel />);
    feed(scriptedGenerateEvents('trap', 3).filter((e) => e.type !== 'done'));
    const kick = useFactoryStore.getState().state.slots.find((s) => s.id === 'kick')!.voices[0]!;
    const ref = kick.bank!.scale * ABSOLUTE_HEADROOM;
    runClock(60_000);
    const mine = waveCalls.filter((c) => c.reference === ref && c.peaks);
    expect(mine.length).toBeGreaterThan(1);
    const stage = mine.find((c) => c.peaks !== kick.bank)!;
    expect(stage).toBeDefined();
    const expected = (maxOf(stage.peaks!) / 127) * (stage.peaks!.scale / ref);
    expect(stage.tallest).toBeCloseTo(expected, 1);
    const fin = mine.filter((c) => c.peaks === kick.bank).at(-1)!;
    expect(fin.tallest).toBeCloseTo((maxOf(kick.bank!) / 127) / ABSOLUTE_HEADROOM, 1);
    expect(fin.tallest).toBeLessThan(0.9);
  });
});

/**
 * Song-factory gap fixes against the golden draft (G2, G5, G6, G7, G9, G10, G13, G14, G15, G16, G18, G20), driven
 * through the real panel and the real factory seam.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import type { Peaks } from '@/engine/uprough/r2Peaks';

const stampCalls: { name: string; since: number }[] = [];
const playheadCalls: number[] = [];
const waveCalls: { peaks: Peaks | undefined; reference: number | undefined; tallest: number }[] = [];
vi.mock('@/lib/uprough/factory/draw', async (orig) => {
  const m = await orig<typeof import('@/lib/uprough/factory/draw')>();
  return {
    ...m,
    drawStamp: vi.fn((...a: Parameters<typeof m.drawStamp>) => { stampCalls.push({ name: a[2], since: a[3] }); m.drawStamp(...a); }),
    drawPlayhead: vi.fn((...a: Parameters<typeof m.drawPlayhead>) => { playheadCalls.push(a[3]); m.drawPlayhead(...a); }),
    drawWave: vi.fn((...a: Parameters<typeof m.drawWave>) => {
      let top = a[2] / 2;
      const rec = new Proxy(a[0], { get: (t, k) => (k === 'fillRect' ? (x: number, y: number, w: number, h: number) => { top = Math.min(top, y); t.fillRect(x, y, w, h); } : Reflect.get(t, k) as unknown) });
      m.drawWave(rec, ...(a.slice(1) as [never, never, never, never, never, never, never, never?, never?]));
      waveCalls.push({ peaks: a[3], reference: a[9], tallest: (a[2] / 2 - top) / (a[2] / 2 - 1) });
    }),
  };
});
vi.mock('@/lib/uprough/factory/voiceAudition', async (orig) => ({ ...(await orig<typeof import('@/lib/uprough/factory/voiceAudition')>()), hasLocalPreview: () => previewOn, playVoice: vi.fn() }));
let previewOn = false;
vi.mock('@/utils/audio-context', () => ({ getDevilboxAudioContext: () => undefined }));

import { drawEyes, drawStamp, eyeOpenness, PLATE_SECONDS } from '@/lib/uprough/factory/draw';
import { FactoryPanel, ABSOLUTE_HEADROOM, CHIP_THUMB_HEIGHT } from '@components/uprough/FactoryPanel';
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
  waveCalls.length = 0; stampCalls.length = 0; playheadCalls.length = 0; previewOn = false;
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

const slotEl = (id: string): HTMLElement => document.querySelector(`[data-testid="factory-slot-${id}"]`) as HTMLElement;
const scaleOf = (el: HTMLElement): number => Number(/scale\(([\d.]+)\)/.exec(el.style.transform)?.[1] ?? 1);
const recordingCtx = (): { ctx: CanvasRenderingContext2D; log: { fn: string; args: unknown[] }[] } => {
  const log: { fn: string; args: unknown[] }[] = [];
  const ctx = new Proxy({}, { get: (_t, k) => (...args: unknown[]) => { log.push({ fn: String(k), args }); }, set: () => true }) as unknown as CanvasRenderingContext2D;
  return { ctx, log };
};

describe('G10 card squash, dimming and glow; G18 placeholder', () => {
  it('a slot waits dim and dashed, glows while it builds, and ends built at full size; the card squashes when its build starts', () => {
    render(<FactoryPanel />);
    feed(scriptedGenerateEvents('trap', 3).filter((e) => e.type !== 'done'));
    expect(slotEl('snare').dataset.state).toBe('waiting');
    expect(slotEl('snare').className).toContain('border-dashed');
    expect(slotEl('kick').dataset.state).toBe('building');
    expect(slotEl('kick').className).toContain('ring-accent-primary');
    expect(scaleOf(slotEl('kick'))).toBeLessThan(1);
    runClock(60_000);
    expect(slotEl('kick').dataset.state).toBe('built');
    expect(scaleOf(slotEl('kick'))).toBe(1);
  });

  it('bass and melody show a lock and "Comes alive at the first rendered bar" until their first bar is born', () => {
    render(<FactoryPanel />);
    feed(scriptedGenerateEvents('trap', 3).slice(0, 1));
    const bass = slotEl('bass');
    expect(bass.textContent).toContain('Comes alive at the first rendered bar');
    expect(bass.querySelector('svg.lucide-lock')).not.toBeNull();
    expect(slotEl('kick').textContent).toContain('Empty');
    expect(slotEl('kick').querySelector('svg.lucide-lock')).toBeNull();
  });
});

describe('G6 stamp plate', () => {
  it('drawStamp writes the voice name in capitals and only during the plate window', () => {
    const { ctx, log } = recordingCtx();
    const c = { line: 'l', wave: 'w', final: 'f', env: 'e', dim: 'd', eye: 'y', plate: 'p', text: 't', inverse: 'i' };
    drawStamp(ctx, 240, 'snare ghost', 0.2, 0, c);
    expect(log.find((e) => e.fn === 'fillText')?.args[0]).toBe('SNARE GHOST');
    log.length = 0;
    drawStamp(ctx, 240, 'snare', PLATE_SECONDS + 0.01, 0, c);
    expect(log.length).toBe(0);
  });
  it('the panel drops the kick plate when the kick is stamped', () => {
    render(<FactoryPanel />);
    feed(scriptedGenerateEvents('trap', 3).filter((e) => e.type !== 'done'));
    for (let i = 0; i < 1200; i++) runClock(50);
    const kick = stampCalls.filter((s) => s.name === 'kick');
    expect(kick.length).toBeGreaterThan(0);
    expect(kick.every((s) => s.since >= 0 && s.since < PLATE_SECONDS)).toBe(true);
  });
});

describe('G5 playhead', () => {
  it('sweeps the wave from 0 toward 1 while the one-shot audition plays, and never without a local preview', () => {
    previewOn = true;
    render(<FactoryPanel />);
    feed(scriptedGenerateEvents('trap', 3).filter((e) => e.type !== 'done'));
    for (let i = 0; i < 1200; i++) runClock(50);
    expect(playheadCalls.length).toBeGreaterThan(3);
    expect(Math.min(...playheadCalls)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...playheadCalls)).toBeLessThanOrEqual(1);
    expect(Math.max(...playheadCalls)).toBeGreaterThan(Math.min(...playheadCalls));
  });
  it('draws no playhead when there is no local preview', () => {
    previewOn = false;
    render(<FactoryPanel />);
    feed(scriptedGenerateEvents('trap', 3).filter((e) => e.type !== 'done'));
    for (let i = 0; i < 400; i++) runClock(50);
    expect(playheadCalls.length).toBe(0);
  });
});

describe('G9 eyes', () => {
  it('open eyes blink every 4.5 s, an idle slot is a half-closed slit, and the eyes are bigger than the old 5x6 px', () => {
    expect(eyeOpenness(0.05, 0, false)).toBeLessThan(0.2);
    expect(eyeOpenness(2, 0, false)).toBe(1);
    expect(eyeOpenness(4.5 + 0.05, 0, false)).toBeLessThan(0.2);
    expect(eyeOpenness(3.7, 0, false)).toBe(1);
    expect(eyeOpenness(2, 0, true)).toBeLessThan(0.5);
    const { ctx, log } = recordingCtx();
    drawEyes(ctx, 10, 10, 2, 0, { line: '', wave: '', final: '', env: '', dim: '', eye: 'y', plate: '', text: '', inverse: '' }, false);
    const e = log.find((x) => x.fn === 'ellipse')!;
    expect(e.args[2]).toBeGreaterThanOrEqual(4);
    expect(e.args[3]).toBeGreaterThanOrEqual(6);
  });
});

describe('G14 hat fan-out and G15 chip pop-in', () => {
  it('hat variant chips pop one after another, FAN_SECONDS apart, not all at once', () => {
    previewOn = true;
    render(<FactoryPanel />);
    feed(scriptedGenerateEvents('trap', 3).filter((e) => e.type !== 'done'));
    const hatVoice = useFactoryStore.getState().state.slots.find((s) => s.id === 'hat')!;
    expect(hatVoice.hatVariants.length).toBeGreaterThan(1);
    // Step the clock until the hat voice's chips begin to pop, then compare first and last variant chips.
    let seen = false;
    for (let i = 0; i < 2400 && !seen; i++) {
      runClock(10);
      const chips = [...document.querySelectorAll('[data-testid="factory-chips-hat"] button')] as HTMLElement[];
      const op = chips.map((c) => Number(c.style.opacity));
      const variantOps = op.slice(-hatVoice.hatVariants.length);
      if (variantOps.some((o) => o > 0) && variantOps.some((o) => o === 0)) {
        seen = true;
        expect(variantOps[0]!).toBeGreaterThanOrEqual(variantOps.at(-1)!);
      }
    }
    expect(seen).toBe(true);
  });
});

describe('G11 type sizes', () => {
  it('slot heading is 18 px extra bold, caption 13 px two lines, chips have a 3 px border and a 22 px thumbnail', () => {
    render(<FactoryPanel />);
    feed(scriptedGenerateEvents('trap', 3).filter((e) => e.type !== 'done'));
    runClock(60_000);
    const heading = document.querySelector('[data-testid="factory-heading-kick"]')!;
    expect(heading.className).toContain('text-lg');
    expect(heading.className).toContain('font-extrabold');
    const caption = document.querySelector('[data-testid="factory-caption-kick"]')!;
    expect(caption.className).toContain('text-[13px]');
    expect(caption.className).toContain('min-h-[2.6em]');
    expect(caption.className).toContain('line-clamp-2');
    const chip = document.querySelector('[data-testid="factory-chips-kick"] button')!;
    expect(chip.className).toContain('border-[3px]');
    expect(CHIP_THUMB_HEIGHT).toBe(22);
    expect((chip.querySelector('canvas') as HTMLCanvasElement).style.height).toBe('22px');
  });
});

const statusText = (): string => document.querySelector('[data-testid="factory-status"]')!.textContent ?? '';
const statusLog = (steps: number, stepMs: number): string[] => {
  const seen: string[] = [];
  for (let i = 0; i < steps; i++) { runClock(stepMs); const s = statusText(); if (seen.at(-1) !== s) seen.push(s); }
  return seen;
};

describe('G13 act-1 status line', () => {
  it('walks Building, Stage k of S, the hat fan-out and Act 1 finished from the act-1 clock, not from the last event', () => {
    render(<FactoryPanel />);
    feed(scriptedGenerateEvents('trap', 3).filter((e) => e.type !== 'done'));
    const seen = statusLog(400, 25);
    expect(seen.some((x) => /^Building kick/.test(x))).toBe(true);
    expect(seen.some((x) => /^Stage 1 of \d+: /.test(x))).toBe(true);
    expect(seen.some((x) => /^Hat slot fans out the \d+ variants/.test(x))).toBe(true);
    expect(seen.some((x) => /^Act 1 finished/.test(x))).toBe(true);
    expect(seen.indexOf(seen.find((x) => /^Building/.test(x))!)).toBeLessThan(seen.findIndex((x) => /^Act 1 finished/.test(x)));
  });
});

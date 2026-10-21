/**
 * Hard invariant: the whole factory fits the fullscreen dialog with no scrolling. The panel fills the height it is given
 * (flex column, min-h-0), no element in its chain scrolls, and the slot waveform height is derived from the room the slot
 * grid measures (ResizeObserver), not a constant.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@/utils/audio-context', () => ({ getDevilboxAudioContext: () => undefined }));
const heights: number[] = [];
vi.mock('@/lib/uprough/factory/draw', async (orig) => {
  const m = await orig<typeof import('@/lib/uprough/factory/draw')>();
  return { ...m, fitCanvas: vi.fn((...a: Parameters<typeof m.fitCanvas>) => { heights.push(a[2]); return m.fitCanvas(...a); }) };
});

import { FactoryPanel } from '@components/uprough/FactoryPanel';
import { useFactoryStore } from '../useFactoryStore';
import { slotGrid, SLOT_CHROME, WAVE_MAX, WAVE_MIN } from '../layout';

let fire: (w: number, h: number) => void = () => undefined;
class FakeRO {
  private cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) { this.cb = cb; }
  observe(el: Element): void {
    if (el.getAttribute('data-testid') !== 'factory-slots') return;
    fire = (width, height) => this.cb([{ target: el, contentRect: { width, height } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve(): void { /* unused */ }
  disconnect(): void { /* unused */ }
}

beforeEach(() => {
  const ctx = new Proxy({}, { get: (_t, k) => (k === 'canvas' ? undefined : () => undefined), set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
  vi.stubGlobal('ResizeObserver', FakeRO);
  heights.length = 0;
  useFactoryStore.getState().reset();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('factory fits the dialog without scrolling', () => {
  it('the panel root is a full-height flex column with min-h-0, and nothing in its chain scrolls', () => {
    render(<FactoryPanel />);
    const root = screen.getByTestId('factory-panel');
    expect(root.className).toMatch(/\bh-full\b/);
    expect(root.className).toMatch(/\bflex-col\b/);
    expect(root.className).toMatch(/\bmin-h-0\b/);
    const grid = screen.getByTestId('factory-slots');
    expect(grid.className).toMatch(/\bflex-1\b/);
    expect(grid.className).toMatch(/\bmin-h-0\b/);
    for (const el of [root, ...root.querySelectorAll('*')]) expect(String(el.getAttribute('class'))).not.toMatch(/overflow-(y-)?(auto|scroll)/);
  });

  it('the dialog body stops being the scroll container while the factory shows', () => {
    const src = readFileSync(join(__dirname, '../../../../components/dialogs/UpRoughGenerateDialog.tsx'), 'utf8');
    expect(src).toContain("showFactory ? 'flex flex-col gap-3 overflow-hidden'");
  });

  it('the slot wave height follows the measured grid height, clamped to the draft maximum', () => {
    render(<FactoryPanel />);
    const slots = useFactoryStore.getState().state.slots.length;
    act(() => fire(1200, 480));
    const small = slotGrid(1200, 480, slots).wave;
    act(() => fire(1200, 1800));
    const big = slotGrid(1200, 1800, slots).wave;
    expect(big).toBe(WAVE_MAX);
    expect(small).toBeLessThan(big);
    expect(small).toBeGreaterThanOrEqual(WAVE_MIN);
    heights.length = 0;
    act(() => fire(1200, 480));
    expect(heights).toContain(small);
    expect(heights).not.toContain(WAVE_MAX);
    heights.length = 0;
    act(() => fire(1200, 1800));
    expect(heights).toContain(WAVE_MAX);
  });

  it('slotGrid uses the draft 270 px columns where the width allows and still fits the rows into the height', () => {
    const g = slotGrid(1500, 700, 11);
    expect(g.cols).toBe(Math.floor((1500 + 12) / (270 + 12)));
    const total = g.rows * (g.wave + SLOT_CHROME) + 12 * (g.rows - 1);
    expect(total).toBeLessThanOrEqual(700);
  });
});

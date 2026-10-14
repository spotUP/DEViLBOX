/**
 * Owner 2026-10-14 (DJ-SCOPES-ONE-CHANNEL): with three decks in a window of ~1200 px the deck header
 * left only ~130 px beside the turntable; the scopes kept 64 px each inside an overflow-hidden box, so
 * only the first channel scope showed. The scopes now size to the row they sit in.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';

vi.mock('@/hooks/dj/useDeckVisualizationData', () => ({
  useDeckVisualizationData: () => ({ getWaveform: () => null, getChannelWaveforms: () => null }),
}));

import { DeckScopes, deckScopeSize } from '../DeckScopes';
import { useDJStore } from '@/stores/useDJStore';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('DJ deck shows one scope per song channel in a narrow deck header', () => {
  it('four scopes plus the mode chip fit a 130 px row, and a roomy row keeps them 64 px', () => {
    const narrow = deckScopeSize(64, 4, 130);
    expect(narrow).toBeLessThan(64);
    expect(narrow * 4 + 4 * 4 + 36).toBeLessThanOrEqual(130);
    expect(deckScopeSize(64, 4, 600)).toBe(64);
    expect(deckScopeSize(64, 4)).toBe(64);
    // 16 channels never fall below the readable floor, and never grow past the four-wide share
    expect(deckScopeSize(64, 16, 2000)).toBe(16);
    expect(deckScopeSize(64, 16, 100)).toBeGreaterThanOrEqual(8);
  });

  it('the rendered deck scopes take the width the row reports', () => {
    let notify: ((w: number) => void) | undefined;
    vi.stubGlobal('ResizeObserver', class {
      constructor(cb: (e: Array<{ contentRect: { width: number } }>) => void) { notify = (w) => cb([{ contentRect: { width: w } }]); }
      observe() {} disconnect() {} unobserve() {}
    });
    useDJStore.getState().setDeckState('A', { channelScopeCount: 4 });
    const { container } = render(<DeckScopes deckId="A" size={64} />);
    const sizes = () => Array.from(container.querySelectorAll('canvas')).map((c) => parseInt((c as HTMLCanvasElement).style.width, 10));
    expect(sizes()).toEqual([64, 64, 64, 64]);
    act(() => notify?.(130));
    const fitted = sizes();
    expect(fitted).toHaveLength(4);
    expect(fitted[0]).toBeLessThan(64);
    expect(fitted[0] * 4 + 16 + 36).toBeLessThanOrEqual(130);
  });
});

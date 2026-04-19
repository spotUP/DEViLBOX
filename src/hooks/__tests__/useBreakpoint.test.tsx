/**
 * Tests for useBreakpoint — a pure responsive hook used across the app.
 * Purely DOM + state, no audio context required, CI-safe.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useBreakpoint } from '../useBreakpoint';

function setWidth(px: number): void {
  (window as any).innerWidth = px;
}

function fireResize(): void {
  window.dispatchEvent(new Event('resize'));
}

describe('useBreakpoint', () => {
  beforeEach(() => {
    setWidth(1280); // desktop baseline
  });
  afterEach(() => {
    cleanup();
  });

  it('reports "desktop" on a wide viewport', () => {
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current.breakpoint).toBe('desktop');
    expect(result.current.isDesktop).toBe(true);
    expect(result.current.isMobile).toBe(false);
    expect(result.current.isTablet).toBe(false);
  });

  it('reports "mobile" under the sm (640px) threshold', async () => {
    setWidth(400);
    const { result } = renderHook(() => useBreakpoint());
    // useEffect updates via rAF; let one frame flush.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(result.current.breakpoint).toBe('mobile');
    expect(result.current.isMobile).toBe(true);
    expect(result.current.width).toBe(400);
  });

  it('reports "tablet" between sm and lg (640-1023px)', async () => {
    setWidth(800);
    const { result } = renderHook(() => useBreakpoint());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(result.current.breakpoint).toBe('tablet');
    expect(result.current.isTablet).toBe(true);
  });

  it('updates when the window resizes (after debounce)', async () => {
    setWidth(1280);
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current.breakpoint).toBe('desktop');

    setWidth(500);
    await act(async () => {
      fireResize();
      // Debounce is 100 ms.
      await new Promise((r) => setTimeout(r, 150));
    });
    expect(result.current.breakpoint).toBe('mobile');
  });

  it('boolean flags stay in sync with the breakpoint label', () => {
    const { result } = renderHook(() => useBreakpoint());
    const trues = [
      result.current.isMobile,
      result.current.isTablet,
      result.current.isDesktop,
    ].filter(Boolean).length;
    expect(trues, 'exactly one of isMobile/isTablet/isDesktop should be true').toBe(1);
  });
});

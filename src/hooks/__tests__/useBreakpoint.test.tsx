/**
 * Tests for useBreakpoint — the app's single source of truth for viewport size
 * and pointer type. Purely DOM + state, no audio context required, CI-safe.
 *
 * Covers three separate questions the codebase used to conflate:
 *   - how wide is it            -> breakpoint / isMobile / isTablet / isDesktop / isWide
 *   - is the pointer a finger   -> isCoarsePointer
 *   - is this a phone layout    -> isPhone (plan decision D1: coarse AND small)
 *
 * The last test in this file is a GUARD: it fails if a second width-threshold
 * definition appears anywhere in src/ outside useBreakpoint.ts. That guard is
 * what stops "mobile" drifting back to four disagreeing definitions.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { useBreakpoint, BREAKPOINTS } from '../useBreakpoint';

/** happy-dom's window with the fields these tests drive, without `any`. */
const win = window as unknown as {
  innerWidth: number;
  innerHeight: number;
  matchMedia: (query: string) => MediaQueryList;
};

function setWidth(px: number): void {
  win.innerWidth = px;
}

function setHeight(px: number): void {
  win.innerHeight = px;
}

function setViewport(width: number, height: number): void {
  setWidth(width);
  setHeight(height);
}

function fireResize(): void {
  window.dispatchEvent(new Event('resize'));
}

const realMatchMedia = window.matchMedia;

/**
 * Install a matchMedia stub whose only opinion is the pointer type.
 * happy-dom does not emulate pointer media features, and the pointer type is
 * exactly the signal under test, so it is stubbed rather than inferred.
 */
function setCoarsePointer(coarse: boolean): void {
  win.matchMedia = (query: string) =>
    ({
      media: query,
      matches: query.includes('pointer: coarse') ? coarse : false,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

/** Let the hook's requestAnimationFrame flush. */
async function flushFrame(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}

describe('useBreakpoint', () => {
  beforeEach(() => {
    setViewport(1280, 900); // desktop baseline
    setCoarsePointer(false);
  });
  afterEach(() => {
    cleanup();
    win.matchMedia = realMatchMedia;
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
    await flushFrame();
    expect(result.current.breakpoint).toBe('mobile');
    expect(result.current.isMobile).toBe(true);
    expect(result.current.width).toBe(400);
  });

  it('reports "tablet" between sm and lg (640-1023px)', async () => {
    setWidth(800);
    const { result } = renderHook(() => useBreakpoint());
    await flushFrame();
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

  // ---------------------------------------------------------------------
  // The width threshold table. These are the ONLY numbers in the app.
  // ---------------------------------------------------------------------

  describe('threshold table', () => {
    const cases: Array<{ width: number; breakpoint: string; isWide: boolean; why: string }> = [
      { width: 320, breakpoint: 'mobile', isWide: false, why: 'smallest phone portrait' },
      { width: 639, breakpoint: 'mobile', isWide: false, why: 'one below sm' },
      { width: 640, breakpoint: 'tablet', isWide: false, why: 'sm exactly' },
      { width: 767, breakpoint: 'tablet', isWide: false, why: 'one below md' },
      { width: 768, breakpoint: 'tablet', isWide: false, why: 'md exactly' },
      { width: 899, breakpoint: 'tablet', isWide: false, why: 'one below wide' },
      { width: 900, breakpoint: 'tablet', isWide: true, why: 'wide exactly — side panel fits' },
      { width: 1023, breakpoint: 'tablet', isWide: true, why: 'one below lg' },
      { width: 1024, breakpoint: 'desktop', isWide: true, why: 'lg exactly' },
      { width: 1440, breakpoint: 'desktop', isWide: true, why: 'laptop' },
    ];

    for (const { width, breakpoint, isWide, why } of cases) {
      it(`${width}px is "${breakpoint}" (isWide=${isWide}) — ${why}`, async () => {
        setViewport(width, 900);
        const { result } = renderHook(() => useBreakpoint());
        await flushFrame();
        expect(result.current.breakpoint).toBe(breakpoint);
        expect(result.current.isWide).toBe(isWide);
      });
    }

    it('the scale matches the Tailwind screens contract', () => {
      expect(BREAKPOINTS).toEqual({
        sm: 640,
        md: 768,
        wide: 900,
        lg: 1024,
        xl: 1280,
        '2xl': 1536,
      });
    });
  });

  // ---------------------------------------------------------------------
  // Pointer type — a different question from width.
  // ---------------------------------------------------------------------

  describe('isCoarsePointer', () => {
    it('is false when the primary pointer is a mouse', async () => {
      setCoarsePointer(false);
      const { result } = renderHook(() => useBreakpoint());
      await flushFrame();
      expect(result.current.isCoarsePointer).toBe(false);
    });

    it('is true when the primary pointer is a finger', async () => {
      setCoarsePointer(true);
      const { result } = renderHook(() => useBreakpoint());
      await flushFrame();
      expect(result.current.isCoarsePointer).toBe(true);
    });

    it('does not depend on width', async () => {
      setCoarsePointer(true);
      setViewport(1440, 900);
      const { result } = renderHook(() => useBreakpoint());
      await flushFrame();
      expect(result.current.isCoarsePointer).toBe(true);
      expect(result.current.isDesktop).toBe(true);
    });
  });

  // ---------------------------------------------------------------------
  // D1: phone layout = coarse pointer AND small screen.
  // ---------------------------------------------------------------------

  describe('isPhone (decision D1)', () => {
    const cases: Array<{
      name: string;
      width: number;
      height: number;
      coarse: boolean;
      isPhone: boolean;
    }> = [
      { name: 'iPhone portrait (390x844, finger)', width: 390, height: 844, coarse: true, isPhone: true },
      // The case a width-only rule misses: 844px wide is "desktop" by width.
      { name: 'iPhone landscape (844x390, finger)', width: 844, height: 390, coarse: true, isPhone: true },
      // The case a width-only rule gets wrong in the other direction.
      { name: 'desktop window 900x1000 (mouse)', width: 900, height: 1000, coarse: false, isPhone: false },
      { name: 'narrow desktop window 390x844 (mouse)', width: 390, height: 844, coarse: false, isPhone: false },
      { name: 'short desktop window 1440x500 (mouse)', width: 1440, height: 500, coarse: false, isPhone: false },
      { name: 'iPad portrait (768x1024, finger)', width: 768, height: 1024, coarse: true, isPhone: false },
      { name: 'iPad landscape (1024x768, finger)', width: 1024, height: 768, coarse: true, isPhone: false },
    ];

    for (const { name, width, height, coarse, isPhone } of cases) {
      it(`${name} -> isPhone=${isPhone}`, async () => {
        setCoarsePointer(coarse);
        setViewport(width, height);
        const { result } = renderHook(() => useBreakpoint());
        await flushFrame();
        expect(result.current.isPhone).toBe(isPhone);
      });
    }

    it('isShortViewport catches the landscape phone that width misses', async () => {
      setCoarsePointer(true);
      setViewport(844, 390);
      const { result } = renderHook(() => useBreakpoint());
      await flushFrame();
      expect(result.current.isMobile, 'width says this is not mobile').toBe(false);
      expect(result.current.isShortViewport, 'height says the screen is small').toBe(true);
      expect(result.current.isPhone).toBe(true);
    });

    it('is exactly "coarse pointer AND short edge below sm"', async () => {
      for (const [width, height] of [[390, 844], [844, 390], [1024, 768], [768, 1024], [320, 480]]) {
        setCoarsePointer(true);
        setViewport(width, height);
        const { result, unmount } = renderHook(() => useBreakpoint());
        await flushFrame();
        expect(result.current.isPhone, `${width}x${height}`).toBe(
          Math.min(width, height) < BREAKPOINTS.sm
        );
        unmount();
      }
    });
  });
});

// -------------------------------------------------------------------------
// GUARD — the thing that stops this regressing.
// -------------------------------------------------------------------------

/**
 * Walk src/ and collect every .ts/.tsx file except the breakpoint module
 * itself and test files.
 */
function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      collectSourceFiles(full, out);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    if (/\.(test|spec)\.tsx?$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

describe('breakpoint single source of truth', () => {
  const root = process.cwd();
  const srcDir = join(root, 'src');
  const breakpointModule = ['src', 'hooks', 'useBreakpoint.ts'].join(sep);

  // `something.width < 900`, `windowWidth >= 768`, `innerWidth < 640`, and the
  // reversed `640 > width` form. Bounded to plausible viewport pixel values so
  // canvas/sample/buffer arithmetic is not caught.
  const PATTERNS = [
    /\b[\w$]*[Ww]idth\s*(?:<=?|>=?)\s*(\d{3,4})\b/g,
    /\b(\d{3,4})\s*(?:<=?|>=?)\s*[\w$.]*[Ww]idth\b/g,
    // A width media query written in TS/TSX is a breakpoint definition too.
    /\(\s*(?:min|max)-width\s*:/g,
  ];

  const isPlausibleViewport = (raw: string | undefined): boolean => {
    if (raw === undefined) return true; // media-query pattern has no capture
    const px = Number(raw);
    return px >= 320 && px <= 1920;
  };

  it('no second width-threshold definition exists outside useBreakpoint.ts', () => {
    const offenders: string[] = [];

    for (const file of collectSourceFiles(srcDir)) {
      const rel = relative(root, file);
      if (rel === breakpointModule) continue;

      const source = readFileSync(file, 'utf8');

      for (const pattern of PATTERNS) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(source)) !== null) {
          if (!isPlausibleViewport(match[1])) continue;
          const line = source.slice(0, match.index).split('\n').length;
          offenders.push(`${rel.split(sep).join('/')}:${line}  ${match[0]}`);
        }
      }
    }

    expect(
      offenders,
      'A width threshold was defined outside src/hooks/useBreakpoint.ts. ' +
        '"Mobile" had four disagreeing definitions before Phase 0 of ' +
        'thoughts/shared/plans/2026-09-22-responsive-mobile.md; adding a fifth ' +
        'is how that comes back. Add the threshold to BREAKPOINTS (and to the ' +
        'matching `screens` key in tailwind.config.js) and read it from the ' +
        'hook instead:\n' +
        offenders.join('\n')
    ).toEqual([]);
  }, 30_000);
});

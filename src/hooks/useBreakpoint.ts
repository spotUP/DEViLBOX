/**
 * useBreakpoint - the single source of truth for "how big is the viewport"
 * and "is this a finger".
 *
 * THIS FILE IS THE ONLY PLACE IN `src/` THAT MAY DEFINE A WIDTH THRESHOLD.
 * `src/hooks/__tests__/useBreakpoint.test.tsx` contains a guard test that
 * fails the build if a second `width < <number>` comparison or a
 * `(max-width: ...)` media query appears in any other .ts/.tsx file. If you
 * need a new threshold, add it to BREAKPOINTS below and to the `screens` key
 * in `tailwind.config.js` — the two must stay identical so a Tailwind `md:`
 * and a hook `isTablet` can never disagree.
 *
 * Two DIFFERENT questions live here and must not be conflated:
 *
 *   1. HOW WIDE is the viewport?  -> `breakpoint` / `isMobile` / `isTablet` /
 *      `isDesktop` / `isWide`. Pure geometry. A 500px desktop window is
 *      "mobile" width.
 *   2. IS THIS A PHONE LAYOUT?    -> `isPhone`. Decision D1 of
 *      `thoughts/shared/plans/2026-09-22-responsive-mobile.md`: a coarse
 *      pointer AND a small screen. Width alone is wrong in both directions —
 *      an iPhone in landscape is 844px wide (and 390px tall), and a 900px
 *      desktop window is not a phone.
 *
 * `useIsTouchDevice` below is a THIRD question again — device capability
 * (`ontouchstart`), true on touch-capable laptops. It must never be used for
 * sizing.
 */

import { useState, useEffect, useMemo } from 'react';

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

export interface BreakpointState {
  /** Width band: mobile (< sm) / tablet (< lg) / desktop. */
  breakpoint: Breakpoint;
  /** Viewport width is below `sm`. Geometry only — NOT "is this a phone". */
  isMobile: boolean;
  /** Viewport width is between `sm` and `lg`. */
  isTablet: boolean;
  /** Viewport width is `lg` or wider. */
  isDesktop: boolean;
  /** Viewport width is `wide` (900px) or wider — enough room for a side panel. */
  isWide: boolean;
  /** Viewport width in CSS pixels. */
  width: number;
  /** Viewport height in CSS pixels. */
  height: number;
  /** `matchMedia('(pointer: coarse)')` — the primary input device is a finger. */
  isCoarsePointer: boolean;
  /** Viewport height is below `sm`. The case a width test misses: a phone in landscape. */
  isShortViewport: boolean;
  /**
   * Decision D1 — the ONE signal that decides phone layout.
   * A coarse pointer AND a small screen, where "small" means the viewport's
   * SHORT edge is below `sm`. Equivalent to
   * `isCoarsePointer && Math.min(width, height) < BREAKPOINTS.sm`.
   */
  isPhone: boolean;
}

/**
 * The breakpoint scale. Mirrored exactly by `theme.screens` in
 * `tailwind.config.js`. `sm`/`md`/`lg`/`xl`/`2xl` are Tailwind's stock
 * values; `wide` is the app's own, and was previously an unnamed
 * `windowWidth >= 900` literal in `TrackerView.tsx`.
 */
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  wide: 900,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

/** Media query for a coarse (finger / stylus) primary pointer. */
export const COARSE_POINTER_QUERY = '(pointer: coarse)';

/**
 * Get the current breakpoint based on window width
 */
function getBreakpoint(width: number): Breakpoint {
  if (width < BREAKPOINTS.sm) return 'mobile';
  if (width < BREAKPOINTS.lg) return 'tablet';
  return 'desktop';
}

/**
 * Hook for responsive breakpoint detection
 * Returns breakpoint info and boolean flags for each device type
 */
export function useBreakpoint(): BreakpointState {
  // SSR-safe initial state (default to desktop)
  const [size, setSize] = useState<{ width: number; height: number }>(() => {
    if (typeof window !== 'undefined') {
      return { width: window.innerWidth, height: window.innerHeight };
    }
    return { width: 1024, height: 768 }; // Default to desktop for SSR
  });

  // Input type is a separate question from size, and answered by the platform
  // rather than by arithmetic. Re-renders only when the pointer type changes.
  const isCoarsePointer = useMediaQuery(COARSE_POINTER_QUERY);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const read = () => ({ width: window.innerWidth, height: window.innerHeight });

    // Update size on next frame to avoid sync setState in effect
    requestAnimationFrame(() => setSize(read()));

    // Debounced resize handler for performance
    let timeoutId: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setSize(read());
      }, 100);
    };

    window.addEventListener('resize', handleResize);

    // Also listen for orientation change on mobile
    window.addEventListener('orientationchange', handleResize);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  // Memoize the return value to prevent unnecessary re-renders
  return useMemo(() => {
    const { width, height } = size;
    const breakpoint = getBreakpoint(width);
    const isMobile = breakpoint === 'mobile';
    const isShortViewport = height < BREAKPOINTS.sm;
    return {
      breakpoint,
      isMobile,
      isTablet: breakpoint === 'tablet',
      isDesktop: breakpoint === 'desktop',
      isWide: width >= BREAKPOINTS.wide,
      width,
      height,
      isCoarsePointer,
      isShortViewport,
      // D1: a finger AND a small screen. Either edge being small is enough —
      // a phone is small in portrait by width and in landscape by height.
      isPhone: isCoarsePointer && (isMobile || isShortViewport),
    };
  }, [size, isCoarsePointer]);
}

/**
 * Hook that uses matchMedia for more efficient breakpoint detection
 * Only triggers re-render when crossing a breakpoint boundary
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia(query).matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const mediaQuery = window.matchMedia(query);
    requestAnimationFrame(() => setMatches(mediaQuery.matches));

    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Modern API
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
    // Legacy API fallback
    mediaQuery.addListener(handler);
    return () => mediaQuery.removeListener(handler);
  }, [query]);

  return matches;
}

/**
 * Convenience hooks for specific breakpoints
 */
export function useIsMobile(): boolean {
  return useMediaQuery(`(max-width: ${BREAKPOINTS.sm - 1}px)`);
}

export function useIsTablet(): boolean {
  return useMediaQuery(`(min-width: ${BREAKPOINTS.sm}px) and (max-width: ${BREAKPOINTS.lg - 1}px)`);
}

export function useIsDesktop(): boolean {
  return useMediaQuery(`(min-width: ${BREAKPOINTS.lg}px)`);
}

/**
 * The primary pointing device is coarse (a finger or a stylus).
 * This is HALF of the phone-layout signal — see `isPhone` on BreakpointState
 * for the other half. On its own it says nothing about available space.
 */
export function useIsCoarsePointer(): boolean {
  return useMediaQuery(COARSE_POINTER_QUERY);
}

/**
 * Check if device supports touch.
 *
 * CAPABILITY detection, not a layout signal: `ontouchstart` is true on a
 * touch-capable laptop with a mouse attached. Use it to decide whether to
 * ATTACH touch handling; never to decide sizes, densities or which tree to
 * render. Use `isPhone` / `isCoarsePointer` for those.
 */
export function useIsTouchDevice(): boolean {
  const [isTouch] = useState(() => {
    if (typeof window === 'undefined') return false;
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  });

  return isTouch;
}

export default useBreakpoint;

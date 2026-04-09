/**
 * useClickOutside - Shared hook for detecting clicks outside a referenced element.
 *
 * Uses `pointerdown` instead of `mousedown` so that touch and mouse input are
 * handled uniformly (Chrome 55+, including touch-only browsers like Tesla).
 *
 * No rAF guard is needed: the handler is registered in useEffect which runs
 * AFTER the triggering event has finished propagating, so the opening
 * interaction can never reach this listener.
 */

import { useEffect, useRef, type RefObject } from 'react';

interface UseClickOutsideOptions {
  /** Whether the hook is active. Pass `false` to disable (e.g. when a dropdown is closed). */
  enabled?: boolean;
  /** Selector string to skip closing when the click lands inside a matching ancestor.
   *  Defaults to `[data-context-menu]` for portal-rendered context-menu submenus. */
  portalSelector?: string;
}

export function useClickOutside(
  ref: RefObject<Element | null>,
  onClickOutside: () => void,
  options: UseClickOutsideOptions = {},
): void {
  const { enabled = true, portalSelector = '[data-context-menu]' } = options;

  // Keep callback ref stable so the listener always calls the latest version.
  const callbackRef = useRef(onClickOutside);
  callbackRef.current = onClickOutside;

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;

      // Click is inside the ref element — ignore.
      if (ref.current?.contains(target)) return;

      // Click is inside a portal that should be considered "inside" (e.g. submenus).
      if (portalSelector && (target as Element).closest?.(portalSelector)) return;

      callbackRef.current();
    };

    document.addEventListener('pointerdown', handler);

    return () => {
      document.removeEventListener('pointerdown', handler);
    };
  }, [ref, enabled, portalSelector]);
}

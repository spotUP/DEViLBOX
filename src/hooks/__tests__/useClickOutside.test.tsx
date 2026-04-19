/**
 * Tests for useClickOutside — pure DOM hook. No audio, no WASM. CI-safe.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { useRef, type RefObject } from 'react';
import { useClickOutside } from '../useClickOutside';

function firePointerDown(target: EventTarget): void {
  // PointerEvent isn't in every JSDOM-like env; happy-dom has it. Fallback
  // to a generic Event with the right type if not.
  const ev: Event = typeof PointerEvent !== 'undefined'
    ? new PointerEvent('pointerdown', { bubbles: true })
    : new Event('pointerdown', { bubbles: true });
  target.dispatchEvent(ev);
}

function setupDom(): { inside: HTMLElement; outside: HTMLElement; ref: RefObject<HTMLElement | null> } {
  const inside = document.createElement('div');
  const outside = document.createElement('div');
  document.body.appendChild(inside);
  document.body.appendChild(outside);
  const ref: RefObject<HTMLElement | null> = { current: inside };
  return { inside, outside, ref };
}

describe('useClickOutside', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('fires the callback on a click outside the ref element', () => {
    const { outside, ref } = setupDom();
    const onOut = vi.fn();
    renderHook(() => useClickOutside(ref, onOut));

    firePointerDown(outside);
    expect(onOut).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire when the click lands inside the ref element', () => {
    const { inside, ref } = setupDom();
    const child = document.createElement('span');
    inside.appendChild(child);
    const onOut = vi.fn();
    renderHook(() => useClickOutside(ref, onOut));

    firePointerDown(child);
    expect(onOut).not.toHaveBeenCalled();
  });

  it('respects the portalSelector opt-out — clicks inside a portal are ignored', () => {
    const { outside, ref } = setupDom();
    // Mark the outside element as a portal via the default selector.
    outside.setAttribute('data-context-menu', '');
    const onOut = vi.fn();
    renderHook(() => useClickOutside(ref, onOut));

    firePointerDown(outside);
    expect(onOut).not.toHaveBeenCalled();
  });

  it('enabled=false disables the listener entirely', () => {
    const { outside, ref } = setupDom();
    const onOut = vi.fn();
    renderHook(() => useClickOutside(ref, onOut, { enabled: false }));

    firePointerDown(outside);
    expect(onOut).not.toHaveBeenCalled();
  });

  it('unmount removes the pointerdown listener', () => {
    const { outside, ref } = setupDom();
    const onOut = vi.fn();
    const { unmount } = renderHook(() => useClickOutside(ref, onOut));

    unmount();
    firePointerDown(outside);
    expect(onOut).not.toHaveBeenCalled();
  });

  it('uses the latest callback even if it is swapped between renders', () => {
    const { outside, ref } = setupDom();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useClickOutside(ref, cb), {
      initialProps: { cb: first },
    });
    rerender({ cb: second });

    firePointerDown(outside);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

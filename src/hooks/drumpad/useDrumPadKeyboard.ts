/**
 * useDrumPadKeyboard - Keyboard shortcuts for DrumPad view
 *
 * Maps QWERTY keys to pad indices and triggers pads via the DOM
 * (using the same data-pad-id + MouseEvent approach as DrumPadManager).
 */

import { useEffect, useCallback } from 'react';
import { registerViewHandler } from '@/engine/keyboard/KeyboardRouter';
import type { NormalizedKeyEvent } from '@/engine/keyboard/types';
import { useDrumPadStore } from '@/stores/useDrumPadStore';

// QWERTY key → 0-based pad index mapping (16 pads, bank-relative)
const KEY_TO_PAD_INDEX: Record<string, number> = {
  q: 0,  w: 1,  e: 2,  r: 3,
  a: 4,  s: 5,  d: 6,  f: 7,
  z: 8,  x: 9,  c: 10, v: 11,
  t: 12, y: 13, u: 14, i: 15,
};

/**
 * Get the absolute pad ID for a bank-relative index.
 * Banks A-D each contain 16 pads, starting at (bankOffset * 16) + 1.
 */
function getPadId(bankRelativeIndex: number, bank: string): number {
  const bankOffset = ['A', 'B', 'C', 'D'].indexOf(bank);
  const offset = bankOffset >= 0 ? bankOffset * 16 : 0;
  return offset + bankRelativeIndex + 1; // Pads are 1-indexed
}

/**
 * Trigger a pad by dispatching a synthetic mousedown event on its DOM element.
 * This reuses the same path as physical clicks (PadButton onMouseDown → handlePadTrigger).
 */
function triggerPadElement(padId: number, velocity: number): void {
  const padButton = document.querySelector(`[data-pad-id="${padId}"]`) as HTMLElement | null;
  if (!padButton) return;

  const rect = padButton.getBoundingClientRect();
  // Y position encodes velocity: upper area = high, lower area = low
  // High velocity (Shift): use top 20%, Normal: use middle 60%
  const yFraction = velocity >= 100 ? 0.2 : 0.5;
  const mouseDown = new MouseEvent('mousedown', {
    bubbles: true,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height * yFraction,
  });
  padButton.dispatchEvent(mouseDown);
}

function releasePadElement(padId: number): void {
  const padButton = document.querySelector(`[data-pad-id="${padId}"]`) as HTMLElement | null;
  if (!padButton) return;

  const rect = padButton.getBoundingClientRect();
  const mouseUp = new MouseEvent('mouseup', {
    bubbles: true,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height * 0.5,
  });
  padButton.dispatchEvent(mouseUp);
}

export function useDrumPadKeyboard(): void {
  const handleKeyDown = useCallback((_normalized: NormalizedKeyEvent, e: KeyboardEvent): boolean => {
    // Ignore if any modifier keys are held (except Shift for velocity)
    if (e.ctrlKey || e.metaKey || e.altKey) return false;

    const key = e.key.toLowerCase();
    const padIndex = KEY_TO_PAD_INDEX[key];
    if (padIndex === undefined) return false;

    // Prevent key repeat from re-triggering
    if (e.repeat) return true;

    const { currentBank } = useDrumPadStore.getState();
    const padId = getPadId(padIndex, currentBank);
    const velocity = e.shiftKey ? 100 : 80;

    triggerPadElement(padId, velocity);
    return true;
  }, []);

  const handleKeyUp = useCallback((_e: KeyboardEvent): void => {
    const key = _e.key.toLowerCase();
    const padIndex = KEY_TO_PAD_INDEX[key];
    if (padIndex === undefined) return;

    const { currentBank } = useDrumPadStore.getState();
    const padId = getPadId(padIndex, currentBank);
    releasePadElement(padId);
  }, []);

  useEffect(() => {
    const unregister = registerViewHandler('drumpad', handleKeyDown);

    // Register keyup listener for pad release (sustain/hold modes)
    window.addEventListener('keyup', handleKeyUp, { capture: true });
    return () => {
      unregister();
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
    };
  }, [handleKeyDown, handleKeyUp]);
}

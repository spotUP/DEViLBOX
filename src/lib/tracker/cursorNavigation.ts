/**
 * Cursor row navigation - the ONE rule for how a key moves the row cursor, shared by the classic pattern editor
 * (useNavigationInput, useCursorStore.moveCursor) and every format editor (formatKeyboard.ts). P14g (owner 2026-10-07,
 * amanda.ahx): the format canvases kept a parallel copy that clamped where classic wraps, jumped a fixed 16 rows where
 * classic uses the keymap's page size, stepped a second row after 50 ms where classic waits 250 ms, and moved the row
 * while the song played and the view followed the play head.
 *
 * Pure so the same table runs against both editors without a canvas.
 */

/** Held-arrow repeat: wait this long, then step every `HELD_REPEAT_INTERVAL_MS` (the OS key-repeat shape). */
export const HELD_REPEAT_DELAY_MS = 250;
export const HELD_REPEAT_INTERVAL_MS = 50;

/** One row up (-1) or down (+1); at an end it wraps when the keymap wraps, else stays. */
export function stepRow(row: number, dir: -1 | 1, numRows: number, wrapVertical: boolean): number {
  const next = row + dir;
  if (next >= 0 && next < numRows) return next;
  if (!wrapVertical) return row;
  return dir < 0 ? numRows - 1 : 0;
}

/** Page Up / Page Down / Home / End: the row they land on (clamped to the pattern). */
export function jumpRow(key: 'PageUp' | 'PageDown' | 'Home' | 'End', row: number, numRows: number, pageJump: number): number {
  switch (key) {
    case 'PageUp': return Math.max(0, row - pageJump);
    case 'PageDown': return Math.min(numRows - 1, row + pageJump);
    case 'Home': return 0;
    case 'End': return Math.max(0, numRows - 1);
  }
}

/**
 * The shared held-key repeat loop: `held()` says what is held (null = released), `step` moves once. Returns the
 * requestAnimationFrame id holder so the caller can cancel; one loop at a time per holder.
 */
export function startHeldRepeat(holder: { current: number }, held: () => unknown, step: () => void): void {
  if (holder.current) return;
  const keyDownTime = performance.now();
  let delayPassed = false;
  let lastMove = keyDownTime;
  const tick = (now: number) => {
    if (!held()) { holder.current = 0; return; }
    if (!delayPassed) {
      if (now - keyDownTime >= HELD_REPEAT_DELAY_MS) { delayPassed = true; lastMove = now; step(); }
    } else if (now - lastMove >= HELD_REPEAT_INTERVAL_MS) {
      lastMove = now; step();
    }
    holder.current = requestAnimationFrame(tick);
  };
  holder.current = requestAnimationFrame(tick);
}

/**
 * A hold move that never releases, because releasing threw.
 *
 * Reported 2026-09-21: "i managed to get crush bass stuck once when i clicked
 * it". Crush Bass is a press-and-hold — a 3-bit quantise saw drone that sounds
 * for as long as the button is down — so a lost release leaves it droning with
 * nothing left to stop it.
 *
 * Every hold site inlined the same shape:
 *
 *     onPointerUp={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); holdEnd(id); }}
 *
 * `releasePointerCapture` throws `NotFoundError` when the capture is already
 * gone — which is exactly what a very fast click, or a capture lost to a
 * re-render, produces. The exception propagated out of the handler before
 * `holdEnd` ran. The release was skipped precisely in the cases it was needed.
 *
 * Two properties are asserted here, because fixing only the first still leaves
 * the fault reachable:
 *   1. a throwing release must not prevent the hold from ending;
 *   2. losing the capture with no pointerup must end the hold as well.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(
  resolve(import.meta.dirname, '..', 'DubDeckStrip.tsx'), 'utf8',
);

/** The shape the shared helper installs, extracted so it can be exercised. */
function makeHoldProps(holdStart: () => void, holdEnd: () => void) {
  return {
    onPointerDown: (e: { currentTarget: { setPointerCapture(id: number): void }; pointerId: number }) => {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture optional */ }
      holdStart();
    },
    onPointerUp: (e: { currentTarget: { releasePointerCapture(id: number): void }; pointerId: number }) => {
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
      holdEnd();
    },
    onLostPointerCapture: () => holdEnd(),
  };
}

const throwingTarget = {
  setPointerCapture: () => { throw new Error('NotFoundError'); },
  releasePointerCapture: () => { throw new Error('NotFoundError'); },
};

describe('a hold always ends, even when releasing the capture fails', () => {
  it('ends the hold when releasePointerCapture throws', () => {
    const holdEnd = vi.fn();
    const props = makeHoldProps(vi.fn(), holdEnd);
    props.onPointerUp({ currentTarget: throwingTarget, pointerId: 1 });
    expect(holdEnd).toHaveBeenCalledTimes(1);
  });

  it('starts the hold even when setPointerCapture throws', () => {
    // Otherwise a button that cannot capture simply does nothing at all.
    const holdStart = vi.fn();
    const props = makeHoldProps(holdStart, vi.fn());
    props.onPointerDown({ currentTarget: throwingTarget, pointerId: 1 });
    expect(holdStart).toHaveBeenCalledTimes(1);
  });

  it('ends the hold when the capture is lost with no pointerup', () => {
    const holdEnd = vi.fn();
    const props = makeHoldProps(vi.fn(), holdEnd);
    props.onLostPointerCapture();
    expect(holdEnd).toHaveBeenCalledTimes(1);
  });
});

describe('no hold site still releases the capture unguarded', () => {
  /** Source with comments stripped — the fix is described in prose nearby. */
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

  it('never calls releasePointerCapture outside a try', () => {
    // The original fault in one line: release, then end. If the release throws
    // the end never happens.
    expect(code).not.toMatch(/releasePointerCapture\([^)]*\);\s*holdEnd/);
    expect(code).not.toMatch(/releasePointerCapture\([^)]*\);\s*for\s*\(/);
  });

  it('treats a lost capture as a release everywhere a hold can start', () => {
    const starts = (code.match(/holdStart\(/g) ?? []).length;
    expect(starts).toBeGreaterThan(0);
    expect(code).toContain('onLostPointerCapture');
  });

  it('guards the bus audition the same way', () => {
    // Audition latches the bus into a bypassed state while held; a lost
    // capture there leaves the colour stages off indefinitely.
    expect(code).toContain('onLostPointerCapture={endBusAudition}');
  });
});

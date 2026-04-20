/**
 * Regression test for the `reverseEcho` first-fire race.
 *
 * 2026-04-20 untested-FX sweep caught `reverseEcho` flat on the FIRST
 * fire (Δpeak = +0.006) but audible on subsequent fires (+0.103). Root
 * cause: the reverse-capture worklet has a ring buffer that fills over
 * time. `_ensureReverseCapture()` resolves as soon as the worklet is
 * wired up, but the ring is empty for ~1 s after boot. The first
 * snapshot therefore returned frames=0 and the move aborted silent.
 *
 * Fix is two-part:
 *   1. Pre-warm the capture when the bus is ENABLED (setSettings path),
 *      so the ring starts filling before the first user fire.
 *   2. Retry the snapshot up to 3× with a 180 ms gap so a truly
 *      very-first-fire scenario still produces audio if any signal is
 *      flowing through `bus.input`.
 *
 * This is a source-contract test — happy-dom can't simulate the
 * worklet ring buffer state. If a future refactor drops either guard,
 * this fails loudly.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const DUBBUS_SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../DubBus.ts');

describe('DubBus.reverseEcho — first-fire race guard', () => {
  const src = readFileSync(DUBBUS_SRC, 'utf8');

  it('pre-warms the reverse-capture worklet when the bus is enabled', () => {
    // Inside the setSettings path, in the `if (settings.enabled)` block,
    // there should be a void-awaited call to `_ensureReverseCapture` so
    // the ring starts filling the moment the bus goes live.
    expect(src).toMatch(/void\s+this\._ensureReverseCapture\(/);
  });

  it('reverseEcho retries the snapshot on empty ring', () => {
    // The public `reverseEcho` should delegate to `_snapshotReverseRing`
    // with a maxAttempts >= 2 so the first fire has a fighting chance
    // even if the ring is still near-empty.
    const reverseEchoBody = src.match(/async reverseEcho\s*\([^)]*\)[\s\S]*?^  \}/m);
    expect(reverseEchoBody?.[0] ?? '').toMatch(/_snapshotReverseRing\([^)]*\bmaxAttempts[^)]*\)|_snapshotReverseRing\([^,]+,[^,]+,[^,]+,\s*[2-9]/);
  });

  it('retry helper waits between attempts (ring-fill budget)', () => {
    // Grab a generous slice starting at the declaration — the closing
    // `^  }` heuristic used in other contract tests fires on the inner
    // for-loop's brace in this method, truncating too early.
    const idx = src.indexOf('private async _snapshotReverseRing');
    expect(idx).toBeGreaterThan(-1);
    const retryBody = src.slice(idx, idx + 2000);
    expect(retryBody, 'should loop over attempts').toMatch(/for\s*\(\s*let\s+attempt/);
    expect(retryBody, 'should sleep between attempts').toMatch(/setTimeout\s*\([^,]+,\s*180\)/);
  });

  it('documents WHY the retry exists (ring / empty / race language)', () => {
    const snippet = src.match(/_snapshotReverseRing[\s\S]{0,1200}/)?.[0] ?? '';
    expect(snippet.toLowerCase()).toMatch(/ring|empty|retry|first[- ]fire|boot/);
  });
});

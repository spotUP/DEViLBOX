/**
 * A dub send that moves the fader, updates the store, ramps its gain — and is
 * not heard, for the rest of the session.
 *
 * Measured live on 2026-09-21 with jennipha.ahx playing. Channels 2 and 3 held
 * sends of 0.5 and 0.15, both had a tap registered with the bus, and the
 * worklet's own `dubChannelEnabled` was false for both. Writing a DIFFERENT
 * value to channel 3 (0.15 → 0.4) changed nothing. Taking it to 0 and back to
 * 0.4 brought it straight back, and `activeChannels` went [0,1] → [0,1,3].
 *
 * `DubChannelLifecycle.active` records what the WORKLET has enabled, and a song
 * load gives the engine a worklet with none of it. The record survived, so
 * `setDesired(ch, true)` saw want === active, returned 'none', and the enable
 * was never re-posted. Only a transition through zero could clear the record,
 * which is why a send that had never been closed stayed dead.
 *
 * `rebuildDubConnections` is the rebuild's entry point, so that is where the
 * belief has to be dropped — and before its early returns, because the case
 * where no engine is available yet is exactly the one that otherwise leaves the
 * stale record in place for the next send write to trip over.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DubChannelLifecycle } from '@/lib/dub/dubChannelLifecycle';

const ROUTED = readFileSync(
  resolve(import.meta.dirname, '..', 'ChannelRoutedEffects.ts'),
  'utf8',
);

function rebuildBody(): string {
  const at = ROUTED.indexOf('async rebuildDubConnections');
  expect(at, 'rebuildDubConnections not found').toBeGreaterThan(-1);
  return ROUTED.slice(at, at + 4000);
}

describe('a rebuild forgets what the old worklet had enabled', () => {
  it('clears the lifecycle inside rebuildDubConnections', () => {
    expect(rebuildBody()).toContain('this.dubLifecycle.clear()');
  });

  it('clears it before any early return, not after', () => {
    const body = rebuildBody();
    const clear = body.indexOf('this.dubLifecycle.clear()');
    // The first return that gives up on a missing engine or worklet.
    const engineGuard = body.indexOf("if (!engine?.isAvailable()) return;");
    const workletGuard = body.indexOf('if (!worklet) return;');
    expect(engineGuard, 'engine guard not found').toBeGreaterThan(-1);
    expect(workletGuard, 'worklet guard not found').toBeGreaterThan(-1);
    expect(clear).toBeLessThan(engineGuard);
    expect(clear).toBeLessThan(workletGuard);
  });
});

describe('the lifecycle contract the fix relies on', () => {
  it('refuses to re-activate a channel it still believes is active', () => {
    // This is the behaviour that made the send dead — correct in itself, which
    // is why the fix belongs at the rebuild, not here.
    const lc = new DubChannelLifecycle();
    lc.setDesired(1, true);
    lc.begin(1);
    lc.finish(1, true);
    expect(lc.setDesired(1, true)).toBe('none');
  });

  it('activates again once the rebuild has cleared the record', () => {
    const lc = new DubChannelLifecycle();
    lc.setDesired(1, true);
    lc.begin(1);
    lc.finish(1, true);
    lc.clear();
    expect(lc.setDesired(1, true)).toBe('activate');
  });

  it('still reconciles through zero, the only route that used to work', () => {
    const lc = new DubChannelLifecycle();
    lc.setDesired(2, true);
    lc.begin(2);
    lc.finish(2, true);
    expect(lc.setDesired(2, false)).toBe('deactivate');
    lc.begin(2);
    lc.finish(2, false);
    expect(lc.setDesired(2, true)).toBe('activate');
  });
});

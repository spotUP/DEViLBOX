/**
 * X15 — the dub slot that a short throw leaks.
 *
 * Reported as a symptom in the AutoDub fire log on 2026-09-18:
 * `registeredChannelTaps` climbed 0 -> 1 -> 2 -> 3 -> 4 across one session and
 * never fell, even though every fire had a matching release and `activeHolds`
 * returned to zero each time. One leaked tap is one leaked libopenmpt module
 * instance plus its malloc'd buffers, held for the life of the page.
 *
 * Cause: opening a cold channel's dub send is asynchronous and a throw is
 * short, so the close routinely arrives mid-activation. The close read a
 * single "active" flag that activation only sets at the END of its work, saw
 * false, and concluded there was nothing to tear down. The activation then
 * finished into a slot nobody would ever close.
 *
 * These tests drive that ordering directly.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DubChannelLifecycle } from '../dubChannelLifecycle';

describe('X15 — a throw that closes before its own activation finishes', () => {
  it('tears the slot down once the activation lands', () => {
    const lc = new DubChannelLifecycle();

    // Throw opens a cold channel.
    expect(lc.setDesired(3, true)).toBe('activate');
    lc.begin(3);

    // 250 ms later the throw releases — activation is still in flight, so
    // nothing is dispatched yet, but the intent is recorded.
    expect(lc.setDesired(3, false)).toBe('none');

    // Activation completes. THIS is the moment the old code lost: the slot is
    // now real and unwanted, and someone has to say so.
    expect(lc.finish(3, true)).toBe('deactivate');
  });

  it('leaves nothing active once that deactivation completes', () => {
    const lc = new DubChannelLifecycle();
    lc.setDesired(3, true);
    lc.begin(3);
    lc.setDesired(3, false);
    lc.finish(3, true);

    lc.begin(3);
    expect(lc.finish(3, false)).toBe('none');
    expect(lc.isActive(3)).toBe(false);
    expect(lc.activeChannels()).toEqual([]);
  });

  it('does not leak across four throws, which is what the log showed', () => {
    const lc = new DubChannelLifecycle();
    for (const ch of [1, 3, 0, 2]) {
      lc.setDesired(ch, true);
      lc.begin(ch);
      lc.setDesired(ch, false);          // released mid-activation
      const action = lc.finish(ch, true);
      expect(action).toBe('deactivate');
      lc.begin(ch);
      lc.finish(ch, false);
    }
    expect(lc.activeChannels()).toEqual([]);
  });
});

describe('X15 — an async step can ask whether it is still wanted', () => {
  it('reports the intent as it stands, not as it was at dispatch', () => {
    const lc = new DubChannelLifecycle();
    lc.setDesired(1, true);
    lc.begin(1);
    expect(lc.isDesired(1)).toBe(true);
    lc.setDesired(1, false);
    expect(lc.isDesired(1)).toBe(false);
  });
});

describe('X15 — a re-open during the close is honoured, not dropped', () => {
  it('re-activates when the send comes back up mid-teardown', () => {
    const lc = new DubChannelLifecycle();
    lc.setDesired(2, true);
    lc.begin(2);
    lc.finish(2, true);

    expect(lc.setDesired(2, false)).toBe('deactivate');
    lc.begin(2);
    expect(lc.setDesired(2, true)).toBe('none');   // in flight
    expect(lc.finish(2, false)).toBe('activate');  // reconciled on landing
  });
});

describe('X15 — no work invented where none is needed', () => {
  it('a send opened and left open dispatches once', () => {
    const lc = new DubChannelLifecycle();
    expect(lc.setDesired(0, true)).toBe('activate');
    lc.begin(0);
    expect(lc.finish(0, true)).toBe('none');
    expect(lc.setDesired(0, true)).toBe('none');
  });

  it('closing a channel that was never open does nothing', () => {
    const lc = new DubChannelLifecycle();
    expect(lc.setDesired(0, false)).toBe('none');
  });

  it('an activation that fails leaves the channel closed, not half-open', () => {
    const lc = new DubChannelLifecycle();
    lc.setDesired(4, true);
    lc.begin(4);
    // No engine yet — the attempt wires nothing.
    expect(lc.finish(4, false)).toBe('activate');   // still wanted, try again
    lc.begin(4);
    expect(lc.finish(4, true)).toBe('none');
    expect(lc.isActive(4)).toBe(true);
  });
});

describe('X15 — forgetting a channel whose wiring is gone', () => {
  it('asks for no teardown, because there is nothing left to tear down', () => {
    const lc = new DubChannelLifecycle();
    lc.setDesired(5, true);
    lc.begin(5);
    lc.finish(5, true);

    lc.forget(5);
    expect(lc.isActive(5)).toBe(false);
    expect(lc.isDesired(5)).toBe(false);
    expect(lc.setDesired(5, false)).toBe('none');
  });

  it('clear() drops every channel at once', () => {
    const lc = new DubChannelLifecycle();
    for (const ch of [0, 1, 2]) { lc.setDesired(ch, true); lc.begin(ch); lc.finish(ch, true); }
    lc.clear();
    expect(lc.activeChannels()).toEqual([]);
  });
});

/**
 * Reachability: the bookkeeping above is worthless unless the manager that
 * owns the worklet slots actually routes through it.
 */
describe('X15 wiring contract — ChannelRoutedEffects drives the lifecycle', () => {
  const src = readFileSync(
    join(__dirname, '..', '..', '..', 'engine', 'tone', 'ChannelRoutedEffects.ts'), 'utf8',
  );

  it('keeps no private active flag of its own to go stale', () => {
    expect(src).not.toContain('channelDubActive');
    expect(src).toContain('private dubLifecycle = new DubChannelLifecycle()');
  });

  it('records the intent through the lifecycle on every send write', () => {
    expect(src).toContain('this.dubLifecycle.setDesired(channelIndex, shouldBeActive)');
  });

  it('marks the transition and reconciles when it lands', () => {
    expect(src).toContain('this.dubLifecycle.begin(channelIndex)');
    expect(src).toContain("this.dubLifecycle.finish(channelIndex, outcome === 'wired')");
    expect(src).toContain('this.dubLifecycle.finish(channelIndex, false)');
  });

  it('abandons an activation whose send closed while it was awaiting', () => {
    expect(src).toContain("if (!this.dubLifecycle.isDesired(channelIndex)) return 'cancelled';");
  });

  it('cancels the deferred 500 ms retry when the send closes', () => {
    expect(src).toMatch(/if \(!shouldBeActive\) \{[\s\S]{0,240}channelDubPendingActivation\.delete\(channelIndex\)/);
  });
});

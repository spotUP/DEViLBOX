/**
 * X5 — riding the dub send is a gesture, and it was the one gesture that
 * could be performed but never recorded.
 *
 * Reported 2026-09-17: "discrete moves record fine; a continuous fader ride
 * captures nothing". The cause was that there was nothing to subscribe to —
 * `DubRecorder` listens to the router's fire and release streams, and
 * `setChannelDubSend` wrote audio and zustand state and stopped. These cover
 * the stream that was missing, the thinning that makes a 60-per-second ride
 * into an editable curve, and the loop that would otherwise form when a
 * recorded ride plays back.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  subscribeChannelSend,
  publishChannelSend,
  resetChannelSendListeners,
  type ChannelSendWrite,
} from '../channelSendStream';

function write(over: Partial<ChannelSendWrite> = {}): ChannelSendWrite {
  return { channelId: 1, value: 0.5, row: 4, source: 'live', ...over };
}

beforeEach(() => resetChannelSendListeners());
afterEach(() => resetChannelSendListeners());

describe('the stream that was missing', () => {
  it('hands a write to a subscriber', () => {
    const seen: ChannelSendWrite[] = [];
    subscribeChannelSend(w => seen.push(w));
    publishChannelSend(write({ value: 0.8 }));
    expect(seen).toHaveLength(1);
    expect(seen[0].value).toBe(0.8);
  });

  it('carries the row, so a ride sits on the same timeline as the moves', () => {
    const seen: ChannelSendWrite[] = [];
    subscribeChannelSend(w => seen.push(w));
    publishChannelSend(write({ row: 12.5 }));
    expect(seen[0].row).toBe(12.5);
  });

  it('stops delivering after unsubscribe', () => {
    const seen: ChannelSendWrite[] = [];
    const off = subscribeChannelSend(w => seen.push(w));
    publishChannelSend(write());
    off();
    publishChannelSend(write());
    expect(seen).toHaveLength(1);
  });

  it('one bad listener does not cost the others their write', () => {
    const seen: number[] = [];
    subscribeChannelSend(() => { throw new Error('listener exploded'); });
    subscribeChannelSend(() => { seen.push(1); });
    expect(() => publishChannelSend(write())).not.toThrow();
    expect(seen).toEqual([1]);
  });

  it('publishing with nobody listening is free and silent', () => {
    expect(() => publishChannelSend(write())).not.toThrow();
  });
});

/**
 * The thinning rule, run against the recorder's own constants. A ride arrives
 * at roughly 60 writes a second; transcribing every one gives a lane nobody
 * can edit and a file full of points describing a curve three would describe.
 */
describe('a ride is thinned into a curve, not transcribed', () => {
  const recorder = readFileSync(
    join(__dirname, '..', '..', '..', 'engine', 'dub', 'DubRecorder.ts'), 'utf8',
  );
  const EPS = Number(/SEND_POINT_EPSILON = ([\d.]+)/.exec(recorder)?.[1]);
  const GAP = Number(/SEND_POINT_MAX_ROW_GAP = ([\d.]+)/.exec(recorder)?.[1]);

  /** The recorder's rule, stated once so the thresholds cannot drift apart. */
  function keeps(prev: { row: number; value: number } | null, next: { row: number; value: number }): boolean {
    if (!prev) return true;
    return Math.abs(next.value - prev.value) >= EPS || (next.row - prev.row) >= GAP;
  }

  it('has thresholds fine enough to be inaudible', () => {
    expect(EPS).toBeGreaterThan(0);
    expect(EPS).toBeLessThanOrEqual(0.02);     // under a fiftieth of the travel
    expect(GAP).toBeLessThanOrEqual(0.25);     // under a quarter row
  });

  it('keeps the first point of a ride', () => {
    expect(keeps(null, { row: 0, value: 0 })).toBe(true);
  });

  it('drops a jitter smaller than the ear can follow', () => {
    expect(keeps({ row: 4, value: 0.5 }, { row: 4.01, value: 0.5005 })).toBe(false);
  });

  it('keeps a real movement', () => {
    expect(keeps({ row: 4, value: 0.5 }, { row: 4.01, value: 0.62 })).toBe(true);
  });

  it('keeps a point anyway when a slow ride would otherwise draw a straight line', () => {
    // Creeping upward: below the value threshold every frame, but the gap
    // rule takes a point so the replayed curve follows the hand.
    expect(keeps({ row: 4, value: 0.5 }, { row: 4.2, value: 0.502 })).toBe(true);
  });

  it('turns a full second of 60 Hz jitter into almost nothing', () => {
    let prev: { row: number; value: number } | null = null;
    let kept = 0;
    for (let i = 0; i < 60; i++) {
      const point = { row: i * 0.02, value: 0.5 + (i % 2) * 0.001 };
      if (keeps(prev, point)) { kept++; prev = point; }
    }
    expect(kept).toBeLessThan(15);
  });

  it('keeps enough of a real sweep to replay it', () => {
    let prev: { row: number; value: number } | null = null;
    let kept = 0;
    for (let i = 0; i <= 60; i++) {
      const point = { row: i * 0.02, value: i / 60 };
      if (keeps(prev, point)) { kept++; prev = point; }
    }
    expect(kept).toBeGreaterThan(20);
  });
});

describe('wiring contract — the ride is captured, replayed, and not re-captured', () => {
  const store = readFileSync(
    join(__dirname, '..', '..', '..', 'stores', 'useMixerStore.ts'), 'utf8',
  );
  const recorder = readFileSync(
    join(__dirname, '..', '..', '..', 'engine', 'dub', 'DubRecorder.ts'), 'utf8',
  );
  const router = readFileSync(
    join(__dirname, '..', '..', '..', 'midi', 'performance', 'parameterRouter.ts'), 'utf8',
  );
  const player = readFileSync(
    join(__dirname, '..', '..', '..', 'engine', 'AutomationPlayer.ts'), 'utf8',
  );

  it('the store publishes every user write', () => {
    expect(store).toContain('publishChannelSend');
    expect(store).toContain("row: getCurrentRow()");
  });

  it('the store does NOT publish a move borrowing the send', () => {
    // A transient is already recorded as the move that made it; recording it
    // again here would write a second, contradictory account of one gesture.
    expect(store).toMatch(/if \(!opts\?\.transient\) \{[\s\S]{0,400}publishChannelSend/);
  });

  it('the recorder subscribes alongside fire and release, not beside them', () => {
    expect(recorder).toContain('subscribeChannelSend');
    expect(recorder).toContain('unsubSend()');
  });

  it('the recorder ignores writes that came from playback', () => {
    expect(recorder).toMatch(/write\.source !== 'live'/);
  });

  it('the send curve interpolates, so a ride does not replay as a staircase', () => {
    expect(recorder).toContain("mode: 'curve', interpolation: 'linear'");
  });

  it('the router turns the parameter back into a fader move', () => {
    expect(router).toContain("const CHANNEL_SEND_PREFIX = 'dub.channelSend.ch'");
    expect(router).toContain('setChannelDubSend(ch, value, { source })');
  });

  it('playback addresses the send by channel, like a per-channel move', () => {
    expect(player).toContain("shortDubName === 'channelSend'");
  });

  it('playback tags per-channel dub curves as lane, closing the capture loop', () => {
    // Before this, a per-channel dub curve replayed as a LIVE gesture and the
    // recorder captured it again on every pass — one take growing a copy of
    // itself each time round the pattern.
    expect(player).toContain("routeParameterToEngine(addressed, value, undefined, 'lane')");
  });
});

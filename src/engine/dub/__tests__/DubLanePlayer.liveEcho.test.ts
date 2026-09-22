import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * A move the user plays live must not be replayed by the lane on the same row.
 *
 * The recorder captures a live fire by writing a point at the row being
 * played, and the scanner folds it into the lane immediately — so the lane
 * player's cursor reaches it on the SAME pass and fires it again. Measured
 * 2026-09-22 with AutoDub OFF, so the existing `liveDubPerformerActive()`
 * guard (which only knows about AutoDub) never engaged:
 *
 *     [DubRouter] reverseEcho source=live origin=user
 *     [DubBus] reverseEcho snapshot received — frames=19200 peak=0.25115
 *     [DubRouter] reverseEcho source=lane origin=lane
 *     [DubBus] reverseEcho snapshot received — frames=19200 peak=0.29364
 *
 * Reported as "throw backwards and reverser really do seem broken or hardly
 * hearable": for a capture-and-play move the second fire restarts the capture
 * before the first reversed buffer has played out, so instead of sounding
 * twice it barely sounds at all.
 */

type Sub = (e: Record<string, unknown>) => void;

// `vi.mock` is hoisted above every const in this file, so the factory's
// captures have to be hoisted with it.
const { fired, subscribers } = vi.hoisted(() => ({
  fired: [] as string[],
  subscribers: [] as Array<(e: Record<string, unknown>) => void>,
}));

vi.mock('../DubRouter', () => ({
  fire: (moveId: string) => { fired.push(moveId); return null; },
  subscribeDubRouter: (fn: Sub) => { subscribers.push(fn); return () => {}; },
}));

import { DubLanePlayer, __resetLiveEchoSuppression } from '../DubLanePlayer';

const lane = (events: Array<Record<string, unknown>>) =>
  ({ kind: 'row', enabled: true, events } as never);

/** Simulate DubRouter announcing a fire. */
const announce = (e: Record<string, unknown>) => { for (const fn of subscribers) fn(e); };

beforeEach(() => {
  fired.length = 0;
  __resetLiveEchoSuppression();
  (globalThis as { __devilboxDubStore?: unknown }).__devilboxDubStore = {
    getState: () => ({ autoDubEnabled: false }),
  };
});

describe('the lane does not echo the hand that just played', () => {
  it('skips a lane event the user fired live on that row', () => {
    const player = new DubLanePlayer();
    player.setLane(lane([{ id: 'e1', row: 4, moveId: 'reverseEcho' }]));

    announce({ source: 'live', origin: 'user', moveId: 'reverseEcho', row: 4 });
    player.onTick(4);

    expect(fired, 'the lane replayed the move the user had just played').toEqual([]);
  });

  it('still plays a lane event the user did not fire', () => {
    const player = new DubLanePlayer();
    player.setLane(lane([{ id: 'e1', row: 4, moveId: 'backwardReverb' }]));

    announce({ source: 'live', origin: 'user', moveId: 'reverseEcho', row: 4 });
    player.onTick(4);

    expect(fired).toEqual(['backwardReverb']);
  });

  it('suppression is per row — the same move one row later still plays', () => {
    const player = new DubLanePlayer();
    player.setLane(lane([
      { id: 'e1', row: 4, moveId: 'reverseEcho' },
      { id: 'e2', row: 5, moveId: 'reverseEcho' },
    ]));

    announce({ source: 'live', origin: 'user', moveId: 'reverseEcho', row: 4 });
    player.onTick(4);
    expect(fired).toEqual([]);

    player.onTick(5);
    expect(fired, 'a later recorded move is a recording, not an echo').toEqual(['reverseEcho']);
  });

  it('consumes one record per fire, so a genuine double on one row still doubles', () => {
    const player = new DubLanePlayer();
    player.setLane(lane([
      { id: 'e1', row: 4, moveId: 'reverseEcho' },
      { id: 'e2', row: 4, moveId: 'reverseEcho' },
    ]));

    // The user played it ONCE; the lane holds two.
    announce({ source: 'live', origin: 'user', moveId: 'reverseEcho', row: 4 });
    player.onTick(4);

    expect(fired).toEqual(['reverseEcho']);
  });

  it('a per-channel move is matched by channel, not just by name', () => {
    const player = new DubLanePlayer();
    player.setLane(lane([{ id: 'e1', row: 4, moveId: 'channelThrow', channelId: 2 }]));

    // Played live on a DIFFERENT channel — not the same gesture.
    announce({ source: 'live', origin: 'user', moveId: 'channelThrow', channelId: 0, row: 4 });
    player.onTick(4);

    expect(fired).toEqual(['channelThrow']);
  });

  it('a lane fire never registers as a live fire', () => {
    const player = new DubLanePlayer();
    player.setLane(lane([{ id: 'e1', row: 4, moveId: 'reverseEcho' }]));

    announce({ source: 'lane', origin: 'lane', moveId: 'reverseEcho', row: 4 });
    player.onTick(4);

    expect(fired).toEqual(['reverseEcho']);
  });
});

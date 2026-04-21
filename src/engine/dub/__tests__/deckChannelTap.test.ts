/**
 * Deck-scoped channel tap routing on DubBus + DubRouter deckId threading.
 *
 * Guards the audio-layer wiring added for DJ per-channel FX targeting:
 *
 *   1. `registerDeckChannelTap` / `unregisterDeckChannelTap` maintain the
 *      deckChannelTaps map keyed by `${deckId}:${ch}`, independent of the
 *      tracker-view `channelTaps` map — two decks can own "channel 3"
 *      without colliding, and the tracker view can own its own channel 3
 *      simultaneously.
 *
 *   2. `openChannelTap(ch, amt, atk, { deckId })` modulates the deck-scoped
 *      gain (not the tracker-view tap) when a deckId is present in ctx.
 *
 *   3. `openChannelTap(ch, amt, atk)` (no ctx) keeps today's tracker-view
 *      semantics — it hits the `channelTaps` map and, if cold, the
 *      `channelActivate` callback.
 *
 *   4. When a move fires with `ctx.deckId` set (via DubRouter `opts`),
 *      it reaches `bus.openChannelTap` with the 4-arg form including
 *      `{ deckId }`. Without a deckId (tracker view) the 3-arg form is
 *      preserved — this matters because existing move tests assert
 *      `toHaveBeenCalledWith(ch, 1.0, 0.005)` (exact 3 args, no 4th).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { echoThrow } from '../moves/echoThrow';
import { dubStab } from '../moves/dubStab';
import { channelThrow } from '../moves/channelThrow';

// Build a minimal DubBus stub that has just the hooks the moves touch
// plus the new deck-channel-tap APIs under test.
function buildFakeBus() {
  const release = {
    channelTap: vi.fn(),
  };
  const bus = {
    openChannelTap: vi.fn().mockReturnValue(release.channelTap),
    modulateFeedback: vi.fn(),
    registerDeckChannelTap: vi.fn(),
    unregisterDeckChannelTap: vi.fn(),
  };
  return { bus, release };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ctx(bus: any, extras: Partial<{ channelId: number; deckId: 'A' | 'B' | 'C'; params: Record<string, number>; bpm: number }> = {}) {
  return {
    bus,
    channelId: extras.channelId,
    deckId: extras.deckId,
    params: extras.params ?? {},
    bpm: extras.bpm ?? 120,
    source: 'live' as const,
  };
}

beforeEach(() => vi.useFakeTimers());

describe('DJ deckId routing — call-shape guarantees', () => {
  it('echoThrow without deckId → 3-arg bus.openChannelTap (tracker-view shape)', () => {
    const { bus } = buildFakeBus();
    echoThrow.execute(ctx(bus, { channelId: 2, bpm: 120 }));
    expect(bus.openChannelTap).toHaveBeenCalledWith(2, 1.0, 0.005);
  });

  it('echoThrow with deckId → 4-arg bus.openChannelTap carrying { deckId }', () => {
    const { bus } = buildFakeBus();
    echoThrow.execute(ctx(bus, { channelId: 2, deckId: 'A', bpm: 120 }));
    expect(bus.openChannelTap).toHaveBeenCalledWith(2, 1.0, 0.005, { deckId: 'A' });
  });

  it('dubStab with deckId passes deckId through to bus', () => {
    const { bus } = buildFakeBus();
    dubStab.execute(ctx(bus, { channelId: 5, deckId: 'B', bpm: 120 }));
    expect(bus.openChannelTap).toHaveBeenCalledWith(5, 1.0, 0.002, { deckId: 'B' });
  });

  it('dubStab without deckId keeps the tracker-view 3-arg shape', () => {
    const { bus } = buildFakeBus();
    dubStab.execute(ctx(bus, { channelId: 5, bpm: 120 }));
    expect(bus.openChannelTap).toHaveBeenCalledWith(5, 1.0, 0.002);
  });

  it('channelThrow with deckId passes deckId through to bus', () => {
    const { bus } = buildFakeBus();
    channelThrow.execute(ctx(bus, { channelId: 0, deckId: 'C', bpm: 120 }));
    expect(bus.openChannelTap).toHaveBeenCalledWith(0, 1.0, 0.010, { deckId: 'C' });
  });

  it('channelThrow without deckId keeps the tracker-view 3-arg shape', () => {
    const { bus } = buildFakeBus();
    channelThrow.execute(ctx(bus, { channelId: 0, bpm: 120 }));
    expect(bus.openChannelTap).toHaveBeenCalledWith(0, 1.0, 0.010);
  });
});

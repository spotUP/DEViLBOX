/**
 * A dub send set while the tab is in the background must still reach the store.
 *
 * Measured live 2026-09-18: channel 1 had a registered tap in the DubBus — the
 * audio path had taken the change — while `get_dub_bus_state` still reported
 * `dubSend: 0` for every channel, because it reads the store.
 *
 * The store write is batched onto `requestAnimationFrame` so a 60-per-second
 * fader drag causes one re-render per frame instead of sixty. A browser
 * SUSPENDS rAF in a hidden tab, and that callback was the only thing that
 * moved the value across. So with the tab backgrounded the sends changed what
 * you heard and never changed the state: faders read stale on return, and a
 * project saved in the meantime recorded the wrong positions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useMixerStore } from '../useMixerStore';

const realRaf = globalThis.requestAnimationFrame;
const realCancel = globalThis.cancelAnimationFrame;

/** A tab whose frame callbacks never arrive, which is what "hidden" means. */
function suspendAnimationFrames(): void {
  globalThis.requestAnimationFrame = (() => 1) as unknown as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = (() => {}) as unknown as typeof cancelAnimationFrame;
}

beforeEach(() => {
  vi.useFakeTimers();
  useMixerStore.getState().setChannelDubSend(0, 0);
  useMixerStore.getState().setChannelDubSend(1, 0);
  vi.advanceTimersByTime(1000);
});

afterEach(() => {
  globalThis.requestAnimationFrame = realRaf;
  globalThis.cancelAnimationFrame = realCancel;
  vi.useRealTimers();
});

describe('with frame callbacks suspended, as in a hidden tab', () => {
  it('still writes the send to the store', () => {
    suspendAnimationFrames();
    useMixerStore.getState().setChannelDubSend(1, 0.5);
    expect(useMixerStore.getState().channels[1].dubSend).toBe(0);   // batched, not yet
    vi.advanceTimersByTime(500);
    expect(useMixerStore.getState().channels[1].dubSend).toBeCloseTo(0.5, 6);
  });

  it('keeps the LAST value per channel when several arrive', () => {
    suspendAnimationFrames();
    const store = useMixerStore.getState();
    store.setChannelDubSend(1, 0.2);
    store.setChannelDubSend(1, 0.7);
    store.setChannelDubSend(0, 0.3);
    vi.advanceTimersByTime(500);
    expect(useMixerStore.getState().channels[1].dubSend).toBeCloseTo(0.7, 6);
    expect(useMixerStore.getState().channels[0].dubSend).toBeCloseTo(0.3, 6);
  });

  it('flushes a send of zero, so closing a send is recorded too', () => {
    suspendAnimationFrames();
    useMixerStore.getState().setChannelDubSend(1, 0.6);
    vi.advanceTimersByTime(500);
    useMixerStore.getState().setChannelDubSend(1, 0);
    vi.advanceTimersByTime(500);
    expect(useMixerStore.getState().channels[1].dubSend).toBe(0);
  });

  it('keeps working across many writes rather than arming once', () => {
    suspendAnimationFrames();
    for (const v of [0.1, 0.4, 0.9]) {
      useMixerStore.getState().setChannelDubSend(1, v);
      vi.advanceTimersByTime(500);
    }
    expect(useMixerStore.getState().channels[1].dubSend).toBeCloseTo(0.9, 6);
  });
});

describe('with frame callbacks running, as in a visible tab', () => {
  it('the frame callback still does the work, and the backstop does not double it', () => {
    let queued: FrameRequestCallback | null = null;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      queued = cb; return 1;
    }) as unknown as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => {}) as unknown as typeof cancelAnimationFrame;

    useMixerStore.getState().setChannelDubSend(1, 0.42);
    queued!(0);
    expect(useMixerStore.getState().channels[1].dubSend).toBeCloseTo(0.42, 6);

    // A later write must still schedule; the first flush has to have cleared
    // both handles or everything after it would be dropped.
    useMixerStore.getState().setChannelDubSend(1, 0.11);
    vi.advanceTimersByTime(500);
    expect(useMixerStore.getState().channels[1].dubSend).toBeCloseTo(0.11, 6);
  });
});

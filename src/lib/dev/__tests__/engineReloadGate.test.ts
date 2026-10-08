import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createReloadGate } from '../engineReloadGate';

describe('a dev-server reload no longer lands in the middle of an agent measurement', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('reloads at once when no bridge call is in flight or recent', () => {
    const reload = vi.fn();
    createReloadGate({ inFlight: () => false, sinceLastActivityMs: () => Infinity, reload })();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('waits while a bridge call is in flight, then reloads once after the quiet period', () => {
    const reload = vi.fn();
    let busy = true;
    let lastEnd = 0;
    const gate = createReloadGate({ inFlight: () => busy, sinceLastActivityMs: () => Date.now() - lastEnd, reload, quietMs: 10_000 });
    gate(); gate(); gate(); // three saves while measuring
    vi.advanceTimersByTime(60_000);
    expect(reload).not.toHaveBeenCalled();
    busy = false; lastEnd = Date.now();
    vi.advanceTimersByTime(5_000);
    expect(reload).not.toHaveBeenCalled(); // calls in a run are seconds apart
    vi.advanceTimersByTime(6_000);
    expect(reload).toHaveBeenCalledTimes(1); // three requests, one reload
  });

  it('still reloads after maxWaitMs so a stuck call cannot block engine edits forever', () => {
    const reload = vi.fn();
    createReloadGate({ inFlight: () => true, sinceLastActivityMs: () => 0, reload, maxWaitMs: 30_000 })();
    vi.advanceTimersByTime(29_000);
    expect(reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  // Owner, 2026-10-08: "cant test now as the page reloads as its worked on".
  it('never reloads while the person is listening or working, however long, then reloads once', () => {
    const reload = vi.fn();
    let listening = true;
    const gate = createReloadGate({ inFlight: () => false, sinceLastActivityMs: () => Infinity, listening: () => listening, reload, maxWaitMs: 30_000 });
    gate();
    vi.advanceTimersByTime(30 * 60_000); // half an hour of music, past the cap
    expect(reload).not.toHaveBeenCalled();
    listening = false;
    vi.advanceTimersByTime(1_000);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

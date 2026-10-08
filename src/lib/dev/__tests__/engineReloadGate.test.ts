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
});

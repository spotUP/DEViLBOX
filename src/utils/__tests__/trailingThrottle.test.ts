/**
 * Regression: knob-drag audition stutter. A held Sonix note re-rendered on EVERY batched
 * knob edit (~60/sec) ran a ~10ms synchronous WASM render each time, starving the audio
 * callback. createTrailingThrottle bounds the re-render to leading + one trailing per
 * interval so a rapid burst does not saturate the main thread, while still applying the
 * final state.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTrailingThrottle } from '../trailingThrottle';

describe('createTrailingThrottle', () => {
  let clock = 0;
  const now = () => clock;

  beforeEach(() => { clock = 0; vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('runs immediately on the first call (leading edge)', () => {
    const fn = vi.fn();
    const t = createTrailingThrottle(fn, 100, now);
    t();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('coalesces a rapid burst into leading + exactly one trailing call', () => {
    const fn = vi.fn();
    const t = createTrailingThrottle(fn, 100, now);
    for (let i = 0; i < 20; i++) t(); // all at clock 0
    expect(fn).toHaveBeenCalledTimes(1); // only the leading call so far
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2); // single trailing call flushes the final state
  });

  it('does not schedule a trailing call for a single invocation', () => {
    const fn = vi.fn();
    const t = createTrailingThrottle(fn, 100, now);
    t();
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('runs again immediately once the interval has elapsed', () => {
    const fn = vi.fn();
    const t = createTrailingThrottle(fn, 100, now);
    t();
    expect(fn).toHaveBeenCalledTimes(1);
    clock = 150; // past the interval
    t();
    expect(fn).toHaveBeenCalledTimes(2); // leading again, no waiting
  });

  it('cancel() prevents a pending trailing call', () => {
    const fn = vi.fn();
    const t = createTrailingThrottle(fn, 100, now);
    t(); t(); t();
    t.cancel();
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(1); // leading only; trailing cancelled
  });
});

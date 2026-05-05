/**
 * batchedSet — regression tests for the rAF-batched Zustand store write utility.
 *
 * Core invariant: multiple rapid calls within one frame result in exactly ONE
 * set() call, and the last-write-wins per key.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createBatchedSet } from '../batchedSet';

// Polyfill requestAnimationFrame for Node/happy-dom
let rafCallbacks: Array<() => void> = [];
beforeEach(() => {
  rafCallbacks = [];
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

function flushRAF() {
  const cbs = [...rafCallbacks];
  rafCallbacks = [];
  cbs.forEach(cb => cb());
}

describe('createBatchedSet', () => {
  it('batches multiple mutations into a single set() call', () => {
    const setCalls: Array<(s: any) => void> = [];
    const mockSet = vi.fn((fn: (s: any) => void) => setCalls.push(fn));

    const batch = createBatchedSet<{ a: number; b: number }>(mockSet);

    // Simulate rapid knob changes within one frame
    batch('knob-a', (s) => { s.a = 1; });
    batch('knob-b', (s) => { s.b = 2; });
    batch('knob-a', (s) => { s.a = 3; }); // overwrites first knob-a

    // Before rAF fires: zero set() calls
    expect(mockSet).not.toHaveBeenCalled();

    // After rAF: exactly ONE set() call
    flushRAF();
    expect(mockSet).toHaveBeenCalledTimes(1);

    // Verify the single mutation applies both changes, with last-write-wins for 'knob-a'
    const state = { a: 0, b: 0 };
    setCalls[0](state);
    expect(state.a).toBe(3); // last write wins
    expect(state.b).toBe(2);
  });

  it('schedules a new batch after the previous flush', () => {
    const mockSet = vi.fn();
    const batch = createBatchedSet<{ x: number }>(mockSet);

    batch('x', (s) => { s.x = 1; });
    flushRAF();
    expect(mockSet).toHaveBeenCalledTimes(1);

    // Second batch after flush
    batch('x', (s) => { s.x = 2; });
    flushRAF();
    expect(mockSet).toHaveBeenCalledTimes(2);
  });

  it('flush() applies mutations immediately without waiting for rAF', () => {
    const mockSet = vi.fn();
    const batch = createBatchedSet<{ v: number }>(mockSet);

    batch('v', (s) => { s.v = 42; });
    batch.flush();

    expect(mockSet).toHaveBeenCalledTimes(1);

    // Subsequent rAF should be a no-op (already flushed)
    flushRAF();
    expect(mockSet).toHaveBeenCalledTimes(1);
  });

  it('does not call set() if no mutations are pending', () => {
    const mockSet = vi.fn();
    createBatchedSet<{ v: number }>(mockSet);

    flushRAF();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('last-write-wins: later mutation for same key replaces earlier one', () => {
    const mutations: Array<(s: any) => void> = [];
    const mockSet = vi.fn((fn: (s: any) => void) => mutations.push(fn));
    const batch = createBatchedSet<{ vol: number }>(mockSet);

    // 10 rapid updates to same key (simulates 10 mouse-move events in one frame)
    for (let i = 0; i < 10; i++) {
      batch('ch1-vol', (s) => { s.vol = i; });
    }

    flushRAF();
    expect(mockSet).toHaveBeenCalledTimes(1);

    const state = { vol: -1 };
    mutations[0](state);
    expect(state.vol).toBe(9); // last value wins
  });
});

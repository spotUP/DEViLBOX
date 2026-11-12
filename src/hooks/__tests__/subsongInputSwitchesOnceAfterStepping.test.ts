/**
 * Stepping the FT2 subsong input (arrow presses, hold-to-repeat) switched the subsong on every press, and each switch
 * reopened and rescanned the song. The input now shows each step at once and switches once, after the user stops.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedCommit } from '../useDebouncedCommit';

describe('subsong input switches once after stepping', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('shows every step at once and commits only the settled value', () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useDebouncedCommit(1, commit, 400));
    for (const v of [2, 3, 4, 5, 6, 7]) {
      act(() => { result.current[1](v); });
      expect(result.current[0]).toBe(v);
      act(() => { vi.advanceTimersByTime(100); });
    }
    expect(commit).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(400); });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(7);
  });

  it('does not switch when the user steps back to the current subsong', () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useDebouncedCommit(3, commit, 400));
    act(() => { result.current[1](4); });
    act(() => { result.current[1](3); });
    act(() => { vi.advanceTimersByTime(500); });
    expect(commit).not.toHaveBeenCalled();
    expect(result.current[0]).toBe(3);
  });
});

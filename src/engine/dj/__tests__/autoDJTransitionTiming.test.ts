/**
 * Regression test for AutoDJ transition timing.
 *
 * Before the fix, getTimeRemaining() could return Infinity for tracker
 * songs with unknown duration, and the transition-pending state didn't
 * track stale positions. This caused AutoDJ to let songs finish (or
 * loop silently) before triggering the transition.
 *
 * The fix:
 * 1. Tracks staleCount in transition-pending (not just playing)
 * 2. Forces transition when position is stale + timeRemaining near 0
 * 3. Forces transition when Infinity duration + stale for >6 polls
 */
import { describe, it, expect } from 'vitest';

/**
 * Simulates the transition-pending logic for determining if a forced
 * transition should occur. Mirrors DJAutoDJ.ts transition-pending case.
 */
function shouldForceTransition(
  timeRemaining: number,
  staleCount: number,
  transitionDuration: number,
): 'normal' | 'forced' | 'wait' {
  // Infinity duration or stale position near end
  if (timeRemaining === Infinity || (staleCount > 6 && timeRemaining < 2)) {
    if (staleCount > 6) {
      return 'forced';
    }
    return 'wait';
  }
  // Normal time-based trigger
  if (timeRemaining <= transitionDuration) {
    return 'normal';
  }
  return 'wait';
}

describe('AutoDJ transition timing regression', () => {
  it('forces transition when duration is Infinity and position is stale', () => {
    // Tracker song with no known duration, position frozen for 7 polls (3.5s)
    const result = shouldForceTransition(Infinity, 7, 15);
    expect(result).toBe('forced');
  });

  it('waits when duration is Infinity but position is not yet stale', () => {
    // Just started — position hasn't been stale long enough
    const result = shouldForceTransition(Infinity, 3, 15);
    expect(result).toBe('wait');
  });

  it('forces transition when position stale and time nearly zero', () => {
    // Song ended (position frozen near 0 remaining)
    const result = shouldForceTransition(1.5, 7, 15);
    expect(result).toBe('forced');
  });

  it('triggers normal transition when time remaining is within transition duration', () => {
    const result = shouldForceTransition(10, 0, 15);
    expect(result).toBe('normal');
  });

  it('waits when plenty of time remains', () => {
    const result = shouldForceTransition(60, 0, 15);
    expect(result).toBe('wait');
  });

  it('does not force transition prematurely when stale but time remaining is high', () => {
    // Position might be stale due to browser throttling but song isn't near end
    const result = shouldForceTransition(120, 8, 15);
    // Should wait — stale count > 6 but timeRemaining > 2, so the stale+near-end
    // condition doesn't fire. And timeRemaining > transitionDuration, so normal
    // doesn't fire either.
    expect(result).toBe('wait');
  });
});

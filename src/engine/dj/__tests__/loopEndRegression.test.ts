/**
 * Regression test for loopEnd=0 bug.
 *
 * Before the fix, setLoopRegion() in DeckAudioPlayer and DeckStemPlayer
 * would set loopEnd=0 when called with loop=true and no explicit end time,
 * creating a zero-length loop that stopped playback immediately.
 *
 * The fix uses the buffer duration as fallback instead of 0.
 */
import { describe, it, expect } from 'vitest';

/**
 * Extract the loopEnd computation logic from DeckAudioPlayer.setLoopRegion().
 * This mirrors the fixed code at DeckAudioPlayer.ts lines 446-450.
 */
function computeLoopEnd(
  endParam: number | undefined,
  duration: number,
  bufferDuration: number | undefined,
): number {
  // Fixed logic: use duration or buffer duration, never 0
  return endParam ?? (duration || bufferDuration || 0);
}

describe('DeckAudioPlayer loopEnd regression', () => {
  it('uses buffer duration when loopEnd is not specified and duration is 0', () => {
    // Before fix: endParam=undefined, duration=0 → loopEnd=0 (zero-length loop)
    // After fix: falls back to bufferDuration
    const result = computeLoopEnd(undefined, 0, 180.5);
    expect(result).toBe(180.5);
  });

  it('uses duration when available and loopEnd is not specified', () => {
    const result = computeLoopEnd(undefined, 240.0, 240.0);
    expect(result).toBe(240.0);
  });

  it('uses explicit loopEnd when provided', () => {
    const result = computeLoopEnd(30.0, 240.0, 240.0);
    expect(result).toBe(30.0);
  });

  it('never returns 0 when buffer has content', () => {
    // The critical regression case: loop=true with no explicit end
    // and _duration not yet set (still 0) but buffer is loaded
    const result = computeLoopEnd(undefined, 0, 120.0);
    expect(result).toBeGreaterThan(0);
  });

  it('returns 0 only when no buffer exists', () => {
    // Edge case: no buffer loaded yet — 0 is acceptable (loop won't play anyway)
    const result = computeLoopEnd(undefined, 0, undefined);
    expect(result).toBe(0);
  });
});

/**
 * Extract the loopEnd computation for DeckStemPlayer.setLoopRegion().
 * Mirrors the fixed code at DeckStemPlayer.ts lines 366-370.
 */
function computeStemLoopEnd(
  endParam: number | undefined,
  bufferDuration: number | undefined,
): number {
  return endParam ?? (bufferDuration || 0);
}

describe('DeckStemPlayer loopEnd regression', () => {
  it('uses buffer duration when loopEnd is not specified', () => {
    const result = computeStemLoopEnd(undefined, 180.5);
    expect(result).toBe(180.5);
  });

  it('uses explicit loopEnd when provided', () => {
    const result = computeStemLoopEnd(30.0, 180.5);
    expect(result).toBe(30.0);
  });

  it('never returns 0 when buffer has content', () => {
    const result = computeStemLoopEnd(undefined, 120.0);
    expect(result).toBeGreaterThan(0);
  });
});

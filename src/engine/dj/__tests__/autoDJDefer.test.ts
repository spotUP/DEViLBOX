/**
 * DJAutoDJ — pattern-aware defer tuning.
 *
 * Guards the transition-defer cap scaling logic added 2026-04-21. The
 * goal: short fades must NEVER burn their whole window on deferrals;
 * long fades can defer more liberally; a broken chord detector can
 * never exceed HARD_MAX_PATTERN_DEFERS no matter how long the fade.
 *
 * Tests drive `computeMaxPatternDefers` directly — no need to stand up
 * the full AutoDJ state machine. The same constants the production
 * code consults are exported from the module.
 */
import { describe, it, expect } from 'vitest';
import {
  computeMaxPatternDefers,
  HARD_MAX_PATTERN_DEFERS,
  PATTERN_DEFER_BUDGET_RATIO,
  MIN_TRANSITION_FOR_DEFER_SEC,
} from '../DJAutoDJ';

describe('computeMaxPatternDefers', () => {
  it('returns 0 for zero-length transitions', () => {
    expect(computeMaxPatternDefers(0)).toBe(0);
  });

  it('returns 0 for transitions below MIN_TRANSITION_FOR_DEFER_SEC', () => {
    // The function itself still computes a budget-based cap at 2s
    // (floor(2 * 0.15 / 0.5) = 0). The short-fade guard in
    // shouldDeferForPatternData is what actually skips the check —
    // but the budget math alone also produces 0 for <2s fades.
    expect(computeMaxPatternDefers(1)).toBe(0);
    expect(computeMaxPatternDefers(MIN_TRANSITION_FOR_DEFER_SEC - 0.5)).toBe(0);
  });

  it('scales linearly with transition duration', () => {
    // floor(4 * 0.15 / 0.5) = floor(1.2) = 1
    expect(computeMaxPatternDefers(4)).toBe(1);
    // floor(7 * 0.15 / 0.5) = floor(2.1) = 2
    expect(computeMaxPatternDefers(7)).toBe(2);
    // floor(10 * 0.15 / 0.5) = floor(3.0) = 3
    expect(computeMaxPatternDefers(10)).toBe(3);
  });

  it('caps at HARD_MAX_PATTERN_DEFERS regardless of fade length', () => {
    // A 60s fade at 15% = 9s of defer budget = 18 poll intervals —
    // clamped down to HARD_MAX_PATTERN_DEFERS.
    expect(computeMaxPatternDefers(60)).toBe(HARD_MAX_PATTERN_DEFERS);
    expect(computeMaxPatternDefers(1000)).toBe(HARD_MAX_PATTERN_DEFERS);
  });

  it('never returns negative values', () => {
    expect(computeMaxPatternDefers(-1)).toBe(0);
    expect(computeMaxPatternDefers(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it('constants have the documented values', () => {
    expect(HARD_MAX_PATTERN_DEFERS).toBe(5);
    expect(PATTERN_DEFER_BUDGET_RATIO).toBe(0.15);
    expect(MIN_TRANSITION_FOR_DEFER_SEC).toBe(2);
  });

  it('defer budget can never eat more than 15% of the fade time', () => {
    // Property test: for any reasonable fade length, the defer budget
    // (capped cap × 500ms poll) is ≤ 15% of the fade duration.
    for (const fadeSec of [2, 4, 8, 16, 32, 64]) {
      const maxDefers = computeMaxPatternDefers(fadeSec);
      const deferSpendSec = maxDefers * 0.5;
      expect(deferSpendSec).toBeLessThanOrEqual(fadeSec * PATTERN_DEFER_BUDGET_RATIO + 0.001);
    }
  });
});

/**
 * The performer must get a decision every bar, not every pattern.
 *
 * This is the composition test the unit tests missed. `resolveTransportRow`
 * was correct in isolation and `computeMusicalPosition` was correct in
 * isolation; the bug lived in how AutoDub joined them — it read
 * `currentGlobalRow`, which only advances when the PATTERN changes, and fed
 * that to the musical clock. At speed 12 a bar is 8 rows, so the bar number
 * leapt by 8 per update and the performer got ONE decision per pattern.
 * Reported 2026-09-19 as "King Tubby is mostly idle"; the fire log showed every
 * decision at `barPos: 0` on bars 8, 16, 40, 48, 56, 72, 80, 88.
 *
 * So this drives a playthrough the way the transport actually reports one —
 * the coarse field ticking once per pattern, the fine field once per row — and
 * asserts the performer's view of time advances smoothly through it.
 */

import { describe, it, expect } from 'vitest';
import { resolveTransportRow, ROWS_PER_PATTERN } from '../transportRow';
import { computeMusicalPosition } from '../musicalClock';

/**
 * Replay a song the way the stores report it.
 *
 * `currentGlobalRow` is written once per pattern (`position * 64 + row`);
 * `currentRow` counts rows within the pattern and wraps.
 */
function barsSeenDuring(patterns: number, ticksPerRow: number): number[] {
  const bars: number[] = [];
  for (let pattern = 0; pattern < patterns; pattern++) {
    // What usePatternPlayback writes at the pattern boundary, and only there.
    const globalRow = pattern * ROWS_PER_PATTERN;
    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      const resolved = resolveTransportRow(globalRow, row);
      const pos = computeMusicalPosition(resolved!, ticksPerRow);
      bars.push(Math.floor(pos.bar));
    }
  }
  return bars;
}

describe('the performer sees every bar go by', () => {
  // speed 12 is "world class dub" — 24/12 = 2 rows per beat, 8 rows per bar.
  it('advances one bar at a time at speed 12, not one pattern at a time', () => {
    const bars = barsSeenDuring(3, 12);
    const distinct = [...new Set(bars)];
    // 3 patterns x 64 rows / 8 rows per bar = 24 bars.
    expect(distinct).toHaveLength(24);
    // Every step is +0 (same bar, next row) or +1 (bar turned). Never +8.
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i] - bars[i - 1], `row ${i}`).toBeLessThanOrEqual(1);
    }
  });

  it('never skips a bar number', () => {
    const bars = barsSeenDuring(3, 12);
    const distinct = [...new Set(bars)].sort((a, b) => a - b);
    for (let i = 0; i < distinct.length; i++) {
      expect(distinct[i]).toBe(i);
    }
  });

  it('holds at the classic speed 6 too, where a bar is 16 rows', () => {
    const bars = barsSeenDuring(2, 6);
    // 2 x 64 / 16 = 8 bars.
    expect([...new Set(bars)]).toHaveLength(8);
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i] - bars[i - 1]).toBeLessThanOrEqual(1);
    }
  });

  it('crosses a pattern boundary without jumping', () => {
    // The boundary is where the coarse field moves; it must not double-count.
    const lastOfFirst = computeMusicalPosition(
      resolveTransportRow(0, ROWS_PER_PATTERN - 1)!, 12,
    ).bar;
    const firstOfSecond = computeMusicalPosition(
      resolveTransportRow(ROWS_PER_PATTERN, 0)!, 12,
    ).bar;
    expect(Math.floor(firstOfSecond) - Math.floor(lastOfFirst)).toBe(1);
  });
});

describe('the position within the bar moves too', () => {
  it('is not pinned at zero', () => {
    // Every decision in the reported log sat at barPos 0, because the only
    // rows the clock ever saw were pattern starts.
    const positions = new Set<string>();
    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      const pos = computeMusicalPosition(resolveTransportRow(0, row)!, 12);
      positions.add(pos.positionInBar.toFixed(3));
    }
    expect(positions.size).toBeGreaterThan(1);
    expect(positions.has('0.000')).toBe(true);
  });
});

describe('what the old behaviour looked like', () => {
  it('reading the pattern-granular row alone jumps 8 bars at a time', () => {
    // Kept as the counter-example, so the regression is legible rather than
    // just "this number changed".
    const barsOldWay: number[] = [];
    for (let pattern = 0; pattern < 3; pattern++) {
      const globalRow = pattern * ROWS_PER_PATTERN;
      for (let row = 0; row < ROWS_PER_PATTERN; row++) {
        // The old code preferred globalRow whenever it was usable.
        barsOldWay.push(Math.floor(computeMusicalPosition(globalRow, 12).bar));
      }
    }
    const distinct = [...new Set(barsOldWay)];
    expect(distinct).toEqual([0, 8, 16]);   // one decision per pattern
  });
});

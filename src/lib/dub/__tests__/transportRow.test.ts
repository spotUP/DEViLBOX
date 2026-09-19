/**
 * The performer got one decision per pattern.
 *
 * Reported 2026-09-19 as "King Tubby is mostly idle" on "world class dub", and
 * the fire log said it precisely: every decision at `barPos: 0`, on bars 8,
 * 16, 40, 48, 56, 72, 80, 88. Never a bar in between, never a position other
 * than zero.
 *
 * `currentGlobalRow` is only written when the pattern or song position changes
 * — `usePatternPlayback` does that deliberately, because per-row store writes
 * were avoided when the editor's RAF loop already reads position directly. So
 * it advances 64 rows at a time. AutoDub's bar clock read it first, and at
 * speed 12 (this tune) a bar is 8 rows, so the bar number leapt by exactly 8
 * per update. Every per-bar rule the performer has — `minBarsBetweenFires`,
 * the per-bar fire caps, the phrase arc — then ran eight times too slowly, and
 * what came out was a performer that looked idle and moved only when its own
 * drought trigger fired.
 *
 * `currentRow` moves every row but wraps per pattern. Coarse from one, fine
 * from the other.
 */

import { describe, it, expect } from 'vitest';
import { resolveTransportRow, ROWS_PER_PATTERN } from '../transportRow';

describe('the row actually advances between pattern changes', () => {
  it('follows currentRow while the global row stands still', () => {
    // The global row is stuck at the start of pattern 12 for 64 rows.
    const stuck = 12 * ROWS_PER_PATTERN;
    const rows = [0, 1, 7, 33, 63].map(r => resolveTransportRow(stuck, r));
    expect(rows).toEqual([768, 769, 775, 801, 831]);
    // Strictly increasing — this is the property the bar clock needed.
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!).toBeGreaterThan(rows[i - 1]!);
    }
  });

  it('stays anchored to the pattern the global row names', () => {
    // Without the anchor, a wrapped `currentRow` would read as pattern 0.
    expect(resolveTransportRow(12 * ROWS_PER_PATTERN, 0)).toBe(768);
    expect(resolveTransportRow(0, 0)).toBe(0);
  });

  it('ignores a stale fine offset inside the global row', () => {
    // `currentGlobalRow` is written as `position * 64 + row`, so it can carry a
    // row offset of its own. Only the pattern it names is trusted; the live row
    // supplies the rest, or the two would be added together.
    expect(resolveTransportRow(12 * ROWS_PER_PATTERN + 40, 3)).toBe(771);
  });

  it('moves a bar at a time, not a pattern at a time', () => {
    // At speed 12 a bar is 8 rows. Across one pattern the clock must see 8
    // distinct bars, which is what gives the performer 8 decisions instead of 1.
    const base = 4 * ROWS_PER_PATTERN;
    const bars = new Set<number>();
    for (let r = 0; r < ROWS_PER_PATTERN; r++) {
      bars.add(Math.floor(resolveTransportRow(base, r)! / 8));
    }
    expect(bars.size).toBe(8);
  });
});

describe('the fallbacks', () => {
  it('uses the global row when there is no live row', () => {
    expect(resolveTransportRow(512, undefined)).toBe(512);
  });

  it('uses the live row alone before any global row exists', () => {
    expect(resolveTransportRow(0, 5)).toBe(5);
    expect(resolveTransportRow(undefined, 5)).toBe(5);
  });

  it('reports nothing when neither is usable, so the caller can fall back', () => {
    // AutoDub counts bars off the wall clock in that case.
    expect(resolveTransportRow(undefined, undefined)).toBeNull();
    expect(resolveTransportRow(NaN, NaN)).toBeNull();
  });

  it('treats row zero as real, not as missing', () => {
    // The first row of a pattern is a legitimate position.
    expect(resolveTransportRow(256, 0)).toBe(256);
  });
});

describe('wiring contract', () => {
  it('AutoDub resolves its clock through this helper', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const src = readFileSync(
      join(__dirname, '..', '..', '..', 'engine', 'dub', 'AutoDub.ts'), 'utf8',
    );
    // Passed straight from the store rather than via locals, so no
    // intermediate can be mistaken for a direct read of the stale field.
    expect(src).toContain('resolveTransportRow(transport.currentGlobalRow, transport.currentRow)');
    // The old behaviour preferred the pattern-granular value outright.
    expect(src).not.toMatch(/Number\.isFinite\(globalRow\) && globalRow > 0\s*\n?\s*\? globalRow/);
  });
});

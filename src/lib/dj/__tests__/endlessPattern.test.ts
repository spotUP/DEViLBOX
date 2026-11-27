/**
 * DJ-PATTERN-ENDLESS (owner 2026-11-27): the deck pattern view reads as one
 * long pattern; the rows of the neighbouring order positions follow the
 * current one, with no wrap at a pattern boundary.
 */
import { describe, it, expect } from 'vitest';
import { endlessRowSpan, buildEndlessPattern } from '../endlessPattern';
import type { Pattern, TrackerCell } from '@/types/tracker';

const cell = (note: number): TrackerCell => ({ note, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

/** A pattern whose cell at row r holds note base + r on every channel. */
function pat(id: string, length: number, base: number, channels = 2): Pattern {
  return {
    id, name: id, length,
    channels: Array.from({ length: channels }, (_, c) => ({
      id: `${id}-${c}`, name: `${c}`, muted: false, solo: false, collapsed: false, volume: 100, pan: 0,
      instrumentId: null, color: null,
      rows: Array.from({ length }, (_, r) => cell(base + r)),
    })),
  } as Pattern;
}

describe('endlessRowSpan', () => {
  it('joins the tail of the previous position and the head of the next one around the current one', () => {
    const { rows, currentStart } = endlessRowSpan([4, 4, 4], 1, 2);
    expect(currentStart).toBe(2);
    expect(rows).toEqual([
      { pos: 0, row: 2 }, { pos: 0, row: 3 },
      { pos: 1, row: 0 }, { pos: 1, row: 1 }, { pos: 1, row: 2 }, { pos: 1, row: 3 },
      { pos: 2, row: 0 }, { pos: 2, row: 1 },
    ]);
  });

  it('crosses several short patterns of different lengths to fill the margin', () => {
    const { rows, currentStart } = endlessRowSpan([2, 3, 1, 2, 3], 2, 4);
    expect(currentStart).toBe(4);
    expect(rows.slice(0, 4)).toEqual([{ pos: 0, row: 1 }, { pos: 1, row: 0 }, { pos: 1, row: 1 }, { pos: 1, row: 2 }]);
    expect(rows[4]).toEqual({ pos: 2, row: 0 });
    expect(rows.slice(5)).toEqual([{ pos: 3, row: 0 }, { pos: 3, row: 1 }, { pos: 4, row: 0 }, { pos: 4, row: 1 }]);
  });

  it('is blank before order 0 and past the last position', () => {
    expect(endlessRowSpan([3, 3], 0, 8)).toEqual({
      rows: [{ pos: 0, row: 0 }, { pos: 0, row: 1 }, { pos: 0, row: 2 }, { pos: 1, row: 0 }, { pos: 1, row: 1 }, { pos: 1, row: 2 }],
      currentStart: 0,
    });
    const last = endlessRowSpan([3, 3], 1, 8);
    expect(last.currentStart).toBe(3);
    expect(last.rows.length).toBe(6);
  });

  it('skips an empty position', () => {
    expect(endlessRowSpan([2, 0, 2], 2, 3).rows.slice(0, 2)).toEqual([{ pos: 0, row: 0 }, { pos: 0, row: 1 }]);
  });
});

describe('buildEndlessPattern', () => {
  it('builds one pattern of the joined cells with each row numbered inside its own pattern', () => {
    const patterns = [pat('a', 4, 10), pat('b', 2, 20, 1)];
    const built = buildEndlessPattern(patterns, [0, 1, 0], 1, 3)!;
    expect(built.currentStart).toBe(3);
    expect(built.pattern.id).toBe('b');
    expect(built.pattern.length).toBe(8);
    expect(built.rowNumbers).toEqual([1, 2, 3, 0, 1, 0, 1, 2]);
    expect(built.pattern.channels).toHaveLength(1); // channel settings from the current pattern
    expect(built.pattern.channels[0].rows.map((c) => c.note)).toEqual([11, 12, 13, 20, 21, 10, 11, 12]);
  });

  it('fills a channel a neighbour pattern lacks with empty cells', () => {
    const built = buildEndlessPattern([pat('a', 2, 10, 1), pat('b', 2, 20, 2)], [0, 1], 1, 2)!;
    expect(built.pattern.channels[1].rows.map((c) => c.note)).toEqual([0, 0, 20, 21]);
  });

  it('is null for a position with no pattern', () => {
    expect(buildEndlessPattern([pat('a', 2, 10)], [0], 5, 2)).toBeNull();
  });
});

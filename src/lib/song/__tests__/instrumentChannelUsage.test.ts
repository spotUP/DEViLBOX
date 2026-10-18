/**
 * instrumentChannelUsage maps each instrument to the channels it sounds on,
 * resolving a cell the way the scheduler does: the cell's own instrument, the
 * extra instrument columns of a multi-note cell, else the channel default
 * instrument for a note without one. A note off never triggers anything.
 */
import { describe, it, expect } from 'vitest';
import { instrumentChannelUsage } from '../instrumentChannelUsage';
import type { Pattern, TrackerCell } from '@/types';

const cell = (over: Partial<TrackerCell>): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, ...over } as TrackerCell);
const pattern = (channels: Array<{ instrumentId: number | null; rows: TrackerCell[] }>): Pattern => ({
  id: 'p', name: 'p', length: 4,
  channels: channels.map((c, i) => ({ id: `c${i}`, name: `c${i}`, muted: false, solo: false, collapsed: false, volume: 100, ...c })),
} as unknown as Pattern);

describe('instrumentChannelUsage', () => {
  it('collects the channels an instrument plays on across patterns, by cell instrument', () => {
    const usage = instrumentChannelUsage([
      pattern([{ instrumentId: null, rows: [cell({ note: 49, instrument: 7 })] }, { instrumentId: null, rows: [cell({ note: 49, instrument: 2 })] }]),
      pattern([{ instrumentId: null, rows: [] }, { instrumentId: null, rows: [] }, { instrumentId: null, rows: [cell({ note: 52, instrument: 7 })] }]),
    ]);
    expect([...usage.get(7)!].sort()).toEqual([0, 2]);
    expect([...usage.get(2)!]).toEqual([1]);
  });
  it('a note without an instrument uses the channel default; a note off and an empty row use nothing', () => {
    const usage = instrumentChannelUsage([
      pattern([
        { instrumentId: 5, rows: [cell({ note: 49 })] },
        { instrumentId: 6, rows: [cell({ note: 97 }), cell({})] },
      ]),
    ]);
    expect([...usage.get(5)!]).toEqual([0]);
    expect(usage.has(6)).toBe(false);
  });
  it('multi-note cells count their extra instrument columns', () => {
    const usage = instrumentChannelUsage([pattern([{ instrumentId: null, rows: [cell({ note: 49, instrument: 1, instrument2: 3, instrument3: 4 })] }])]);
    expect([1, 3, 4].map((id) => [...usage.get(id)!])).toEqual([[0], [0], [0]]);
  });
});

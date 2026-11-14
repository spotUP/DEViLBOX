import { describe, it, expect } from 'vitest';
import type { Pattern, TrackerCell } from '@typedefs';
import type { InstrumentConfig } from '@typedefs/instrument';
import { mergeSongs, type MergeSong } from '../shareMerge';

const cell = (note: number): TrackerCell => ({ note, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 } as TrackerCell);
const pattern = (notes: number[]): Pattern => ({
  id: 'p', name: 'p', length: notes.length,
  channels: [{ id: 'c', name: 'c', rows: notes.map(cell), muted: false, solo: false, collapsed: false, volume: 80, pan: 0, instrumentId: null, color: null }],
} as unknown as Pattern);
const inst = (id: number, name: string) => ({ id, name } as unknown as InstrumentConfig);
const song = (notes: number[], order = [0], instruments: InstrumentConfig[] = []): MergeSong => ({ patterns: [pattern(notes)], order, instruments });
const notes = (s: MergeSong) => s.patterns[0].channels[0].rows.map((c) => c.note);

describe('mergeSongs', () => {
  it('applies non-clashing cell changes from both sides', () => {
    const r = mergeSongs(song([1, 2, 3]), song([9, 2, 3]), song([1, 2, 7]));
    expect(r.conflicts).toEqual([]);
    expect(notes(r.merged)).toEqual([9, 2, 7]);
    expect(r.appliedFromTheirs).toBe(1);
  });

  it('reports a clash and keeps mine until theirs is picked', () => {
    const args = [song([1, 2]), song([5, 2]), song([6, 2])] as const;
    const r = mergeSongs(...args);
    expect(r.conflicts.map((c) => c.key)).toEqual(['cell:0:0:0']);
    expect(notes(r.merged)).toEqual([5, 2]);
    expect(notes(mergeSongs(...args, new Map([['cell:0:0:0', 'theirs' as const]])).merged)).toEqual([6, 2]);
  });

  it('does not report the same change on both sides as a clash', () => {
    const r = mergeSongs(song([1, 2]), song([5, 2]), song([5, 2]));
    expect(r.conflicts).toEqual([]);
    expect(notes(r.merged)).toEqual([5, 2]);
  });

  it('treats the order list as a unit', () => {
    expect(mergeSongs(song([1], [0]), song([1], [0]), song([1], [0, 0])).merged.order).toEqual([0, 0]);
    expect(mergeSongs(song([1], [0]), song([1], [0, 0]), song([1], [0, 0, 0])).conflicts.map((c) => c.key)).toEqual(['order']);
  });

  it('merges instruments whole: one side takes it, both sides clash, a new one is added', () => {
    const base = song([1], [0], [inst(1, 'a'), inst(2, 'b')]);
    const mine = song([1], [0], [inst(1, 'a'), inst(2, 'mine')]);
    const theirs = song([1], [0], [inst(1, 'theirs'), inst(2, 'theirs'), inst(3, 'new')]);
    const r = mergeSongs(base, mine, theirs);
    expect(r.conflicts.map((c) => c.key)).toEqual(['instrument:2']);
    expect(r.merged.instruments.map((i) => i.name)).toEqual(['theirs', 'mine', 'new']);
  });
});

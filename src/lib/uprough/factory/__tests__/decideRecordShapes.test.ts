/**
 * R2f-24a/b: the host's real decide records (captured, see fixtures/decideRecords.json `_source`) have the shapes
 * DecideCells names, and the chops / vocals strip summaries read them.
 */
import { describe, expect, it } from 'vitest';
import records from './fixtures/decideRecords.json';
import { chopsSummary, decideToCells, vocalsSummary } from '../decideToCells';
import type { ChopsBreak, ChopsChopped, DecideCells, DrumHit, R2Event, Trap808Event, VocalWord } from '@/engine/uprough/r2Events';

type Decide = Extract<R2Event, { type: 'decide' }>;
const KINDS = ['drums', 'bass_trap808', 'bass_list', 'vocals', 'chops_break', 'chops_chopped', 'melody'] as const;
const rec = (k: typeof KINDS[number]): Decide => records[k] as unknown as Decide;
type CellsOf<L extends DecideCells['lane']> = Extract<DecideCells, { lane: L }>['cells'];
const cellsOf = <L extends DecideCells['lane']>(k: typeof KINDS[number], _lane: L): CellsOf<L> => rec(k).cells as CellsOf<L>;

describe('real host decide records', () => {
  it('the fixture holds one non-empty decide per kind, in the protocol envelope', () => {
    for (const k of KINDS) {
      const e = rec(k);
      expect(Object.keys(e).sort()).toEqual(['bar', 'cells', 'lane', 'section', 'seq', 'type']);
      expect(e.type).toBe('decide');
      expect(e.cells.length).toBeGreaterThan(0);
    }
  });

  it('drums are [voice, step, vel 0-1, role] tuples or hat objects with vel 0-127', () => {
    const cells = cellsOf('drums', 'drums');
    const tuples = cells.filter((c): c is Extract<DrumHit, unknown[]> => Array.isArray(c));
    const hats = cells.filter((c) => !Array.isArray(c));
    expect(tuples.length).toBeGreaterThan(0);
    expect(hats.length).toBeGreaterThan(0);
    for (const t of tuples) {
      expect(t).toHaveLength(4);
      expect(typeof t[0]).toBe('string');
      expect(t[2]).toBeLessThanOrEqual(1);
    }
    for (const h of hats) expect(Object.keys(h).sort()).toEqual(['kind', 'micro_ms', 'step', 'sub', 'vel', 'voice']);
  });

  it('bass is either [the 808 dict] or the flat gen_bass tuple list', () => {
    const trap = cellsOf('bass_trap808', 'bass');
    expect(trap).toHaveLength(1);
    const dict = trap[0] as { trap808: Trap808Event[]; profile: string; root_semi: number };
    expect(Object.keys(dict).sort()).toEqual(['profile', 'root_semi', 'trap808']);
    expect(Object.keys(dict.trap808[0]!).sort()).toEqual(['bar', 'dur_s', 'kind', 'role', 'semi', 'slide', 'start_s', 'step']);
    const list = cellsOf('bass_list', 'bass');
    for (const t of list) expect(t).toHaveLength(5);
  });

  it('vocals are 7-element words whose position is a float step', () => {
    const words = cellsOf('vocals', 'vocals') as VocalWord[];
    for (const w of words) {
      expect(w).toHaveLength(7);
      expect(typeof w[0]).toBe('string');
      expect(Array.isArray(w[1])).toBe(true);
      expect(typeof w[5]).toBe('number');
    }
    expect(words.some((w) => !Number.isInteger(w[5]))).toBe(true);
  });

  it('chops are one real-break dict or one chopped record', () => {
    const brk = cellsOf('chops_break', 'chops') as [ChopsBreak];
    expect(Object.keys(brk[0]).sort()).toEqual(['brk_seed', 'kick_steps', 'length']);
    const chopped = cellsOf('chops_chopped', 'chops') as [ChopsChopped];
    expect(Object.keys(chopped[0]).sort()).toEqual(['offers', 'ops', 'triggers']);
    expect(chopped[0].ops).toHaveLength(3);
  });

  it('melody notes are [midi, step, len]', () => {
    for (const n of cellsOf('melody', 'melody')) expect(n).toHaveLength(3);
  });
});

describe('chops and vocals strip summaries', () => {
  it('a real-break bar is one break loop; a chopped bar counts its triggers and names its first op', () => {
    expect(chopsSummary(rec('chops_break').cells)).toEqual({ kind: 'break', triggers: 1, op: null });
    const chopped = cellsOf('chops_chopped', 'chops') as [ChopsChopped];
    expect(chopsSummary(chopped)).toEqual({ kind: 'chopped', triggers: chopped[0].triggers.length, op: chopped[0].ops[0] });
    expect(chopsSummary([])).toBeNull();
  });

  it('a vocals bar counts its words and names the first', () => {
    const words = cellsOf('vocals', 'vocals') as VocalWord[];
    expect(vocalsSummary(words)).toEqual({ words: words.length, first: words[0]![0] });
    expect(vocalsSummary([])).toBeNull();
  });

  it('chops and vocals write no tracker cells', () => {
    for (const k of ['vocals', 'chops_break', 'chops_chopped'] as const) expect(decideToCells(rec(k).lane, 0, rec(k).cells)).toEqual([]);
  });
});

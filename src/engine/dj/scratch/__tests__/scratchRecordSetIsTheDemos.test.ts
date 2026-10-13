/**
 * R8: the demo's "Records" bulk selector (Up Rough `tools/scratch.py` `all_source_names`, `record_set`,
 * `record_set_choices`) and `pick_source`'s pool order over a checked set. Fixture `fixtures/record_sets.json`
 * from `tools/scratch-fixtures/gen_record_sets.py` (the demo's own bank metadata).
 */
import { describe, it, expect } from 'vitest';
import fixture from './fixtures/record_sets.json';
import { ALL_SOURCE_NAMES, recordSet, recordSetChoices, scratchRecordsFor, sourcePool, CLEAN_CRATE_POOL } from '../scratchCatalogue';
import { overlayRecord } from '../scratchDemoRoutines';

const F = fixture as unknown as { allNames: string[]; choices: string[]; sets: Record<string, string[] | null>; picks: Array<{ sel: string; section: string; seed: number; pick: string }> };

describe('the Records selector is the demo\'s (R8)', () => {
  it('all_source_names, record_set_choices and record_set for every choice (and an unknown one) = the demo', () => {
    expect(ALL_SOURCE_NAMES).toEqual(F.allNames);
    expect(recordSetChoices()).toEqual(F.choices);
    for (const [sel, set] of Object.entries(F.sets)) expect([sel, recordSet(sel)]).toEqual([sel, set]);
  });

  it('pick_source over a checked set: the record of each section and seed = the demo', () => {
    for (const p of F.picks) expect([p.sel, p.section, p.seed, overlayRecord(p.section, p.seed, sourcePool(recordSet(p.sel)!))]).toEqual([p.sel, p.section, p.seed, p.pick]);
  });

  it('the Auto Scratch setting: a selector, the checked records, off; style is the demo\'s default (null)', () => {
    expect(scratchRecordsFor('cat:fresh')).toEqual(F.sets['cat:fresh']);
    expect(scratchRecordsFor(['BOY', 'TWO'])).toEqual(['BOY', 'TWO']);
    expect(scratchRecordsFor('off')).toEqual([]);
    expect(scratchRecordsFor('style')).toBeNull();
    expect(CLEAN_CRATE_POOL).toEqual(F.sets.clean);
  });
});

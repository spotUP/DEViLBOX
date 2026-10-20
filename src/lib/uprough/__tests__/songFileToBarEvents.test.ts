/**
 * songFileToBarEvents is the host's tools/song_file.py to_events: for each fixture doc the events deep-equal the
 * host's own output. Fixture: tools/softsynth-fixtures/gen_bar_events.py (trap = 808 path, golden_era without the
 * 808 = ebass path, lofi; each also with grid edits that must win over the side table).
 */
import { describe, expect, it } from 'vitest';
import fixture from './fixtures/bar_events.json';
import { parseSongFile, type SongFileDoc } from '../songFile';
import { hostNoteName, songFileToBarEvents } from '../barEvents';

interface Case { name: string; doc: SongFileDoc; events: unknown }
const cases = fixture as unknown as Case[];
const doc = (name: string): SongFileDoc => structuredClone(cases.find((c) => c.name === name)!.doc);
const firstSide = (d: SongFileDoc, field: string): { sid: string; cell: string; entry: Record<string, unknown> } => {
  for (const [sid, entries] of Object.entries(d.side)) {
    for (const [cell, entry] of Object.entries(entries)) if (field in entry) return { sid, cell, entry: entry as Record<string, unknown> };
  }
  throw new Error(`fixture has no ${field} side entry`);
};

describe('songFileToBarEvents', () => {
  it('covers the three bass paths and the grid edits', () => {
    expect(cases.map((c) => c.name)).toEqual(['trap', 'trap_edited', 'golden_era', 'golden_era_edited', 'lofi', 'lofi_edited']);
  });

  it.each(cases.map((c) => [c.name, c] as const))('%s deep-equals the host to_events', (_, c) => {
    expect(songFileToBarEvents(structuredClone(c.doc))).toEqual(c.events);
  });

  it('rounds half to even like the host (C-4 = 48)', () => {
    expect(hostNoteName(48)).toBe('C-4');
    expect(hostNoteName(48.5)).toBe('C-4');
    expect(hostNoteName(49.5)).toBe('D-4');
  });

  it('refuses a bar order naming an empty cell', () => {
    const d = doc('lofi');
    d.sections[0]!.bars[0]!.order.push('kick:15');
    d.sections[0]!.lanes.kick![15] = null;
    expect(() => songFileToBarEvents(d)).toThrow('Bar order names cell kick:15, which is empty.');
  });

  it('refuses a new 808 note and a new ebass note with no side timing', () => {
    for (const [name, field, text] of [['trap', 'e808', '808'], ['golden_era', 'ebass', 'bass']] as const) {
      const d = doc(name);
      const { sid, cell } = firstSide(d, field);
      delete d.side[sid]![cell];
      expect(() => songFileToBarEvents(d)).toThrow(`Cell ${cell} in ${sid} is a new ${text} note; schema 3 needs its timing in the side table.`);
    }
  });
});

describe('side table validation', () => {
  const refuse = (name: string, field: string, edit: (e: Record<string, unknown>) => void, text: string): void => {
    const d = doc(name);
    const { sid, cell, entry } = firstSide(d, field);
    edit(entry);
    expect(() => parseSongFile(d)).toThrow(text.replace('@', `side.${sid}.${cell}`));
  };

  it('refuses a hat record with a missing, extra or wrongly typed field', () => {
    refuse('trap', 'hat', (e) => { delete (e.hat as Record<string, unknown>).micro_ms; }, 'Missing field "@.hat.micro_ms"');
    refuse('trap', 'hat', (e) => { (e.hat as Record<string, unknown>).pan = 0; }, 'Unknown field "@.hat.pan"');
    refuse('trap', 'hat', (e) => { (e.hat as Record<string, unknown>).vel = '90'; }, 'Field "@.hat.vel" in Up Rough song file schema 3 is not a number.');
    refuse('trap', 'hat', (e) => { (e.hat as Record<string, unknown>).sub = null; }, 'Field "@.hat.sub" in Up Rough song file schema 3 is not a list.');
    refuse('trap', 'hat', (e) => { (e.hat as Record<string, unknown>).kind = 1; }, 'Field "@.hat.kind" in Up Rough song file schema 3 is not text.');
  });

  it('refuses an 808 record with a missing or wrongly typed field', () => {
    refuse('trap', 'e808', (e) => { delete (e.e808 as Record<string, unknown>).dur_s; }, 'Missing field "@.e808.dur_s"');
    refuse('trap', 'e808', (e) => { (e.e808 as Record<string, unknown>).semi = null; }, 'Field "@.e808.semi" in Up Rough song file schema 3 is not a number.');
    refuse('trap', 'e808', (e) => { (e.e808 as Record<string, unknown>).slide = 0; }, 'Field "@.e808.slide" in Up Rough song file schema 3 is not true or false.');
    refuse('trap', 'e808', (e) => { (e.e808 as Record<string, unknown>).role = null; }, 'Field "@.e808.role" in Up Rough song file schema 3 is not text.');
  });

  it('refuses a drum vel, role or melody dur of the wrong type', () => {
    refuse('lofi', 'vel', (e) => { e.vel = null; }, 'Field "@.vel" in Up Rough song file schema 3 is not a number.');
    refuse('lofi', 'role', (e) => { e.role = 3; }, 'Field "@.role" in Up Rough song file schema 3 is not text.');
    refuse('lofi', 'dur', (e) => { e.dur = 1.5; }, 'Field "@.dur" in Up Rough song file schema 3 is not a whole number of rows.');
  });
});

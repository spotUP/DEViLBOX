/** Named routines and word slices (owner scratch plan sections 37, 40; SCR-P4.10, P4.11). */
import { describe, it, expect } from 'vitest';
import {
  SCRATCH_ROUTINES, SECTION_ROUTINE, SLOT_SOURCE, routineFor, routineToPlaced, validateRoutine, wordPlan, wordSequence, slotCue, PHRASE_RECORD,
  type RoutineName,
} from '../scratchRoutines';
import { SCRATCH_GESTURE_IDS } from '../scratchGestureCatalog';
import { getScratchRecord } from '../scratchCatalogue';
import { SCRATCH_ROLES } from '../scratchTypes';

describe('the eight routines (section 37, SCR-P4.10)', () => {
  const names = Object.keys(SCRATCH_ROUTINES) as RoutineName[];

  it('there are eight; every gesture exists; every source role maps to a catalogue role carried by its record', () => {
    expect(names.sort()).toEqual(['chirpFlareShowcase', 'default', 'electroTransformer', 'hookCallResponse', 'introDrag', 'phraseEnd', 'phraseReconstruction', 'snareAnswer']);
    for (const r of Object.values(SCRATCH_ROUTINES)) {
      expect(r.events.length).toBeGreaterThan(0);
      for (const ev of r.events) {
        expect(SCRATCH_GESTURE_IDS, `${r.name}: ${ev.gesture}`).toContain(ev.gesture);
        expect(SCRATCH_ROLES).toContain(ev.role);
        const slot = SLOT_SOURCE[ev.sourceRole];
        expect(slot, ev.sourceRole).toBeDefined();
        expect(getScratchRecord(slot.record)!.roles, `${slot.record} carries ${slot.role}`).toContain(slot.role);
      }
      expect(validateRoutine(r), r.name).toEqual([]);
    }
  });

  it('hook call and response plays the call before the answer', () => {
    const roles = SCRATCH_ROUTINES.hookCallResponse.events.map((e) => e.role);
    expect(roles.indexOf('ANSWER')).toBeGreaterThan(roles.lastIndexOf('THEME') - 1);
    expect(roles.slice(0, 2)).toEqual(['THEME', 'THEME']);
    expect(roles.slice(2)).toEqual(['ANSWER', 'ANSWER']);
  });

  it('the section table: intro and outro drag, verse phrase end, hook call and response, breakdown reconstruction, showcase chirp and flare', () => {
    expect(SECTION_ROUTINE.intro).toBe('introDrag');
    expect(SECTION_ROUTINE.verse).toBe('phraseEnd');
    expect(SECTION_ROUTINE.hook).toBe('hookCallResponse');
    expect(SECTION_ROUTINE.call).toBe('hookCallResponse');
    expect(SECTION_ROUTINE.response).toBe('snareAnswer');
    expect(SECTION_ROUTINE.breakdown).toBe('phraseReconstruction');
    expect(SECTION_ROUTINE.showcase).toBe('chirpFlareShowcase');
    expect(SECTION_ROUTINE.outro).toBe('introDrag');
    expect(routineFor('boomBap', 'verse')).toBe('phraseEnd');
    expect(routineFor('electro', 'verse')).toBe('electroTransformer'); // style wins over section
    expect(routineFor('battle', 'intro')).toBe('chirpFlareShowcase');
    expect(routineFor('boomBap', 'nowhere')).toBe('phraseEnd');
  });

  it('a routine lands on the beat grid from its start bar (a step of 16 is the next downbeat)', () => {
    const placed = routineToPlaced(SCRATCH_ROUTINES.phraseEnd, 8);
    expect(placed.map((p) => p.beat)).toEqual([8 * 4 + 14 / 4, 8 * 4 + 15 / 4, 8 * 4 + 16 / 4]);
    expect(placed.map((p) => p.gesture)).toEqual(['forwardStab', 'baby', 'chirp']);
  });
});

describe('word-slice intelligence (section 40, SCR-P4.11)', () => {
  const phrase = getScratchRecord(PHRASE_RECORD)!;

  it('the last word of the nine-word phrase anchors on slice 9 vowel, in seconds', () => {
    expect(phrase.wordSlices).toHaveLength(9);
    const w = wordPlan(phrase, { kind: 'LAST_WORD' })!;
    expect(w.seconds).toBe(phrase.wordSlices[8]!.vowel);
    expect(w.label).toBe('BEAT');
    expect(w.cue).toEqual({ word: 'BEAT' });
  });

  it('WORD(2) of three-two-one is "2"; a missing word is null', () => {
    const count = getScratchRecord('THREE_TWO_ONE')!;
    expect(wordPlan(count, { kind: 'WORD', word: 2 })!.label).toBe('2');
    expect(wordPlan(count, { kind: 'WORD', word: '1' })!.seconds).toBe(count.wordSlices[2]!.vowel);
    expect(wordPlan(count, { kind: 'WORD', word: 7 })).toBeNull();
  });

  it('whole, last, last, whole; a record without slices ends on its tail', () => {
    expect(wordSequence(phrase).map((c) => c.label)).toEqual(['whole phrase', 'BEAT', 'BEAT', 'whole phrase']);
    const one = getScratchRecord('ONE')!;
    expect(wordPlan(one, { kind: 'LAST_WORD' })!.seconds).toBe(one.anchors.tail);
    expect(wordPlan(one, { kind: 'ANCHOR_VOWEL' })!.seconds).toBe(one.anchors.vowel);
  });

  it('phrase reconstruction words resolve on the phrase record', () => {
    for (const slot of ['IF', 'YOU', 'REALLY', 'ROCK', 'FUNKY', 'BEAT'] as const) expect(slotCue(slot).recordId).toBe(PHRASE_RECORD);
    expect(slotCue('PHRASE')).toEqual({ recordId: 'AH_FRESH_FULL_PHRASE', cue: 'attack' });
  });
});

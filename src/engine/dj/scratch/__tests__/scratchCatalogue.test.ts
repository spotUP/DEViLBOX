/**
 * Scratch record catalogue (owner scratch plan sections 11, 14; Gate C;
 * ledger SCR-P2.1, SCR-P2.2): the 50 Up Rough records with their anchors
 * and safe ranges in seconds (metadata samples at 22,050 Hz, SCR-P0.5), and
 * the query the planner asks - "a vocal source suitable for chirp at
 * level 2" - answered with a valid record.
 */
import { describe, it, expect } from 'vitest';
import {
  SCRATCH_RECORDS, SCRATCH_METADATA_RATE, getScratchRecord, findRecords, scoreRecord,
  SCRATCH_RECORD_CATEGORIES, VOCAL_CATEGORIES, referenceRoleToScratchRoles, referenceStyleToScratchStyle,
} from '../scratchCatalogue';
import { GESTURE_LEVELS } from '../scratchGestureCatalog';

describe('the catalogue converts the Up Rough metadata (SCR-P2.1)', () => {
  it('holds 50 records keyed by canonical name, 12 categories, 8 pre-scratched', () => {
    expect(SCRATCH_RECORDS).toHaveLength(50);
    expect(new Set(SCRATCH_RECORDS.map((r) => r.id)).size).toBe(50);
    expect(SCRATCH_RECORD_CATEGORIES).toHaveLength(12);
    expect(SCRATCH_RECORDS.filter((r) => r.preScratched)).toHaveLength(8);
    expect(SCRATCH_RECORDS.filter((r) => r.clean)).toHaveLength(42);
    expect(SCRATCH_METADATA_RATE).toBe(22050);
  });

  it('ONE: anchorVowel = 3300 / 22050 s, the safe ranges in seconds, the pack URL', () => {
    const one = getScratchRecord('ONE')!;
    expect(one.anchors.vowel).toBeCloseTo(3300 / 22050, 6);
    expect(one.anchors.attack).toBe(0);
    expect(one.anchors.tail).toBeCloseTo(8459 / 22050, 6);
    expect(one.safe[0]).toBeCloseTo(289 / 22050, 6);
    expect(one.safe[1]).toBeCloseTo(8459 / 22050, 6);
    expect(one.safeForward).toEqual([one.anchors.vowel, one.safe[1]]);
    expect(one.safeReverse).toEqual([one.safe[0], one.anchors.vowel]);
    expect(one.durationSec).toBeCloseTo(0.4349, 4);
    expect(one.file).toBe('scratch_024.wav');
    expect(one.url).toMatch(/data\/samples\/packs\/scratch-originals\/scratch_024\.wav$/);
    expect(one.category).toBe('COUNT');
    expect(one.gestures).toEqual(['forwardStab', 'transformer8']);
    expect(one.styles).toEqual(['oldSchool', 'electro']);
    expect(one.roles).toContain('INTRO');
    expect(one.voicedAmount).toBe(1);
    expect(one.transientCount).toBe(5);
    expect(one.onsetRate).toBe(11.5);
    // section 11: the anchor the planner hands the executor
    expect(one.anchor).toEqual({ position: one.anchors.vowel, safe: one.safe, safeForward: one.safeForward, safeReverse: one.safeReverse });
  });

  it('THREE_TWO_ONE has 3 word slices in seconds with a vowel inside each', () => {
    const r = getScratchRecord('THREE_TWO_ONE')!;
    expect(r.wordSlices).toHaveLength(3);
    expect(r.wordSlices.map((w) => w.name)).toEqual(['3', '2', '1']);
    expect(r.wordSlices[0]!.start).toBeCloseTo(143 / 22050, 6);
    expect(r.wordSlices[2]!.end).toBeCloseTo(37864 / 22050, 6);
    for (const w of r.wordSlices) {
      expect(w.start).toBeLessThan(w.vowel);
      expect(w.vowel).toBeLessThan(w.end);
      expect(w.end).toBeLessThanOrEqual(r.durationSec + 0.001);
    }
    expect(SCRATCH_RECORDS.filter((r) => r.wordSlices.length > 0)).toHaveLength(12);
  });

  it('pre-scratched records carry only drop; a clean record never carries a continuous-platter technique', () => {
    expect(getScratchRecord('SCRATCH_005')!.gestures).toEqual(['drop']);
    for (const r of SCRATCH_RECORDS) {
      if (r.preScratched) expect(r.gestures).toEqual(['drop']);
      expect(r.gestures).not.toContain('hydroplane');
    }
  });

  it('reference roles and styles map onto the section 83 / 32 vocabularies', () => {
    expect(referenceRoleToScratchRoles('answer')).toEqual(['ANSWER']);
    expect(referenceRoleToScratchRoles('hook')).toEqual(['THEME']);
    expect(referenceRoleToScratchRoles('showcase')).toEqual(['FEATURE']);
    expect(referenceRoleToScratchRoles('unknown')).toEqual([]);
    expect(referenceStyleToScratchStyle('boombap')).toBe('boomBap');
    expect(referenceStyleToScratchStyle('old_school')).toBe('oldSchool');
    expect(referenceStyleToScratchStyle('lofi')).toBe('loFi');
    const all = new Set(SCRATCH_RECORDS.flatMap((r) => r.styles));
    expect([...all].sort()).toEqual(['battle', 'boomBap', 'electro', 'loFi', 'oldSchool']);
  });
});

describe('catalogue query (Gate C completion, SCR-P2.2)', () => {
  it('"a vocal source suitable for chirp at level 2" returns a clean AH_VOWEL / YEAH_RESPONSE / FRESH record that carries chirp', () => {
    const hits = findRecords({ gesture: 'chirp', level: 2, clean: true, vocal: true });
    expect(hits.length).toBeGreaterThan(0);
    const first = hits[0]!;
    expect(first.clean).toBe(true);
    expect(first.gestures).toContain('chirp');
    expect(['AH_VOWEL', 'YEAH_RESPONSE', 'FRESH']).toContain(first.category);
    for (const r of hits) {
      expect(r.clean).toBe(true);
      expect(r.gestures).toContain('chirp');
      expect(VOCAL_CATEGORIES).toContain(r.category);
    }
    expect(GESTURE_LEVELS.chirp).toBeLessThanOrEqual(2);
  });

  it('a level cap refuses a gesture above it, a category filter is hard, and the ranking is deterministic', () => {
    expect(findRecords({ gesture: 'crab', level: 2 })).toEqual([]);
    expect(findRecords({ category: 'COUNT' }).every((r) => r.category === 'COUNT')).toBe(true);
    expect(findRecords({ category: 'COUNT' })).toHaveLength(4);
    const a = findRecords({ role: 'ANSWER', style: 'boomBap' }).map((r) => r.id);
    const b = findRecords({ role: 'ANSWER', style: 'boomBap' }).map((r) => r.id);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
    expect(getScratchRecord(a[0]!)!.roles).toContain('ANSWER');
  });

  it('scores: roleFit + styleFit + gestureFit + anchorQuality (voiced amount) - repetition', () => {
    const ah = getScratchRecord('AH_STANDARD')!;
    const full = scoreRecord(ah, { role: 'THEME', style: 'boomBap', gesture: 'chirp' });
    expect(full).toBeCloseTo(1 + 1 + 1 + ah.voicedAmount, 6);
    expect(scoreRecord(ah, { role: 'THEME', style: 'boomBap', gesture: 'chirp', recent: ['AH_STANDARD', 'AH_STANDARD'] })).toBeCloseTo(full - 1, 6);
    expect(scoreRecord(ah, { role: 'INTRO' })).toBeCloseTo(ah.voicedAmount, 6);
    // repetition demotes: a just-used record drops below an equal unused one
    const hits = findRecords({ gesture: 'chirp', clean: true, vocal: true, recent: ['AH_ALT'] });
    expect(hits[0]!.id).not.toBe('AH_ALT');
  });
});

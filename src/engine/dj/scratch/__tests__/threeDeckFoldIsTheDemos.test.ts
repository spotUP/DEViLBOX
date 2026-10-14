/**
 * SCRATCH-FOLD-OVERLAY: over a fast set the three-deck routine plays half-time INSIDE each section of the set's
 * 32-bar arc (the demo's three_deck.build_scratch_events(fold=...), commit be56beced) - it no longer stretches over
 * 64 of the set's bars, so the juggle sections keep Deck C silent (two hands). Null test against the demo's own
 * events (fixture gen_three_deck_fold.py): fold 2 (a 116-230 BPM set) and fold 0.5 (under 57.5), both routines.
 */
import { describe, it, expect } from 'vitest';
import fixture from './fixtures/three_deck_fold.json';
import { buildThreeDeckRoutine, THREE_DECK_ARC, THREE_DECK_BUDGET } from '../scratchDemoRoutines';
import { REFERENCE_GESTURE_IDS } from '../scratchGestureCatalog';
import type { ScratchGestureId } from '../scratchTypes';

const gid = (ref: string): ScratchGestureId => (ref === 'needle_drop' ? 'needleDrop' : ref === 'needle_lift' ? 'needleLift' : REFERENCE_GESTURE_IDS[ref]!);
type Row = { seed: number; fold: number; emphasis: boolean; events: Array<[number, number, string, string, number]> };

describe('the three-deck routine over a fast set is the demo\'s, folded inside its sections', () => {
  it('event for event = three_deck.build_scratch_events(seed, fold) at fold 2 and 0.5, rotation and statement-and-chop', () => {
    const rows = (fixture as unknown as { rows: Row[] }).rows;
    expect(rows.length).toBe(24);
    for (const row of rows) {
      const mine = buildThreeDeckRoutine(row.seed, { budget: THREE_DECK_BUDGET, fold: row.fold, phraseEmphasis: row.emphasis });
      expect(mine.map((e) => [e.bar, e.step, e.cueRole, e.gesture]), `seed ${row.seed} fold ${row.fold}`).toEqual(row.events.map(([b, s, r, g]) => [b, s, r, gid(g)]));
      mine.forEach((e, i) => expect(e.velocity).toBeCloseTo(row.events[i]![4], 9));
    }
  });

  it('at fold 2 the routine stays in the set\'s 32 bars and Deck C is silent in the juggle sections', () => {
    const silent = THREE_DECK_ARC.filter(([, , , , , role]) => role === 'silent').map(([, b0, bars]) => [b0, b0 + bars] as const);
    expect(silent.length).toBeGreaterThan(0);
    const ev = buildThreeDeckRoutine(0, { fold: 2 });
    expect(Math.max(...ev.map((e) => e.bar))).toBe(31);
    expect(ev.filter((e) => e.gesture !== 'needleLift' && silent.some(([a, b]) => e.bar >= a && e.bar < b))).toEqual([]);
    // every stroke on the set's 8th grid: a routine 16th is two of the set's
    expect(ev.every((e) => e.step % 2 === 0 || e.gesture.startsWith('needle'))).toBe(true);
  });
});

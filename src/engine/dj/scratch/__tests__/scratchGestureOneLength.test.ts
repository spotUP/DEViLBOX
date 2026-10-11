/**
 * Audit SA-B2 (thoughts/shared/research/2026-10-12_scratch-work-audit.md, owner scratch plan
 * sections 10, 83): a gesture has ONE length. The planner places it, the executor releases on
 * it and the stroke runs over it. Before the fix the executor released a Baby Scratch after
 * `durationSteps / 4` = 0.5 beat while its stroke cycle was 1 beat: the push played, the
 * pull never did; a chirp (0.5 beat vs a 0.25-beat cycle) played twice.
 */
import { describe, it, expect } from 'vitest';
import { SCRATCH_GESTURES, getGesture, gestureBeats } from '../scratchGestureCatalog';
import { toScratchEvents } from '../scratchPlanner';
import { deckAnchor } from '../scratchAnchor';
import { SCRATCH_PATTERNS } from '../../DJScratchEngine';
import type { PlacedScratch } from '../scratchPlacement';
import type { ScratchGestureId } from '../scratchTypes';

const placed = (gesture: ScratchGestureId): PlacedScratch => ({
  bar: 2, step: 0, beat: 8, gesture, velocity: 0.8, placementRole: 'accent', role: 'ACCENT',
});

function eventFor(gesture: ScratchGestureId) {
  const anchor = deckAnchor(10, 20, 'downbeat', 120);
  return toScratchEvents([placed(gesture)], { type: 'DECK', deck: 'A', anchor }, anchor, {
    bpm: 120, seed: 1, humanize: false,
  })[0]!;
}

describe('a gesture has one length (SA-B2)', () => {
  it('a planned Baby Scratch lasts its push and its pull: the event is one whole stroke cycle', () => {
    const baby = getGesture('baby');
    expect(eventFor('baby').durationBeats).toBe(baby.cycleBeats);
  });

  it('a planned chirp is one chirp, not two: its event is one stroke cycle', () => {
    expect(eventFor('chirp').durationBeats).toBe(getGesture('chirp').cycleBeats);
  });

  it('every gesture: the event is a whole number of stroke cycles, and the deck pattern runs the same cycle', () => {
    for (const g of SCRATCH_GESTURES) {
      const cycles = eventFor(g.id).durationBeats / g.cycleBeats;
      expect(Math.abs(cycles - Math.round(cycles)), g.id).toBeLessThan(1e-9);
      expect(Math.round(cycles), g.id).toBeGreaterThanOrEqual(1);
      expect(gestureBeats(g.id), g.id).toBe(g.durationSteps / 4);
    }
    for (const p of SCRATCH_PATTERNS) expect(p.durationBeats, p.name).toBe(getGesture(p.gestureId).cycleBeats);
  });
});

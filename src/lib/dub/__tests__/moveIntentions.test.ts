import { describe, it, expect } from 'vitest';
import { MOVE_INTENTIONS, moveServes, movesForIntention } from '../moveIntentions';
import { MOVES_FOR_TEST } from './moveIntentions.fixtures';

describe('MOVE_INTENTIONS — what each move can express', () => {
  it('tags every move the router can fire', () => {
    const untagged = MOVES_FOR_TEST.filter(id => !(id in MOVE_INTENTIONS));
    expect(untagged).toEqual([]);
  });

  it('never claims REST — resting is not something you press', () => {
    for (const [moveId, tags] of Object.entries(MOVE_INTENTIONS)) {
      expect(tags, moveId).not.toContain('REST');
    }
  });

  it('never claims RESET — the remedy is letting go, not firing', () => {
    expect(movesForIntention('RESET')).toEqual([]);
  });

  it('keeps additive moves out of SPACE', () => {
    for (const moveId of ['springSlam', 'echoBuildUp', 'snareCrack', 'subSwell']) {
      expect(moveServes(moveId, 'SPACE'), moveId).toBe(false);
    }
  });

  it('offers something for every intention a planner can choose except RESET', () => {
    for (const intention of ['ACCENT', 'ANSWER', 'SPACE', 'BUILD', 'DROP', 'TEXTURE', 'TRANSITION'] as const) {
      expect(movesForIntention(intention).length, intention).toBeGreaterThan(0);
    }
  });

  it('treats an unknown move as colour only, not as a drop', () => {
    expect(moveServes('someFutureMove', 'TEXTURE')).toBe(true);
    expect(moveServes('someFutureMove', 'DROP')).toBe(false);
    expect(moveServes('someFutureMove', 'ACCENT')).toBe(false);
  });
});

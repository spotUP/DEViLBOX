/**
 * Which moves have a parameter worth MOVING while they are held, and between
 * what values.
 *
 * Gate F4's shapes (`ramp`, `sweep`) need three things: a move that accepts a
 * parameter mid-flight, a parameter worth travelling, and a range. The first
 * is the move's own business (`DubMoveHandle.update`); the last two are this
 * table, kept here so the performer, the deck and any future surface all reach
 * for the same answer rather than each inventing a range.
 *
 * Deliberately short. A move belongs here only when the travel is the POINT of
 * the gesture — a filter closing under the hand. A delay preset has parameters
 * too, and sliding through them is not a musical gesture, it is a bug.
 */

import type { AutomatedShape, ShapeCurve } from './gestureShape';

export interface MoveAutomation {
  /** Default shape when a caller does not name one. */
  shape: AutomatedShape;
  param: string;
  from: number;
  to: number;
  curve: ShapeCurve;
}

export const MOVE_AUTOMATION: Readonly<Record<string, MoveAutomation>> = {
  /**
   * The filter closing and opening again across the hold — the gesture the
   * move is named for, which until now it could only approximate with a fixed
   * down-ramp of its own.
   *
   * Exponential: a linear ramp from 20 kHz to 220 Hz spends most of its travel
   * in the top octave, where almost nothing is heard, then falls off a cliff.
   * Sweep rather than ramp, because a filter drop that never comes back is a
   * filter that was simply turned down.
   */
  filterDrop: { shape: 'sweep', param: 'targetHz', from: 20000, to: 220, curve: 'exponential' },
};

export function automationFor(moveId: string): MoveAutomation | null {
  return MOVE_AUTOMATION[moveId] ?? null;
}

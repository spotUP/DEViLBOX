/**
 * The scratch safety governor (owner plan `thoughts/shared/plans/2026-10-08-dj-view-scratch-plan.md`
 * sections 56, 59; ledger SCR-P6.9, P8.1): a pure validator with final authority over every
 * request the creative modules make. It never decides what to play; it refuses what must not
 * be played, with a reason.
 */

import { getGesture } from './scratchGestureCatalog';
import { STEPS_PER_BEAT, DEFAULT_GRID, type ScratchGrid } from './scratchAnchor';
import type { ScratchGestureId } from './scratchTypes';

/** Section 56 "maximum cut rate": crossfader cuts per beat a request may ask for. */
export const MAX_CUTS_PER_BEAT = 16;

export interface SafetyVerdict { ok: boolean; reason?: string }

/**
 * Cuts per beat a gesture asks for on a grid: its fader windows per stroke cycle over the cycle's
 * beats, scaled by how much finer the grid is than the 1/16 the gesture is written on.
 */
export function cutsPerBeat(gesture: ScratchGestureId, grid: ScratchGrid = DEFAULT_GRID): number {
  const g = getGesture(gesture);
  const windows = Math.max(1, g.faderWindows.length);
  return (windows / Math.max(1e-6, g.cycleBeats)) * (STEPS_PER_BEAT[grid] / STEPS_PER_BEAT[DEFAULT_GRID]);
}

/** Refuse a request over the maximum cut rate (an explicit `cutsPerBeat` or a gesture on a grid). */
export function checkCutRate(request: { gesture?: ScratchGestureId; grid?: ScratchGrid; cutsPerBeat?: number }): SafetyVerdict {
  const rate = request.cutsPerBeat ?? (request.gesture ? cutsPerBeat(request.gesture, request.grid) : 0);
  if (rate > MAX_CUTS_PER_BEAT) return { ok: false, reason: `${rate.toFixed(1)} cuts per beat > ${MAX_CUTS_PER_BEAT}` };
  return { ok: true };
}

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

// ─── Priority order (section 28; ledger SCR-P7.10) ───────────────────────

/** Section 28, highest first: never sacrifice timing for a scratch trick. */
export const PRIORITY_ORDER = [
  'timing', 'deckSync', 'transition', 'bassOwnership', 'vocalClarity', 'beatJuggling', 'scratchFeature', 'secondaryFx', 'humanization',
] as const;
export type PriorityKind = typeof PRIORITY_ORDER[number];

export interface PerformanceRequest {
  kind: PriorityKind;
  /** Beats on one clock; `deck` undefined = the whole mix (a transition start). */
  startBeat: number;
  endBeat: number;
  deck?: 'A' | 'B';
  /** The latest start the request still makes sense at (a moved scratch past it is refused). */
  latestStartBeat?: number;
  id?: string;
}

export interface ConflictResolution {
  accepted: PerformanceRequest[];
  moved: Array<{ request: PerformanceRequest; fromBeat: number; reason: string }>;
  refused: Array<{ request: PerformanceRequest; reason: string }>;
}

const rank = (k: PriorityKind): number => PRIORITY_ORDER.indexOf(k);
const clash = (a: PerformanceRequest, b: PerformanceRequest): boolean =>
  (a.deck === undefined || b.deck === undefined || a.deck === b.deck) && a.startBeat < b.endBeat - 1e-9 && b.startBeat < a.endBeat - 1e-9;

/**
 * Section 28: requests are granted highest priority first; a lower one that collides with a
 * granted one (same deck, or a whole-mix moment) moves to the next 1/16 step after it, or is
 * refused when that is past its latest start. A scratch never delays a transition start or a
 * phase correction: they are higher, so they keep their beats.
 */
export function resolveConflicts(requests: readonly PerformanceRequest[]): ConflictResolution {
  const out: ConflictResolution = { accepted: [], moved: [], refused: [] };
  const sorted = [...requests].sort((a, b) => rank(a.kind) - rank(b.kind) || a.startBeat - b.startBeat);
  for (const r of sorted) {
    let req = r;
    for (let guard = 0; guard < 64; guard++) {
      const hit = out.accepted.find((g) => rank(g.kind) < rank(req.kind) && clash(g, req));
      if (!hit) break;
      const len = req.endBeat - req.startBeat;
      const start = Math.ceil(hit.endBeat * 4 - 1e-9) / 4;
      req = { ...req, startBeat: start, endBeat: start + len };
    }
    if (req !== r) {
      if (r.latestStartBeat !== undefined && req.startBeat > r.latestStartBeat + 1e-9) {
        out.refused.push({ request: r, reason: `${r.kind} at beat ${r.startBeat} collides with a higher priority and cannot move before ${r.latestStartBeat}` });
        continue;
      }
      out.moved.push({ request: req, fromBeat: r.startBeat, reason: `${r.kind} moved after a higher priority (section 28)` });
    }
    out.accepted.push(req);
  }
  return out;
}

/**
 * The scratch safety governor (owner plan `thoughts/shared/plans/2026-10-08-dj-view-scratch-plan.md`
 * sections 56, 59; ledger SCR-P6.9, P8.1): a pure validator with final authority over every
 * request the creative modules make. It never decides what to play; it refuses what must not
 * be played, with a reason.
 */

import { getGesture } from './scratchGestureCatalog';
import { STEPS_PER_BEAT, DEFAULT_GRID, type ScratchGrid } from './scratchAnchor';
import type { ScratchEvent, ScratchGestureId } from './scratchTypes';
import { getScratchRecord } from './scratchCatalogue';
import { motionPeak } from './scratchPhysics';
import { MAX_RATE } from './scratchAnchor';

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

// ─── The governor (section 59; ledger SCR-P8.1) ──────────────────────────

export type SafetyRule =
  | 'bothDecksSilent' | 'invalidDeck' | 'invalidSource' | 'unsafeRange' | 'conflict'
  | 'excessiveRate' | 'excessiveCuts' | 'vocalCollision' | 'bassCollision' | 'stuck';

/** What the governor knows of the moment (read by the caller from the decks and the analysis). */
export interface SafetyState {
  decksPlaying: Readonly<Record<'A' | 'B', boolean>>;
  /** Vocal / bass activity of the master track at a beat (0..1). */
  vocalAt(beat: number): number;
  bassAt(beat: number): number;
  /** The source is bass material (a bass channel / hit). */
  bassSource?: boolean;
  /** Beat each deck is busy with an accepted scratch until (one hand per deck). */
  deckBusyUntil?: Partial<Record<'A' | 'B', number>>;
  /** A transient record (tracker sample) the pool holds. */
  hasRecord?(id: string): boolean;
  /** The master tempo: the gesture's real length, so its motion's real peak (120 when unknown). */
  bpm?: number;
}

export type SafetyVerdictFull = { ok: true } | { ok: false; rule: SafetyRule; reason: string };

/** Reachability sentinel: every check and every refusal by rule. */
export const scratchSafetyStats: { check: number; refused: Partial<Record<SafetyRule, number>> } = { check: 0, refused: {} };

const refuse = (rule: SafetyRule, reason: string): SafetyVerdictFull => {
  scratchSafetyStats.refused[rule] = (scratchSafetyStats.refused[rule] ?? 0) + 1;
  return { ok: false, rule, reason };
};

/**
 * Section 59: final authority over every planned scratch. The creative modules propose; this
 * refuses what must not be played, with the rule's name.
 *
 * `demo`: a stroke of the demo's own plan (P13, `layer: 'demo'`) - the demo has no governor, so only the
 * structural rules hold it (no deck playing, a source or deck that is not there, an anchor outside the
 * record); the musical rules (rate, cuts, vocal, bass) govern the DEViLBOX extras alone.
 */
export function checkScratch(e: ScratchEvent, state: SafetyState, opts: { demo?: boolean } = {}): SafetyVerdictFull {
  scratchSafetyStats.check++;
  const deck = e.deck ?? (e.source.type === 'CRATE' ? undefined : e.source.deck);
  if (!state.decksPlaying.A && !state.decksPlaying.B) return refuse('bothDecksSilent', 'both decks are silent: a scratch alone is not a mix (no-silence rule)');
  if (deck !== undefined && deck !== 'A' && deck !== 'B') return refuse('invalidDeck', `deck ${String(deck)}`);
  if ((e.source.type === 'DECK' || e.source.type === 'TRACKER_CHANNEL') && deck && !state.decksPlaying[deck]) return refuse('invalidDeck', `deck ${deck} is not playing`);
  const throwG = e.gesture === 'drop' || e.gesture === 'dropPhrase';
  if (e.source.type === 'CRATE') {
    const r = getScratchRecord(e.source.recordId);
    if (!r) return refuse('invalidSource', `no record ${e.source.recordId}`);
    if (!throwG && !r.clean) return refuse('invalidSource', `${r.id} is pre-scratched: a throw only`);
    if (e.anchor.position < r.safe[0] - 1e-9 || e.anchor.position > r.safe[1] + 1e-9) return refuse('unsafeRange', `anchor ${e.anchor.position.toFixed(3)} s outside ${r.id}'s safe range`);
  }
  if (e.source.type === 'TRACKER_SAMPLE' && state.hasRecord && !state.hasRecord(`TRACKER_${e.source.deck}_${e.source.sampleId}`)) return refuse('invalidSource', 'the tracker sample is not loaded');
  if (deck && (e.source.type === 'DECK' || e.source.type === 'TRACKER_CHANNEL')) {
    const busy = state.deckBusyUntil?.[deck];
    if (busy !== undefined && e.executeAtBeat < busy - 1e-9) return refuse('conflict', `deck ${deck} is already scratched until beat ${busy.toFixed(2)}`);
  }
  if (opts.demo) return { ok: true };
  const g = getGesture(e.gesture);
  // the fastest the record moves in this gesture: the turntable model's motion at the event's velocity
  const peak = motionPeak(g, g.cycleBeats * 60 / Math.max(30, state.bpm ?? 120), e.velocity);
  if (peak > MAX_RATE + 1e-9) return refuse('excessiveRate', `peak rate ${peak.toFixed(2)} > ${MAX_RATE}`);
  const cuts = checkCutRate({ gesture: e.gesture });
  if (!cuts.ok) return refuse('excessiveCuts', cuts.reason!);
  if (state.vocalAt(e.executeAtBeat) > 0.7 && e.role !== 'ANSWER' && !throwG) return refuse('vocalCollision', 'over a strong vocal, only an answer');
  if (state.bassSource && state.bassAt(e.executeAtBeat) > 0.6) return refuse('bassCollision', 'a bass source over a bass-heavy bar');
  return { ok: true };
}

/** A performing state with no event for more than 8 bars is stuck (the controller aborts it). */
export const STUCK_BARS = 8;
export function checkStuck(performing: boolean, currentBar: number, lastEventBar: number | null): SafetyVerdictFull {
  if (performing && lastEventBar !== null && currentBar - lastEventBar > STUCK_BARS) return refuse('stuck', `no scratch for ${currentBar - lastEventBar} bars while performing`);
  return { ok: true };
}

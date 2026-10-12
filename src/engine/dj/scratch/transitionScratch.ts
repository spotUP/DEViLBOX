/**
 * Scratch inside a transition (owner plan `thoughts/shared/plans/2026-10-08-dj-view-scratch-plan.md`
 * sections 44-48; ledger D8, SCR-P7.1-P7.5, P7.8). Given a planned transition, decide whether a
 * scratch belongs in it and what kind:
 *
 *   scratchAccent      decoration on a normal blend (section 46), the section 45 good pairs
 *   scratchFeature     the outgoing deck performed at its phrase end, then reduced while the
 *                      incoming drops (section 47)
 *   scratchTransition  the scratch IS the transition: a 4-bar transformer feature on the
 *                      outgoing material into the incoming drop, then the release (section 46)
 *   scratchBattle      the set's peak in BATTLE mode
 *
 * plus a vocal response: an incoming vocal onset in the first two bars is answered (section 48).
 * Risky pairs (section 45) are reduced or refused with a reason. Pure and deterministic; events
 * are on the outgoing deck's beat clock (the plan's `startBeat` space).
 */

import type { DJTrackAnalysis, DJTransitionPlan, TransitionStyle } from '../autodj/types';
import { findRecords, getScratchRecord } from './scratchCatalogue';
import { deckAnchor, anchorFor } from './scratchAnchor';
import { getGesture, gestureBeats } from './scratchGestureCatalog';
import { humanizeMs, throwBeats, type PlacedScratch } from './scratchPlacement';
import { lfsr } from './scratchRandom';
import { isThrowGesture } from './scratchPlacement';
import type { ScratchMode } from './scratchStyles';
import { resolveConflicts } from './ScratchSafety';
import type { ScratchEvent, ScratchGestureId, ScratchRole, ScratchSource } from './scratchTypes';

export type TransitionScratchKind = 'scratchAccent' | 'scratchFeature' | 'scratchTransition' | 'scratchBattle';
export type ScratchFxRequest = 'dry' | 'dubbed' | 'transition';

/** `DJTransitionPlan.scratch` (D8). */
export interface TransitionScratchPlan {
  kind: TransitionScratchKind;
  events: ScratchEvent[];
  source: ScratchSource;
  startBeat: number;
  endBeat: number;
  fxRequest?: ScratchFxRequest;
  /** Why it is what it is (a reduced risky pair says so). */
  reasons: string[];
}

/** Section 45 pairs: what a style takes, or why it is risky. */
interface Compatibility {
  fit: 'good' | 'risky' | 'none';
  gestures: readonly ScratchGestureId[];
  source: 'crate' | 'outgoing';
  /** Accents per 4 bars of the transition. */
  perFourBars: number;
  fx: ScratchFxRequest;
  why: string;
}

export const SCRATCH_COMPATIBILITY: Readonly<Partial<Record<TransitionStyle, Compatibility>>> = {
  longBlend: { fit: 'good', gestures: ['baby', 'babySlow'], source: 'crate', perFourBars: 1, fx: 'dubbed', why: 'long blend + sparse scratch' },
  shortBlend: { fit: 'good', gestures: ['chirp'], source: 'crate', perFourBars: 2, fx: 'dry', why: 'short blend + chirp' },
  breakdownMix: { fit: 'good', gestures: ['baby', 'chirp'], source: 'crate', perFourBars: 2, fx: 'dubbed', why: 'breakdown mix + vocal scratch' },
  dropMix: { fit: 'good', gestures: ['transformer4', 'transformer8'], source: 'crate', perFourBars: 2, fx: 'dry', why: 'drop mix + transformer' },
  hardCut: { fit: 'good', gestures: ['forwardStab'], source: 'crate', perFourBars: 2, fx: 'dry', why: 'hard cut + stab' },
  drumIntroMix: { fit: 'good', gestures: ['baby', 'forwardStab'], source: 'outgoing', perFourBars: 2, fx: 'dry', why: 'drum intro mix + drum scratch' },
  echoOut: { fit: 'risky', gestures: ['forwardStab'], source: 'crate', perFourBars: 1, fx: 'dry', why: 'echo out + heavy scratch: one light accent before the echo' },
  vocalSwap: { fit: 'risky', gestures: ['forwardStab'], source: 'outgoing', perFourBars: 1, fx: 'dry', why: 'vocal swap + vocal scratch: no vocal source, one drum accent' },
  bassSwap: { fit: 'risky', gestures: ['forwardStab'], source: 'crate', perFourBars: 1, fx: 'dry', why: 'bass swap + bass scratch: never a bass source, one accent' },
  filterBuild: { fit: 'risky', gestures: ['chirp'], source: 'crate', perFourBars: 1, fx: 'dry', why: 'filter build + dense scratch: one accent' },
};

const MODE_RANK: Readonly<Record<ScratchMode, number>> = { OFF: 0, SAFE: 1, MUSICAL: 2, PERFORMER: 3, BATTLE: 4 };

export interface TransitionScratchInput {
  plan: Pick<DJTransitionPlan, 'style' | 'startBeat' | 'endBeat' | 'durationBeats' | 'beatsPerBar' | 'outgoingDeck' | 'incomingDeck' | 'incomingPosition' | 'effects'>;
  outgoing: DJTrackAnalysis;
  incoming: DJTrackAnalysis;
  mode: ScratchMode;
  /** Hands left for scratching (section 27, `scratchPermission`), 0..4. */
  permission: number;
  creativeRisk: number;
  setPhase: string;
  seed: number;
  /** Gestures the set scratched lately (session memory, SCR-P7.12): the accents rotate away from them. */
  recentGestures?: readonly string[];
}

export interface TransitionScratchResult { scratch?: TransitionScratchPlan; reason: string }

function crateSource(gesture: ScratchGestureId, role: ScratchRole, vocal: boolean): ScratchSource | null {
  const r = findRecords({ gesture, role, clean: true, vocal })[0] ?? findRecords({ role, clean: true, vocal })[0];
  if (!r) return null;
  return { type: 'CRATE', recordId: r.id, anchor: { position: r.anchors.vowel, safe: r.safe, safeForward: r.safeForward, safeReverse: r.safeReverse } };
}

function outgoingSource(plan: TransitionScratchInput['plan'], outgoing: DJTrackAnalysis, beat: number): ScratchSource {
  const b = outgoing.beatGrid.beats[Math.max(0, Math.min(outgoing.beatGrid.beats.length - 1, Math.round(beat)))];
  const a = deckAnchor(b?.time ?? 0, Math.round(beat), 'downbeat', outgoing.bpm);
  return { type: 'DECK', deck: plan.outgoingDeck, anchor: a };
}

/** Placed (bar, step) -> executor events on the outgoing clock, humanized from the seed. */
function toEvents(placed: ReadonlyArray<PlacedScratch & { beatAbs: number }>, source: ScratchSource, deck: 'A' | 'B', bpm: number, seed: number): ScratchEvent[] {
  const rnd = lfsr(seed * 37 + 11);
  let prev: number | null = null;
  return placed.map((p) => {
    const g = getGesture(p.gesture);
    const off = humanizeMs(p, rnd, bpm, prev);
    prev = off;
    const anchor = source.type === 'CRATE' ? (anchorFor(source, p.role) ?? source.anchor) : source.type === 'DECK' ? source.anchor : { position: 0, safe: [0, 1] as const, safeForward: [0, 1] as const, safeReverse: [0, 0] as const };
    return {
      executeAtBeat: p.beatAbs, durationBeats: p.beats ?? gestureBeats(p.gesture), role: p.role, source, anchor, gesture: p.gesture,
      velocity: p.velocity, humanizeMs: off, intensity: g.intensity, deck: source.type === 'DECK' ? source.deck : deck,
      returnToAnchor: g.returnsToAnchor && !isThrowGesture(p.gesture),
    };
  });
}

const placed = (startBeat: number, bar: number, step: number, gesture: ScratchGestureId, role: ScratchRole, bpb: number, velocity = 0.8): PlacedScratch & { beatAbs: number } => ({
  bar, step, beat: bar * bpb + step / 4, beatAbs: startBeat + bar * bpb + step / 4, gesture, velocity, placementRole: step >= 14 ? 'turnaround' : step >= 6 && step <= 8 ? 'answer' : 'accent', role,
});

/**
 * Section 48: the incoming's first vocal inside the first two bars of the transition, as an
 * outgoing beat (null when there is none).
 */
export function incomingVocalCallBeat(input: TransitionScratchInput): number | null {
  const v = input.incoming.cuePoints.firstVocal;
  const bpb = input.plan.beatsPerBar;
  const beatSec = 60 / Math.max(1, input.incoming.bpm);
  if (v === undefined || v < input.plan.incomingPosition) return null;
  const beats = (v - input.plan.incomingPosition) / beatSec;
  return beats < 2 * bpb ? input.plan.startBeat + beats : null;
}

/** The scratch a transition carries, or why none. */
/** The gesture of `pool` the set used least lately (section 29 variety); ties broken by the seeded draw. */
export function leastRecent(pool: readonly ScratchGestureId[], recent: readonly string[], rnd: () => number): ScratchGestureId {
  const uses = pool.map((g) => recent.filter((r) => r === g).length);
  const min = Math.min(...uses);
  const fewest = pool.filter((_, i) => uses[i] === min);
  return fewest[Math.floor(rnd() * fewest.length)]!;
}

export function planTransitionScratch(input: TransitionScratchInput): TransitionScratchResult {
  const { plan, mode, permission, outgoing } = input;
  const rank = MODE_RANK[mode];
  if (rank === 0) return { reason: 'Auto Scratch off' };
  if (permission <= 0) return { reason: 'no hands left for a scratch (section 27)' };
  const compat = SCRATCH_COMPATIBILITY[plan.style];
  if (!compat) return { reason: `no scratch for ${plan.style}` };
  const bpb = plan.beatsPerBar || 4;
  const bars = Math.max(1, Math.floor(plan.durationBeats / bpb));
  const reasons: string[] = [compat.why];
  const out: Array<PlacedScratch & { beatAbs: number }> = [];
  let kind: TransitionScratchKind = 'scratchAccent';
  let source: ScratchSource | null;
  let fx: ScratchFxRequest = compat.fx;

  const transitionWanted = compat.fit === 'good' && rank >= MODE_RANK.PERFORMER && input.creativeRisk >= 0.5 && input.incoming.cuePoints.firstDrop !== undefined && permission >= 2;
  const battle = compat.fit === 'good' && mode === 'BATTLE' && input.setPhase === 'PEAK' && permission >= 4;
  if (battle || transitionWanted) {
    // section 46: the last four bars of the outgoing are the feature: transformer cuts building, a release at the end
    kind = battle ? 'scratchBattle' : 'scratchTransition';
    const firstBar = Math.max(0, bars - 4);
    const cut: ScratchGestureId = permission >= 3 || battle ? 'transformer8' : 'transformer4';
    const steps = [[0, 8], [0, 4, 8, 12], [0, 4, 8, 12], [0, 8]];
    for (let k = 0; k < Math.min(4, bars); k++) {
      for (const step of steps[k]!) out.push(placed(plan.startBeat, firstBar + k, step, battle && k >= 2 ? 'crab' : cut, 'FEATURE', bpb, 0.85));
    }
    out.push(placed(plan.startBeat, firstBar + Math.min(4, bars) - 1, 12, 'forwardStab', 'OUTRO', bpb, 0.9));
    source = outgoingSource(plan, outgoing, plan.startBeat + firstBar * bpb);
    fx = battle ? 'dry' : 'transition';
    reasons.push(`${kind}: ${Math.min(4, bars)} bars on the outgoing into the incoming drop`);
  } else if (compat.fit === 'good' && rank >= MODE_RANK.MUSICAL && compat.source === 'crate' && plan.style !== 'hardCut') {
    // section 47: perform the outgoing at its phrase end (the bar before the incoming), then reduce it
    kind = 'scratchFeature';
    const g = compat.gestures[0]!;
    source = outgoingSource(plan, outgoing, plan.startBeat - bpb);
    out.push(placed(plan.startBeat - bpb, 0, 8, g, 'THEME', bpb));
    out.push(placed(plan.startBeat - bpb, 0, 12, compat.gestures[1] ?? g, 'FILL', bpb));
    reasons.push(`${kind}: the outgoing's phrase end before the incoming enters`);
  } else {
    // accents through the transition (section 46 "small scratch accents"), the risky pairs reduced to one
    const n = compat.fit === 'risky' ? 1 : Math.max(1, Math.round(compat.perFourBars * bars / 4));
    const rnd = lfsr(input.seed * 13 + 5);
    for (let i = 0; i < n; i++) {
      const bar = compat.fit === 'risky' ? 0 : Math.min(bars - 1, Math.floor((i + 0.5) * bars / n));
      const g = leastRecent(compat.gestures, [...(input.recentGestures ?? []), ...out.map((p) => p.gesture)], rnd);
      out.push(placed(plan.startBeat, bar, i % 2 === 0 ? 14 : 6, g, 'ACCENT', bpb));
    }
    source = compat.source === 'outgoing' ? outgoingSource(plan, outgoing, plan.startBeat)
      : crateSource(out[0]!.gesture, 'ACCENT', plan.style !== 'vocalSwap');
    // section 41: a run on a crate record opens with a throw of the word, in the first accent's bar
    // the whole word is heard (throwBeats): only when it ends before the first accent
    if (source?.type === 'CRATE' && out.length) {
      const first = out[0]!;
      const record = getScratchRecord(source.recordId);
      const t = { ...placed(plan.startBeat, first.bar, 0, 'drop', 'INTRO', bpb, 0.8), beats: record ? throwBeats(record, outgoing.bpm, 'drop') : undefined };
      if (t.beatAbs + (t.beats ?? gestureBeats('drop')) <= first.beatAbs + 1e-9) out.unshift(t);
    }
    if (compat.fit === 'risky') reasons.push(`reduced: ${plan.style} is a risky pair (section 45)`);
  }
  if (!source) return { reason: `no source for ${plan.style}` };

  // section 48: answer the incoming's vocal call with a YEAH on step 6-8 after it
  const call = incomingVocalCallBeat(input);
  if (call !== null && rank >= MODE_RANK.MUSICAL && kind !== 'scratchTransition' && kind !== 'scratchBattle') {
    const callBar = Math.floor((call - plan.startBeat) / bpb);
    const callStep = Math.round(((call - plan.startBeat) - callBar * bpb) * 4);
    const answerBar = callStep < 6 ? callBar : callBar + 1;
    const yeah = findRecords({ category: 'YEAH_RESPONSE', clean: true, role: 'ANSWER' })[0];
    if (yeah && answerBar < bars) {
      const answerSource: ScratchSource = { type: 'CRATE', recordId: yeah.id, anchor: { position: yeah.anchors.vowel, safe: yeah.safe, safeForward: yeah.safeForward, safeReverse: yeah.safeReverse } };
      const p = placed(plan.startBeat, answerBar, 8, 'forwardStab', 'ANSWER', bpb, 0.85);
      // the accents give the answer's bar to it (one hand)
      const kept = out.filter((e) => Math.abs(e.beatAbs - p.beatAbs) >= gestureBeats(e.gesture));
      const answerEvents = toEvents([p], answerSource, plan.outgoingDeck, outgoing.bpm, input.seed + 1);
      const events = [...toEvents(kept, source, plan.outgoingDeck, outgoing.bpm, input.seed), ...answerEvents].sort((a, b) => a.executeAtBeat - b.executeAtBeat);
      reasons.push(`vocal response: the incoming's call at beat ${call.toFixed(2)} answered with ${yeah.id}`);
      return { scratch: finish(kind, events, source, fx, reasons, input), reason: reasons.join('; ') };
    }
  }

  // section 44: an echo out and a scratch throw never share a bar on the same source
  const echoBars = new Set((plan.effects ?? []).filter((e) => e.kind === 'echo-out' || e.kind === 'delay-throw').map((e) => Math.floor(e.beat / bpb)));
  const throws = out.filter((e) => isThrowGesture(e.gesture) && echoBars.has(e.bar));
  if (throws.length) return { reason: `scratch: a throw in the echo bar of ${plan.style} (section 44)` };

  const events = toEvents(out, source, plan.outgoingDeck, outgoing.bpm, input.seed);
  return { scratch: finish(kind, events, source, fx, reasons, input), reason: reasons.join('; ') };
}

export const FX_REQUEST_PRESET: Readonly<Record<ScratchFxRequest, 'dry' | 'dark' | 'delay'>> = { dry: 'dry', dubbed: 'delay', transition: 'dark' };

function finish(kind: TransitionScratchKind, events: ScratchEvent[], source: ScratchSource, fxRequest: ScratchFxRequest, reasons: string[], input: TransitionScratchInput): TransitionScratchPlan {
  // section 28: the transition's start is the mix's moment - a scratch on it moves to the next step after
  const startMoment = { kind: 'transition' as const, startBeat: input.plan.startBeat, endBeat: input.plan.startBeat + 0.25 };
  const resolved = resolveConflicts([startMoment, ...events.map((e, i) => ({
    kind: 'scratchFeature' as const, startBeat: e.executeAtBeat, endBeat: e.executeAtBeat + e.durationBeats, id: String(i),
    latestStartBeat: input.plan.endBeat - e.durationBeats,
  }))]);
  const moved = new Map(resolved.moved.map((m) => [m.request.id, m.request.startBeat]));
  const refused = new Set(resolved.refused.map((r) => r.request.id));
  if (moved.size) reasons.push(`${moved.size} event(s) moved off the transition start (section 28)`);
  events = events.flatMap((e, i) => (refused.has(String(i)) ? [] : [moved.has(String(i)) ? { ...e, executeAtBeat: moved.get(String(i))! } : e]));
  const startBeat = Math.min(...events.map((e) => e.executeAtBeat));
  const endBeat = Math.max(...events.map((e) => e.executeAtBeat + e.durationBeats));
  // never past the plan's end (section 46: the incoming enters, then the release)
  const clipped = events.filter((e) => e.executeAtBeat + e.durationBeats <= input.plan.endBeat + 1e-9 || kind === 'scratchFeature');
  // the request is the channel's routine preset on every event (SCR-PG-D3): dry -> Dry, dubbed -> Delay,
  // transition -> Dark (the channel darkens as the incoming takes over)
  const preset = FX_REQUEST_PRESET[fxRequest];
  const withPreset = clipped.map((e) => ({ ...e, fx: { ...e.fx, amount: e.fx?.amount ?? 0, preset } }));
  return { kind, events: withPreset, source, startBeat, endBeat: Math.min(endBeat, Math.max(startBeat, input.plan.endBeat)), fxRequest, reasons };
}

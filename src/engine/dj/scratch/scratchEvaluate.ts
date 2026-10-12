/**
 * Evaluation after each phrase and the quality score (owner plan
 * `thoughts/shared/plans/2026-10-08-dj-view-scratch-plan.md` sections 52, 89; ledger SCR-P6.5,
 * P6.10). A performed phrase's trace - what was planned, when it actually fired, over which
 * vocal / bass / energy - is scored on the ten section 89 terms, and the section 52 questions
 * choose what the performer does next: continue, answer, escalate, rest or resolve.
 */

import type { ScratchGestureId, ScratchRole } from './scratchTypes';

export interface TracedScratch {
  bar: number;
  gesture: ScratchGestureId;
  role: ScratchRole;
  sourceKey: string;
  /** Source material is the bass (a bass channel, a bass hit). */
  bassSource?: boolean;
  /** 0..1 stroke intensity. */
  intensity: number;
  /** Seconds the event was due (grid time + humanize) and fired; fired is null when it never ran. */
  scheduledSec: number;
  firedSec: number | null;
  /** 0..1 anchor quality of the source. */
  anchorQuality?: number;
}

export interface PhraseTrace {
  events: readonly TracedScratch[];
  /** Vocal / bass activity of each bar of the phrase, by bar index. */
  vocalByBar: Readonly<Record<number, number>>;
  bassByBar?: Readonly<Record<number, number>>;
  /** Track energy at the phrase's start and end. */
  energyBefore: number;
  energyAfter: number;
  /** Set energy trend over the phrase (the audience-energy proxy): > 0 rising. */
  setEnergyTrend: number;
  /** The phrase sat on a transition that completed cleanly (1) or not (0); undefined = no transition. */
  transitionQuality?: number;
  /** Vocal activity of the bar after the phrase (a vocal call wants an answer). */
  nextBarVocal?: number;
}

export interface ScratchQualityScore {
  timing: number;
  musicalFit: number;
  sourceQuality: number;
  gestureQuality: number;
  phraseCoherence: number;
  energyFit: number;
  vocalClarity: number;
  bassClarity: number;
  novelty: number;
  transitionQuality: number;
  total: number;
}

const VOCAL_BUSY = 0.7;
const BASS_BUSY = 0.6;
/** A timing error at or past this many ms scores 0 (40 ms scores 0.2). */
export const TIMING_ZERO_MS = 50;

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** Largest |fired - scheduled| in ms over the events that fired. */
export function timingErrorMs(trace: PhraseTrace): number {
  let max = 0;
  for (const e of trace.events) if (e.firedSec !== null) max = Math.max(max, Math.abs(e.firedSec - e.scheduledSec) * 1000);
  return max;
}

const collides = (e: TracedScratch, trace: PhraseTrace): boolean => (trace.vocalByBar[e.bar] ?? 0) > VOCAL_BUSY && e.role !== 'ANSWER';
const muddies = (e: TracedScratch, trace: PhraseTrace): boolean => !!e.bassSource && (trace.bassByBar?.[e.bar] ?? 0) > BASS_BUSY;

/** Section 89: ten terms 0..1 and their mean. `recentPairs` = source+gesture pairs of the previous phrases. */
export function scoreScratchQuality(trace: PhraseTrace, ctx: { energy: number }, recentPairs: readonly string[] = []): ScratchQualityScore {
  const ev = trace.events;
  const n = Math.max(1, ev.length);
  const fired = ev.filter((e) => e.firedSec !== null);
  const distinct = new Set(ev.map((e) => e.gesture)).size;
  // coherence: the phrase's roles keep their order (a call before its answer, the outro last) and nothing was dropped
  let ordered = 0;
  for (let i = 1; i < ev.length; i++) {
    const a = ev[i - 1]!, b = ev[i]!;
    if (!(a.role === 'ANSWER' && b.role === 'THEME' && a.bar === b.bar) && !(a.role === 'OUTRO' && b.bar > a.bar)) ordered++;
  }
  const meanIntensity = ev.reduce((s, e) => s + e.intensity, 0) / n;
  const terms = {
    timing: clamp01(1 - timingErrorMs(trace) / TIMING_ZERO_MS),
    musicalFit: clamp01(1 - ev.filter((e) => collides(e, trace) || muddies(e, trace)).length / n),
    sourceQuality: clamp01(ev.reduce((s, e) => s + (e.anchorQuality ?? 1), 0) / n),
    gestureQuality: clamp01(distinct / Math.min(3, n)),
    phraseCoherence: ev.length < 2 ? (fired.length === ev.length ? 1 : 0.5) : clamp01((ordered / (ev.length - 1)) * (fired.length / ev.length)),
    energyFit: clamp01(1 - Math.abs(meanIntensity - ctx.energy)),
    vocalClarity: clamp01(1 - ev.filter((e) => collides(e, trace)).length / n),
    bassClarity: clamp01(1 - ev.filter((e) => muddies(e, trace)).length / n),
    novelty: clamp01(1 - ev.filter((e) => recentPairs.includes(`${e.sourceKey}+${e.gesture}`)).length / n),
    transitionQuality: clamp01(trace.transitionQuality ?? 1),
  };
  const values = Object.values(terms);
  return { ...terms, total: values.reduce((a, b) => a + b, 0) / values.length };
}

export type PhraseDecision = 'continue' | 'answer' | 'escalate' | 'rest' | 'resolve';

export interface PhraseEvaluation {
  fit: number;
  energyDelta: number;
  vocalCollisions: number;
  bassClarity: number;
  timingStableMs: number;
  /** Most times one source+gesture pairing has now played (this phrase + memory). */
  repetition: number;
  audienceTrend: number;
  quality: ScratchQualityScore;
  decision: PhraseDecision;
  reason: string;
}

/** Repeats of one pairing at which the performer stops and resolves (section 52 "did it repeat"). */
export const RESOLVE_AFTER_REPEATS = 3;

/**
 * Section 52: after a phrase - did it fit, did the energy improve, did it collide with the vocal,
 * did the bass stay clear, did the timing hold, did it repeat a recent idea, is the audience
 * proxy rising - and what next. A vocal collision rests; a third repeat of one idea resolves;
 * a vocal call in the next bar is answered; rising energy with no repetition escalates.
 */
export function evaluatePhrase(trace: PhraseTrace, ctx: { energy: number }, memory: { timesPlayed(sourceKey: string, gesture: ScratchGestureId): number }, recentPairs: readonly string[] = []): PhraseEvaluation {
  const quality = scoreScratchQuality(trace, ctx, recentPairs);
  const vocalCollisions = trace.events.filter((e) => collides(e, trace)).length;
  const repetition = Math.max(0, ...trace.events.map((e) => memory.timesPlayed(e.sourceKey, e.gesture)));
  const energyDelta = trace.energyAfter - trace.energyBefore;
  const base = { fit: quality.musicalFit, energyDelta, vocalCollisions, bassClarity: quality.bassClarity, timingStableMs: timingErrorMs(trace), repetition, audienceTrend: trace.setEnergyTrend, quality };
  if (vocalCollisions > 0) return { ...base, decision: 'rest', reason: `${vocalCollisions} event(s) over the vocal` };
  if (repetition >= RESOLVE_AFTER_REPEATS) return { ...base, decision: 'resolve', reason: `one idea played ${repetition} times` };
  if ((trace.nextBarVocal ?? 0) > VOCAL_BUSY) return { ...base, decision: 'answer', reason: 'a vocal call follows' };
  if ((energyDelta > 0 || trace.setEnergyTrend > 0) && repetition <= 1) return { ...base, decision: 'escalate', reason: 'energy rising, nothing repeated' };
  if (quality.total < 0.5) return { ...base, decision: 'rest', reason: `quality ${quality.total.toFixed(2)}` };
  return { ...base, decision: 'continue', reason: 'fits' };
}

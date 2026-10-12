/**
 * Opportunity finder (owner plan `thoughts/shared/plans/2026-10-08-dj-view-scratch-plan.md`
 * sections 8, 24, 47, 51 "OPPORTUNITY_FOUND", Definition of done 1; ledger SCR-P6.11): where the
 * next scratch belongs - a vocal call to answer, a breakdown entry, a drop approach, the
 * outgoing deck's phrase end in a transition, a phrase end, or an accent after the snare - read
 * from the scratch context. Anything above level 1 needs a trusted grid (beat confidence >= 0.6
 * and phrase confidence >= 0.5); below that only level-1 accents are offered.
 */

import type { ScratchPerformanceContext } from './scratchContext';
import type { ScratchLevel, ScratchRole } from './scratchTypes';

export type OpportunityKind = 'vocalCall' | 'breakdownEntry' | 'dropApproach' | 'outgoingPhraseEnd' | 'phraseEnd' | 'afterSnare';

export interface ScratchOpportunity {
  kind: OpportunityKind;
  /** The bar the scratch plays in. */
  bar: number;
  role: ScratchRole;
  /** Highest gesture level the opportunity allows. */
  maxLevel: ScratchLevel;
  reason: string;
}

export const OPPORTUNITY_MIN_BEAT_CONFIDENCE = 0.6;
export const OPPORTUNITY_MIN_PHRASE_CONFIDENCE = 0.5;
const VOCAL_BUSY = 0.7;

/** Reachability sentinel (SCR-P7.R7). */
export const scratchOpportunityStats = { find: 0 };

/**
 * The opportunity at the context's bar, or null. `previousBarVocal` is the vocal activity of the
 * bar before (a call that just ended).
 */
export function findOpportunity(ctx: ScratchPerformanceContext, opts: { previousBarVocal?: number } = {}): ScratchOpportunity | null {
  scratchOpportunityStats.find++;
  const trusted = ctx.beatConfidence >= OPPORTUNITY_MIN_BEAT_CONFIDENCE && ctx.phraseConfidence >= OPPORTUNITY_MIN_PHRASE_CONFIDENCE;
  const bar = ctx.masterBar;
  const lastBarOfPhrase = ctx.barInPhrase === ctx.phraseBars - 1;
  const nextKind = ctx.nextSection?.kind;
  const nextStartsSoon = !!ctx.nextSection && ctx.nextSection.startBar - bar <= 1 && ctx.nextSection.startBar > bar;
  const level = (l: ScratchLevel): ScratchLevel => (trusted ? l : 1);

  if (!trusted) {
    // an untrusted grid: a level-1 accent on a phrase end only (normal DJ behaviour otherwise)
    return lastBarOfPhrase ? { kind: 'phraseEnd', bar, role: 'ACCENT', maxLevel: 1, reason: `grid not trusted (beat ${ctx.beatConfidence.toFixed(2)}, phrase ${ctx.phraseConfidence.toFixed(2)}): level 1 accent` } : null;
  }
  if ((opts.previousBarVocal ?? 0) > VOCAL_BUSY && ctx.vocalActivity <= VOCAL_BUSY) {
    return { kind: 'vocalCall', bar, role: 'ANSWER', maxLevel: level(2), reason: 'a vocal call just ended: answer it' };
  }
  if (nextStartsSoon && nextKind === 'breakdown') return { kind: 'breakdownEntry', bar, role: 'TRANSITION', maxLevel: level(2), reason: 'the breakdown starts next bar' };
  if (nextStartsSoon && (nextKind === 'drop' || nextKind === 'pre-drop')) return { kind: 'dropApproach', bar, role: 'FILL', maxLevel: level(3), reason: `the ${nextKind} starts next bar` };
  if (lastBarOfPhrase && ctx.activeDeck === 'BOTH' && ctx.outgoingDeck) {
    return { kind: 'outgoingPhraseEnd', bar, role: 'TRANSITION', maxLevel: level(3), reason: `deck ${ctx.outgoingDeck} ends its phrase` };
  }
  if (lastBarOfPhrase) return { kind: 'phraseEnd', bar, role: 'FILL', maxLevel: level(3), reason: 'phrase end' };
  if (ctx.drumActivity >= 0.5 && ctx.vocalActivity <= VOCAL_BUSY && ctx.barInPhrase % 2 === 1) {
    return { kind: 'afterSnare', bar, role: 'ACCENT', maxLevel: level(2), reason: 'answer the snare' };
  }
  return null;
}

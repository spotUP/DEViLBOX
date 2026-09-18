/**
 * Gate K2 — contextual variance.
 *
 * Surprise used to be `rng() < variance * 0.1`: a flat chance, rolled against
 * every rule, every tick, regardless of what was happening. So Perry's
 * unpredictability landed as often in the middle of a build, or on top of a
 * wash, or a beat after the last surprise, as it did anywhere useful — and the
 * only way to make him less annoying was to make him less surprising.
 *
 * A surprise is only a surprise if the situation is otherwise settled. Perry
 * breaks the rule BECAUSE the music can take it: the mix is dry enough to
 * absorb something unexpected, the arrangement is not already at a seam doing
 * something significant, and he has not just done something a moment ago.
 *
 * This decides whether the situation allows it; the persona decides how often
 * it takes the chance. Pure — the caller supplies both the reading and the RNG.
 */

import type { PerformanceContext } from './performanceContext';
import type { PersonaBehaviour } from './personaBehaviour';

export interface VarianceVerdict {
  allowed: boolean;
  /** Why — reaches the fire log, so an odd choice can be explained. */
  reason: string;
  /** The probability that was rolled against, for diagnostics. */
  probability: number;
}

export interface VarianceInputs {
  /** Rows since the performer last did anything. Infinity if never. */
  rowsSinceLastAction: number;
  /** 0..1 through the current phrase. */
  positionInPhrase: number;
  /** Wet energy currently in the air, 0..1-ish. */
  wet: number;
  /** How many of the recent moves were the same move — 0..1. */
  repetition: number;
  /** Gestures currently in flight. */
  gesturesInFlight: number;
}

/** Read the inputs straight off a Gate D context. */
export function varianceInputsFrom(ctx: PerformanceContext): VarianceInputs {
  const recent = ctx.recentMoves.slice(-6);
  let repetition = 0;
  if (recent.length >= 2) {
    const last = recent[recent.length - 1].moveId;
    repetition = recent.filter(m => m.moveId === last).length / recent.length;
  }
  return {
    rowsSinceLastAction: ctx.rowsSinceLastAction,
    positionInPhrase: ctx.position.positionInPhrase,
    wet: ctx.energy.wet ?? 0,
    repetition,
    gesturesInFlight: ctx.energy.gesturesInFlight,
  };
}

/**
 * May the performer depart from the rules right now, and how likely is it to.
 *
 * The gates are conditions in the music, not probabilities: each one either
 * applies or does not, and a refusal names itself. Only once the situation
 * allows it does the persona's appetite decide.
 */
export function allowSurprise(
  inputs: VarianceInputs,
  behaviour: PersonaBehaviour,
  rng: () => number,
): VarianceVerdict {
  // A persona with no appetite for risk never surprises anyone. Saying so
  // first keeps the rest of the reasoning out of the common case.
  if (behaviour.risk <= 0.05) {
    return { allowed: false, reason: 'this persona does not depart from the rules', probability: 0 };
  }

  // Something is already happening. A surprise stacked on a gesture in flight
  // is not a surprise, it is a mess.
  if (inputs.gesturesInFlight > 0) {
    return { allowed: false, reason: 'a gesture is already in flight', probability: 0 };
  }

  // A wet mix cannot absorb anything unexpected: the surprise arrives inside a
  // wash and reads as noise.
  if (inputs.wet >= 0.6) {
    return { allowed: false, reason: 'too much wet in the air to hear a surprise', probability: 0 };
  }

  // At a seam the arrangement is already saying something. Departing there
  // competes with the music's own move rather than adding to it.
  if (inputs.positionInPhrase >= 0.9 || inputs.positionInPhrase <= 0.05) {
    return { allowed: false, reason: 'the arrangement is at a seam of its own', probability: 0 };
  }

  // Too soon after the last action: surprise needs something settled to break.
  const settleRows = 8 * (1 - behaviour.risk) + 2;
  if (inputs.rowsSinceLastAction < settleRows) {
    return {
      allowed: false,
      reason: `only ${inputs.rowsSinceLastAction.toFixed(0)} rows since the last move`,
      probability: 0,
    };
  }

  // The situation allows it. Now the persona: risk sets the base, and
  // repetition raises it — the longer it has been doing the same thing, the
  // more a departure is worth. This is where Perry differs from Tubby.
  const base = behaviour.risk * 0.25;
  const repetitionBoost = 1 + inputs.repetition * behaviour.novelty;
  const probability = Math.min(0.6, base * repetitionBoost);

  const allowed = rng() < probability;
  return {
    allowed,
    reason: allowed
      ? `the situation is settled${inputs.repetition > 0.5 ? ' and repetitive' : ''}`
      : 'the situation allowed it but the persona did not take it',
    probability,
  };
}

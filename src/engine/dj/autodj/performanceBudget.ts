/**
 * The performance hands budget (owner scratch plan
 * `thoughts/shared/plans/2026-10-08-dj-view-scratch-plan.md` section 27, ledger D7 / SCR-P7.11):
 * two hands, one budget of 6 shared by everything the Auto DJ performs at once - the
 * transition's moves, the juggle, the FX and the scratch. What is left after the juggle, the
 * transition and the FX is what the scratch may use (0..4), so beat juggling + crab +
 * transformer + filter sweep + echo throw + bass swap never all happen together.
 */

import type { TransitionStyle } from './types';

export const HANDS_BUDGET = 6;

/** Section 27 costs. */
export const HAND_COSTS = {
  normalBlend: 0, eqMove: 1, filterMove: 1, shortScratch: 1, complexScratch: 2,
  phraseJuggle: 2, beatJuggle: 3, aggressiveJuggle: 4,
} as const;
export type HandAction = keyof typeof HAND_COSTS;

/** The most a scratch may take (a complex scratch feature = 2 hands, a battle burst up to 4). */
export const MAX_SCRATCH_PERMISSION = 4;

/** What a transition style keeps a hand busy with (section 27: blend 0, EQ / filter moves 1). */
export function transitionCost(style: TransitionStyle | undefined): number {
  switch (style) {
    case undefined: case 'longBlend': case 'shortBlend': case 'hardCut': case 'drumIntroMix': case 'breakdownMix': case 'dropMix':
    case 'loopExit': case 'tempoBridge': case 'doubleTimeJump': case 'halfTimeJump':
      return HAND_COSTS.normalBlend;
    case 'bassSwap': case 'EQSwap': case 'vocalSwap': case 'percussionSwap':
      return HAND_COSTS.eqMove;
    case 'filterBuild': case 'filterRelease':
      return HAND_COSTS.filterMove;
    case 'echoOut': case 'reverbOut': case 'delayThrow':
      return HAND_COSTS.filterMove;
    case 'juggleTransition':
      return HAND_COSTS.beatJuggle;
  }
}

/** A juggle's level (0 none, 1 phrase, 2 beat, 3 aggressive) in hands. */
export function juggleCost(level: number): number {
  if (level <= 0) return 0;
  if (level === 1) return HAND_COSTS.phraseJuggle;
  if (level === 2) return HAND_COSTS.beatJuggle;
  return HAND_COSTS.aggressiveJuggle;
}

/**
 * The juggle level an intensity plays at (the juggle planner's 0..1 ladder onto section 27's
 * three juggle costs): up to SAFE's cap 0.4 phrase juggles, up to 0.75 beat juggles (MUSICAL's
 * 0.65 included), above that the aggressive patterns (PERFORMER 0.9, AGGRESSIVE / CHAOS 1).
 */
export const JUGGLE_LEVEL_INTENSITY = [0, 0.4, 0.75, 1] as const;

export function juggleLevelForIntensity(intensity: number): number {
  if (!(intensity > 0)) return 0;
  if (intensity <= JUGGLE_LEVEL_INTENSITY[1]) return 1;
  if (intensity <= JUGGLE_LEVEL_INTENSITY[2]) return 2;
  return 3;
}

/** The most intense juggle the hands left over allow (the inverse of `juggleCost`): 0 when not even a phrase juggle fits. */
export function juggleIntensityCap(handsLeft: number): number {
  if (handsLeft >= HAND_COSTS.aggressiveJuggle) return JUGGLE_LEVEL_INTENSITY[3];
  if (handsLeft >= HAND_COSTS.beatJuggle) return JUGGLE_LEVEL_INTENSITY[2];
  if (handsLeft >= HAND_COSTS.phraseJuggle) return JUGGLE_LEVEL_INTENSITY[1];
  return 0;
}

/** availableScratch = budget - juggleCost - transitionCost - FXCost, in 0..4. */
export function scratchPermission(opts: { juggleCost?: number; transitionCost?: number; fxCost?: number }): number {
  const left = HANDS_BUDGET - (opts.juggleCost ?? 0) - (opts.transitionCost ?? 0) - (opts.fxCost ?? 0);
  return Math.max(0, Math.min(MAX_SCRATCH_PERMISSION, left));
}

/** Hands a scratch plan takes: a short accent 1, anything above level 2 or a feature 2, a battle burst 4. */
export function scratchCost(opts: { maxLevel: number; feature?: boolean; battle?: boolean }): number {
  if (opts.battle) return MAX_SCRATCH_PERMISSION;
  return opts.feature || opts.maxLevel >= 3 ? HAND_COSTS.complexScratch : opts.maxLevel > 0 ? HAND_COSTS.shortScratch : 0;
}

/** A set of simultaneous actions fits the two hands, or the reason it does not. */
export function checkHands(actions: readonly HandAction[]): { ok: boolean; used: number; reason?: string } {
  const used = actions.reduce((sum, a) => sum + HAND_COSTS[a], 0);
  return used > HANDS_BUDGET ? { ok: false, used, reason: `${actions.join(' + ')} needs ${used} hands of ${HANDS_BUDGET}` } : { ok: true, used };
}

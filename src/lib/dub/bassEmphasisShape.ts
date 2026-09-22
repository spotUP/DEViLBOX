/**
 * The SHAPE of a bass emphasis — how much, how low, for how long.
 *
 * Phase 2 of `thoughts/shared/plans/2026-09-22-bass-as-musical-target.md`.
 * `bassState.ts` answers WHETHER to push the bass; this answers WHAT the push
 * is. They are separate because the decision is structural and the shape is
 * acoustic, and mixing them is how a musical gesture turns back into a tonal
 * corrector.
 *
 * Every number here comes from the plan or from a table that already exists:
 *
 *   +2 to 4 dB              the plan's stated range, and the reason this is a
 *                           gesture rather than the "+12 dB for 8 seconds" it
 *                           explicitly rejects.
 *   80 to 120 Hz            the plan's range, picked from the channel's own
 *                           register so a sub line and a mid-heavy line do not
 *                           get the same corner.
 *   amount from the budget  `moveEnergy.ts` — the low-frequency-risk axis is
 *                           where a low shelf actually spends, so that axis is
 *                           what scales the dB. Not a constant.
 *
 * Pure. No engine, no stores, no clock: the caller passes what it measured, so
 * the numbers can be argued with in a test rather than heard for.
 */

import type { Register } from './musicalChannelProfile';
import { DEFAULT_ENERGY_BUDGET, energyCostOf, type EnergyBudget, type EnergyReading } from './moveEnergy';
import { BASS_TARGET_THRESHOLD } from './bassState';

/** The plan's floor. Below this the gesture is not audible as a gesture. */
export const BASS_EMPHASIS_MIN_DB = 2;
/** The plan's ceiling. Above this it stops being emphasis and becomes a remix. */
export const BASS_EMPHASIS_MAX_DB = 4;

/** Corner frequencies, one per register the low end can sit in. */
const CORNER_HZ: Partial<Record<Register, number>> = {
  sub: 80,      // fundamentals live below the corner; lift where they are
  low: 95,
  lowMid: 120,  // a mid-heavy bass needs the corner above its body
};
/** Middle of the plan's range, for a channel whose register is a guess. */
const CORNER_HZ_DEFAULT = 100;

/**
 * How much of the shelf the low-mid dip does instead.
 *
 * The plan: "optionally a brief low-mid cleanup so the bass feels louder
 * without large gain". Taking a little out of the low-mid is what buys the
 * perceived weight, which is why the boost can stay inside 4 dB.
 */
const CLEANUP_RATIO = 0.6;
/** Never scoop more than this, or the mix goes hollow rather than heavy. */
const CLEANUP_MAX_DB = 2.5;

export interface BassEmphasisShape {
  /** Low shelf lift, dB. Always within [MIN_DB, MAX_DB]. */
  gainDb: number;
  /** Shelf corner, Hz. Always within [80, 120]. */
  freqHz: number;
  /** Low-mid dip, dB as a POSITIVE magnitude to subtract. */
  cleanupDb: number;
  /** Whole gesture length in bars, eases included. */
  holdBars: number;
  /** Eased attack, in bars. */
  attackBars: number;
  /** Eased release, in bars. */
  releaseBars: number;
}

export interface BassEmphasisInput {
  /** The target channel's register, or null when the estimate is too weak. */
  register: Register | null;
  /**
   * `DubTargetProfile.targets.bassEmphasis` for the target channel.
   *
   * Used as STRENGTH, not as a gate — the gate is the caller's, and a channel
   * that only just reads as the low end gets the smaller lift.
   */
  bassEmphasisTarget: number;
  /**
   * Share of the low-frequency-risk budget still free, 0..1.
   *
   * 1 = nothing else is down there; 0 = the budget is spent. This is the
   * plan's "amount determined by the current energy budget".
   */
  headroom: number;
  /** Gesture length. The plan says one to two bars; two is the default. */
  holdBars?: number;
}

const clamp01 = (n: number): number => (!Number.isFinite(n) ? 0 : n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Low-frequency headroom left, given what is in the air and the budget.
 *
 * Separate from `bassEmphasisShape` so a caller that HAS a ledger (the gesture
 * engine, later) and one that does not (a pad under a finger) compute the same
 * number the same way.
 */
export function bassEmphasisHeadroom(
  inAir: Pick<EnergyReading, 'lowFrequencyRisk'>,
  budget: EnergyBudget = DEFAULT_ENERGY_BUDGET,
): number {
  const ceiling = budget.lowFrequencyRisk;
  if (!Number.isFinite(ceiling) || ceiling <= 0) return 0;
  // The move has to pay for itself before any of the rest counts as free.
  const own = energyCostOf('bassEmphasis').lowFrequencyRisk;
  return clamp01((ceiling - inAir.lowFrequencyRisk - own) / ceiling);
}

/**
 * The headroom a caller with no ledger should assume.
 *
 * Not 1: a performer that assumes the low end is empty pushes hardest exactly
 * when it knows least. This is the headroom with nothing else in the air,
 * which is the honest reading of "I cannot see the ledger".
 */
export const UNMEASURED_HEADROOM = bassEmphasisHeadroom({ lowFrequencyRisk: 0 });

/** Turn what was measured into the gesture's numbers. */
export function bassEmphasisShape(input: BassEmphasisInput): BassEmphasisShape {
  const headroom = clamp01(input.headroom);

  // How convincingly this channel is the low end, rescaled so the threshold
  // that let it through reads as zero strength rather than as 0.6.
  const span = 1 - BASS_TARGET_THRESHOLD;
  const strength = clamp01((clamp01(input.bassEmphasisTarget) - BASS_TARGET_THRESHOLD) / span);

  const gainDb = BASS_EMPHASIS_MIN_DB
    + (BASS_EMPHASIS_MAX_DB - BASS_EMPHASIS_MIN_DB) * headroom * strength;

  const freqHz = (input.register && CORNER_HZ[input.register]) ?? CORNER_HZ_DEFAULT;

  const cleanupDb = Math.min(CLEANUP_MAX_DB, gainDb * CLEANUP_RATIO);

  const holdBars = Math.max(1, Math.min(2, input.holdBars ?? 2));

  return {
    gainDb,
    freqHz,
    cleanupDb,
    holdBars,
    // A quarter of the gesture in, a quarter out. Long enough to read as a
    // swell rather than a switch, short enough that the middle is still the
    // part you hear.
    attackBars: holdBars * 0.25,
    releaseBars: holdBars * 0.25,
  };
}

/**
 * Eased 0..1 across the envelope. Smoothstep: zero slope at both ends, so
 * neither the attack nor the release has a corner in it.
 */
export function bassEmphasisEase(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

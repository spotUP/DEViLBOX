/**
 * What each channel is GOOD FOR, so a persona never reasons from raw
 * classifier output.
 *
 * Phase 5 of `thoughts/shared/plans/2026-09-22-channel-intelligence.md`. The
 * classifier answers "what is this channel"; a dub engineer needs "what can I
 * do to it and what happens to the tune if I do". Those are different
 * questions, and AutoDub was answering the second by switching on the first —
 * `channelRole === 'percussion'` scattered through the persona code, which is
 * why it treats a hi-hat and a kick identically and why a tune whose channels
 * all classify as `bass` gets a `riddimSection` that mutes nothing.
 *
 * This is a PURE function over measurements taken elsewhere. It measures
 * nothing itself: identity comes from `musicalChannelProfile`, the timeline
 * from `channelSegments`. Keeping it pure is what makes it testable without an
 * audio graph, and keeps the judgement in one readable place instead of spread
 * across persona branches.
 *
 * ## Uncertainty is part of the output
 *
 * Every target is scaled by how sure the identity actually is. An unidentified
 * channel does not score zero on everything — that would silence the performer
 * on exactly the tunes the classifier finds hardest. It scores toward the
 * middle for reversible moves and toward zero for destructive ones, so a
 * confident wrong guess can cost an echo but never the arrangement. That is
 * the whole reason this work comes before the persona work.
 */

import type {
  MusicalChannelProfile,
  InstrumentFamily,
  MusicalFunction,
  Register,
  RhythmicRole,
} from './musicalChannelProfile';

/**
 * How much of an identity-driven score survives when the identity is a guess.
 *
 * At confidence 1 a target is used as computed; at 0 it is pulled toward
 * `NEUTRAL_TARGET` for reversible moves. Linear because there is no evidence
 * for any particular curve and a straight line is the honest default.
 */
const NEUTRAL_TARGET = 0.4;

/** Below this, an axis is treated as unknown rather than as its value. */
export const AXIS_ACT_THRESHOLD = 0.6;

export interface DubTargets {
  /** Send it to the echo and let the throw ring on. */
  echoThrow: number;
  /** Short spring hit on its transients. */
  springKick: number;
  /** Full spring crash — a punctuation mark, not a texture. */
  springSlam: number;
  /** Close the filter over it. */
  filterDrop: number;
  /** Sweep the high-pass up under it. */
  hpfRise: number;
  /** Drown it in reverb and pull the dry away. */
  ghostReverb: number;
  /** Wobble its pitch as if the tape were slipping. */
  tapeWobble: number;
  /** Lift its low end. */
  bassEmphasis: number;
  /** How much a version drop should KEEP this channel. 1 = never drop it. */
  versionDropKeep: number;
}

export interface DubRisks {
  /** Touching the low end here will muddy or unbalance the mix. */
  lowEndRisk: number;
  /** Effects here will smear other parts that share its band. */
  maskingRisk: number;
  /** The arrangement leans on this; removing it is felt. */
  arrangementImportance: number;
  /** A mistake here cannot be undone by ear within a bar. */
  destructiveRisk: number;
}

export interface MusicalAvailability {
  /** Is the channel sounding at the position this profile was built for? */
  playingNow: boolean;
  /** Order position where this channel next changes character, if known. */
  nextSegmentOrder?: number;
  /** Order position where it next enters after a silence, if known. */
  nextEntryOrder?: number;
}

export interface DubTargetProfile {
  channelId: number;
  identity: MusicalChannelProfile;
  targets: DubTargets;
  risks: DubRisks;
  availability: MusicalAvailability;
  /**
   * How much of this profile rests on measurement rather than defaults, 0..1.
   *
   * A persona should prefer a high-certainty channel when it has a choice, and
   * should not fire a destructive move on a low-certainty one at all.
   */
  certainty: number;
}

/** Segment facts this module needs, kept narrow so callers can synthesise them. */
export interface ChannelTimelineFacts {
  playingNow: boolean;
  nextSegmentOrder?: number;
  nextEntryOrder?: number;
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/** An axis value, or null when the estimate is too weak to act on. */
function actable<T>(axis: { value: T; confidence: number }): T | null {
  return axis.confidence >= AXIS_ACT_THRESHOLD ? axis.value : null;
}

/**
 * Pull a score toward neutral in proportion to how unsure we are.
 *
 * `floorAtZero` is for destructive moves: those fall toward 0 instead of
 * toward the middle, because "I am not sure what this is" is never a reason to
 * half-remove it from the arrangement.
 */
function temper(score: number, certainty: number, floorAtZero = false): number {
  const anchor = floorAtZero ? 0 : NEUTRAL_TARGET;
  return clamp01(anchor + (score - anchor) * certainty);
}

/** How low this register sits, 0 (high) .. 1 (sub). */
function lowness(register: Register | null): number {
  switch (register) {
    case 'sub': return 1;
    case 'low': return 0.85;
    case 'lowMid': return 0.6;
    case 'mid': return 0.4;
    case 'highMid': return 0.2;
    case 'high': return 0.05;
    default: return 0.4;
  }
}

/** Does this part carry the tune's floor? */
function isFoundation(fn: MusicalFunction | null, family: InstrumentFamily | null): boolean {
  return fn === 'foundation' || family === 'bass';
}

/** Is it a repeating rhythmic figure rather than a line someone follows? */
function isRhythmic(role: RhythmicRole | null): boolean {
  return role === 'downbeat' || role === 'backbeat' || role === 'offbeat' || role === 'syncopated';
}

/**
 * Build the profile.
 *
 * `timeline` is optional: without it the availability block reports the
 * channel as playing, which is what a caller with no timeline should assume
 * rather than refusing to act.
 */
export function buildDubTargetProfile(
  identity: MusicalChannelProfile,
  timeline?: ChannelTimelineFacts,
): DubTargetProfile {
  const family = actable(identity.instrumentFamily);
  const fn = actable(identity.musicalFunction);
  const rhythm = actable(identity.rhythmicRole);
  const register = actable(identity.register);

  // Certainty is the mean of the four axes, so one confident axis cannot carry
  // a profile that is otherwise guesswork.
  const certainty = clamp01(
    (identity.instrumentFamily.confidence
      + identity.musicalFunction.confidence
      + identity.rhythmicRole.confidence
      + identity.register.confidence) / 4,
  );

  const low = lowness(register);
  const foundation = isFoundation(fn, family);
  const rhythmic = isRhythmic(rhythm);
  const sustained = rhythm === 'sustained';
  const percussive = family === 'drums' || family === 'percussion';
  const lead = fn === 'melody' || fn === 'hook' || fn === 'voice';
  const texture = fn === 'texture' || fn === 'harmony';

  // ── Targets ──────────────────────────────────────────────────────────────
  // Echo wants something with space around it and a transient to repeat. A
  // dense sustained pad throws into mud; an offbeat skank or a snare throws
  // beautifully. Low end is the classic mistake — echoing a bassline fills
  // every gap the groove needs.
  const echoThrow = temper(clamp01(
    0.5
    + (rhythmic ? 0.25 : 0)
    + (lead ? 0.15 : 0)
    + (percussive ? 0.1 : 0)
    - (foundation ? 0.5 : 0)
    - low * 0.3
    - identity.density * 0.25
    + (1 - identity.density) * 0.1,
  ), certainty);

  // Spring reverb is a transient effect: it needs a hit. Sustained material
  // has nothing for it to catch.
  const springKick = temper(clamp01(
    0.3 + (percussive ? 0.45 : 0) + (rhythmic ? 0.2 : 0) - (sustained ? 0.4 : 0) - low * 0.2,
  ), certainty);

  // The slam is punctuation. It belongs on something important enough to
  // punctuate, and it is ruined by a busy channel.
  const springSlam = temper(clamp01(
    0.25 + identity.importance * 0.4 + (percussive ? 0.2 : 0) - identity.density * 0.4,
  ), certainty);

  // Dropping the filter over the foundation is the single most effective dub
  // move there is, and the least safe: it takes the floor out.
  const filterDrop = temper(clamp01(
    0.35 + (foundation ? 0.4 : 0) + low * 0.3 - (lead ? 0.25 : 0),
  ), certainty);

  // The high-pass rise is the inverse and is safe almost everywhere, because
  // it removes weight rather than presence.
  const hpfRise = temper(clamp01(
    0.45 + low * 0.35 - (lead ? 0.15 : 0),
  ), certainty);

  // Ghost reverb swallows a part. It suits texture and harmony; on the
  // foundation or the hook it removes the thing people are listening to.
  const ghostReverb = temper(clamp01(
    0.35 + (texture ? 0.4 : 0) + (sustained ? 0.2 : 0)
    - (foundation ? 0.45 : 0) - (fn === 'hook' ? 0.3 : 0),
  ), certainty);

  // Wobble is a pitch effect, so it is only musical on something pitched, and
  // it is most obvious on a sustained tone.
  const tapeWobble = temper(clamp01(
    0.3 + (sustained ? 0.3 : 0) + (lead ? 0.2 : 0) - (percussive ? 0.45 : 0),
  ), certainty);

  // Lifting the low end only makes sense where there is low end to lift, and
  // stacking it on several channels at once is how a mix turns to mud — which
  // the caller must arbitrate, not this function.
  const bassEmphasis = temper(clamp01(
    0.15 + low * 0.55 + (foundation ? 0.3 : 0) - (percussive && low < 0.5 ? 0.2 : 0),
  ), certainty);

  // A version drop strips the tune back to drum and bass. Keep what the
  // arrangement rests on; drop the decoration.
  const versionDropKeep = temper(clamp01(
    0.3 + (foundation ? 0.5 : 0) + (percussive ? 0.35 : 0)
    + identity.importance * 0.2 - (texture ? 0.3 : 0),
  ), certainty);

  // ── Risks ────────────────────────────────────────────────────────────────
  const lowEndRisk = clamp01(low * 0.7 + (foundation ? 0.3 : 0));
  const maskingRisk = clamp01(identity.density * 0.5 + (sustained ? 0.3 : 0) + low * 0.2);
  const arrangementImportance = clamp01(
    identity.importance * 0.6 + (foundation ? 0.25 : 0) + (fn === 'hook' ? 0.25 : 0),
  );
  // An unidentified channel is MORE dangerous to touch destructively, not
  // less: the uncertainty is itself the risk.
  const destructiveRisk = clamp01(arrangementImportance * 0.7 + (1 - certainty) * 0.3);

  return {
    channelId: identity.channel,
    identity,
    targets: {
      echoThrow, springKick, springSlam, filterDrop, hpfRise,
      ghostReverb, tapeWobble, bassEmphasis, versionDropKeep,
    },
    risks: { lowEndRisk, maskingRisk, arrangementImportance, destructiveRisk },
    availability: {
      playingNow: timeline?.playingNow ?? true,
      nextSegmentOrder: timeline?.nextSegmentOrder,
      nextEntryOrder: timeline?.nextEntryOrder,
    },
    certainty,
  };
}

/**
 * Rank channels for one move, best first.
 *
 * The question a persona actually asks — "who should I echo?" — is a choice
 * among channels, not a score per channel, and doing it here keeps every
 * persona from re-implementing the same comparison. Channels that are silent
 * now are excluded: a move aimed at silence is the no-op that made AutoDub
 * look broken.
 */
export function rankChannelsForTarget(
  profiles: readonly DubTargetProfile[],
  target: keyof DubTargets,
  options: { minCertainty?: number; maxDestructiveRisk?: number } = {},
): DubTargetProfile[] {
  const minCertainty = options.minCertainty ?? 0;
  const maxRisk = options.maxDestructiveRisk ?? 1;
  return profiles
    .filter(p => p.availability.playingNow)
    .filter(p => p.certainty >= minCertainty)
    .filter(p => p.risks.destructiveRisk <= maxRisk)
    .slice()
    .sort((a, b) => b.targets[target] - a.targets[target]);
}

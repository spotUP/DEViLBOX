/**
 * Gate H — musical targeting.
 *
 * Which channel a move lands on used to be decided by a single legacy role
 * enum ('percussion', 'bass', 'lead', …) plus a random pick among whatever
 * matched, with a nudge toward channels the user had renamed. That answers
 * "what is this channel called", which is not the question. The question is
 * what the move is FOR:
 *
 *  - an ACCENT wants the backbeat, or failing that whatever carries the
 *    rhythm — not the pad that happens to be classified 'percussion' because
 *    the classifier was unsure;
 *  - SPACE wants something the mix can afford to lose, so it looks for low
 *    arrangement importance and high density — the busy inessential part;
 *  - a DROP wants the opposite of foundation: take the melody, leave the
 *    riddim, which is the whole grammar of a version;
 *  - TEXTURE wants something audible enough to hear the effect on.
 *
 * `MusicalChannelProfile` (Gate C) already carries the four axes with their
 * confidence and their source, so this scores against those and never acts on
 * an axis it does not believe: `axisOr` falls back rather than guessing, and
 * a channel whose profile says nothing useful loses to one that says something.
 *
 * Pure. Returns the reason alongside the choice, so a fire can be explained.
 */

import type { Intention } from './performanceContext';
import type { MusicalChannelProfile } from './musicalChannelProfile';
import { axisOr } from './musicalChannelProfile';

export interface TargetChoice {
  channelId: number;
  /** Why this channel — reaches the fire log. */
  reason: string;
  /** 0..1 how well it fits; low means "nothing fitted, this is the least bad". */
  fit: number;
}

export interface TargetOptions {
  /** Channels that must not be chosen — muted, blacklisted, already held. */
  exclude?: ReadonlySet<number>;
  /** Minimum confidence before an axis is allowed to steer the choice. */
  minConfidence?: number;
}

const MIN_CONFIDENCE = 0.5;

/**
 * Pick the channel an intention should land on.
 *
 * Returns null when there is nothing worth aiming at — an empty arrangement,
 * or everything excluded. A null is a real answer: firing at a channel that
 * does not suit the intention is worse than not firing.
 */
export function pickTarget(
  intention: Intention,
  profiles: ReadonlyMap<number, MusicalChannelProfile>,
  options: TargetOptions = {},
): TargetChoice | null {
  const minConfidence = options.minConfidence ?? MIN_CONFIDENCE;
  let best: TargetChoice | null = null;

  for (const [channelId, profile] of profiles) {
    if (options.exclude?.has(channelId)) continue;
    const scored = scoreFor(intention, profile, minConfidence);
    if (!scored) continue;
    if (!best || scored.fit > best.fit) {
      best = { channelId, reason: scored.reason, fit: scored.fit };
    }
  }
  return best;
}

interface Scored { fit: number; reason: string }

function scoreFor(
  intention: Intention,
  p: MusicalChannelProfile,
  minConfidence: number,
): Scored | null {
  const rhythm = axisOr(p.rhythmicRole, minConfidence, 'free');
  const family = axisOr(p.instrumentFamily, minConfidence, 'unknown');
  const fn = axisOr(p.musicalFunction, minConfidence, 'unknown');
  const register = axisOr(p.register, minConfidence, 'mid');

  // A channel nobody can hear is not a target, whatever it is.
  if (p.audibility <= 0.05) return null;

  switch (intention) {
    case 'ACCENT': {
      // The backbeat first; then anything percussive; then whatever is most
      // rhythmically distinct. Audibility decides between equals.
      const base =
        rhythm === 'backbeat' ? 0.9 :
        rhythm === 'offbeat' ? 0.6 :
        rhythm === 'downbeat' ? 0.5 : 0.2;
      const familyBonus = family === 'drums' || family === 'percussion' ? 0.25 : 0;
      return {
        fit: clamp01(base + familyBonus) * (0.6 + 0.4 * p.audibility),
        reason: `${rhythm} ${family} carries the accent`,
      };
    }

    case 'ANSWER': {
      // Answer a voice, not a foundation: a reply to the kick is just more kick.
      const base =
        fn === 'melody' || fn === 'hook' ? 0.85 :
        fn === 'voice' ? 0.8 :
        fn === 'harmony' ? 0.6 :
        fn === 'foundation' ? 0.1 : 0.4;
      return {
        fit: base * (0.5 + 0.5 * p.audibility),
        reason: `answering the ${fn === 'unknown' ? 'most audible voice' : fn}`,
      };
    }

    case 'SPACE': {
      // Something the arrangement can spare: busy, but not load-bearing.
      const spare = (1 - p.importance) * 0.7 + p.density * 0.3;
      return {
        fit: spare,
        reason: `${fn} is the part the mix can spare`,
      };
    }

    case 'DROP': {
      // Take the melody, leave the riddim. Foundation and sub are protected:
      // a version without its bass is not a version.
      if (fn === 'foundation' || register === 'sub') return null;
      const base =
        fn === 'melody' || fn === 'hook' ? 0.9 :
        fn === 'harmony' ? 0.7 :
        fn === 'texture' ? 0.5 : 0.3;
      return { fit: base * (0.5 + 0.5 * p.importance), reason: `dropping the ${fn}` };
    }

    case 'BUILD': {
      // Build on something sustained or harmonic — building on a one-shot
      // percussion hit gives the ear nothing to follow.
      const base =
        rhythm === 'sustained' ? 0.8 :
        fn === 'harmony' ? 0.7 :
        fn === 'texture' ? 0.6 : 0.3;
      return { fit: base * (0.5 + 0.5 * p.audibility), reason: `building on the ${fn}` };
    }

    case 'TEXTURE': {
      // Anything audible with some repetition: the effect needs to be heard
      // more than once to read as texture rather than as an accident.
      return {
        fit: p.audibility * 0.6 + p.repetition * 0.4,
        reason: `colouring the ${family === 'unknown' ? fn : family}`,
      };
    }

    case 'TRANSITION': {
      // The most important thing in the arrangement marks the seam.
      return { fit: p.importance, reason: `marking the seam on the ${fn}` };
    }

    // REST and RESET never target a channel: one presses nothing, the other
    // lets go of everything.
    case 'REST':
    case 'RESET':
      return null;
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

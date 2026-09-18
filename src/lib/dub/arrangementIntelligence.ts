/**
 * Gate I — arrangement intelligence.
 *
 * A drop is not "mute the melodic channels". It is a decision about what the
 * arrangement can lose and still be itself, and about how what is lost leaves
 * and comes back.
 *
 * `versionDrop` muted every channel whose legacy role was melodic and unmuted
 * them all together on release. Three things wrong with that, all audible:
 *
 *  1. Role is not importance. A pad nobody can hear and the hook the whole
 *     tune rests on were treated identically.
 *  2. Everything left at once, so the drop had no shape — a cut, not a dub.
 *     The classic move is throw-then-mute: put the channel into the echo, THEN
 *     mute it, so the tail carries the part out of the mix and the listener
 *     hears it leave rather than vanish.
 *  3. Everything came back at once too, which is the same problem in reverse.
 *     Restoring in order of importance lets the riddim re-form under the
 *     melody rather than the whole mix reappearing like a switch.
 *
 * Pure: profiles in, a plan out. Nothing here fires anything.
 */

import type { MusicalChannelProfile } from './musicalChannelProfile';
import { axisOr } from './musicalChannelProfile';

export type DropBehavior =
  /** Never dropped: the arrangement stops being itself without it. */
  | 'protect'
  /** Dropped, but thrown into the echo first so the tail carries it out. */
  | 'throwThenMute'
  /** Dropped outright. */
  | 'mute';

export interface ChannelDropPlan {
  channel: number;
  behavior: DropBehavior;
  /** Arrangement importance that produced the decision, 0..1. */
  importance: number;
  /** Order to restore in — 0 comes back first. */
  restoreOrder: number;
  reason: string;
}

export interface DropPlanOptions {
  /** Importance at or above which a channel is protected outright. */
  protectAbove?: number;
  /** Confidence below which a profile cannot rule a channel in or out. */
  minConfidence?: number;
  /** Channels the caller already knows must survive (user-muted, soloed…). */
  exclude?: ReadonlySet<number>;
}

/**
 * What a drop should do to each channel.
 *
 * Every channel gets an entry, including the protected ones: a caller that
 * only sees the droppable list cannot tell "nothing to drop" from "everything
 * is protected", and those want different behaviour.
 */
export function planDrop(
  profiles: ReadonlyMap<number, MusicalChannelProfile>,
  options: DropPlanOptions = {},
): ChannelDropPlan[] {
  const protectAbove = options.protectAbove ?? 0.8;
  const minConfidence = options.minConfidence ?? 0.5;
  const plans: ChannelDropPlan[] = [];

  for (const [channel, profile] of profiles) {
    const fn = axisOr(profile.musicalFunction, minConfidence, 'unknown');
    const register = axisOr(profile.register, minConfidence, 'mid');
    const family = axisOr(profile.instrumentFamily, minConfidence, 'unknown');

    let behavior: DropBehavior;
    let reason: string;

    if (options.exclude?.has(channel)) {
      behavior = 'protect';
      reason = 'excluded by the caller';
    } else if (fn === 'foundation' || register === 'sub' || family === 'bass') {
      // The riddim survives every drop. A version without its bass and drums
      // is not a version, it is silence with reverb on it.
      behavior = 'protect';
      reason = `${fn === 'foundation' ? 'foundation' : register === 'sub' ? 'sub register' : 'bass'} carries the riddim`;
    } else if (fn === 'groove' && profile.importance >= 0.5) {
      behavior = 'protect';
      reason = 'the groove is what the drop drops INTO';
    } else if (profile.importance >= protectAbove) {
      behavior = 'protect';
      reason = `arrangement leans on this (importance ${profile.importance.toFixed(2)})`;
    } else if (profile.audibility >= 0.4) {
      // Audible enough that its disappearance would be heard as a cut: give it
      // to the echo on the way out.
      behavior = 'throwThenMute';
      reason = 'audible enough that the tail should carry it out';
    } else {
      behavior = 'mute';
      reason = 'quiet enough to simply leave';
    }

    plans.push({
      channel,
      behavior,
      importance: profile.importance,
      restoreOrder: 0,
      reason,
    });
  }

  // Restoration order: most important first, so the riddim re-forms under the
  // melody instead of the whole mix reappearing like a switch. Protected
  // channels never left, so they take no order.
  const dropped = plans
    .filter(p => p.behavior !== 'protect')
    .sort((a, b) => b.importance - a.importance);
  dropped.forEach((plan, index) => { plan.restoreOrder = index; });

  return plans;
}

/** The channels a drop actually takes, in the order they should leave. */
export function droppedChannels(plans: readonly ChannelDropPlan[]): ChannelDropPlan[] {
  // Least important leaves first: the mix thins from the edges inward, which
  // is how a hand would do it.
  return plans
    .filter(p => p.behavior !== 'protect')
    .sort((a, b) => a.importance - b.importance);
}

/**
 * Delay before each channel returns, in ms, from its restore order.
 *
 * Staggered rather than simultaneous, but bounded: a restoration that takes
 * longer than the drop did stops reading as a return and starts reading as a
 * new arrangement.
 */
export function restoreDelayMs(
  plan: ChannelDropPlan,
  stepMs: number,
  maxMs: number,
): number {
  return Math.min(maxMs, plan.restoreOrder * stepMs);
}

/**
 * Which channels a per-channel dub op acts on.
 *
 * A mixing desk has no "fire this effect on channel 3" button. The effects sit
 * on aux sends, so a channel is in the echo because its SEND is open — the
 * routing is the fader, and several channels at once is several sends up. That
 * is how dub was mixed, and it is what the deck's per-channel sends already
 * are.
 *
 * What is left is the handful of ops that genuinely name one channel: Skank and
 * Float capture a stab from a source, Build ramps that channel's send, Emph
 * works on the one carrying the bass. The answer for those is the one the desk
 * gives — the channel your hand is on. On the X-Touch that is reported
 * natively, because its faders are touch-sensitive and send a touch CC; on
 * screen it is the strip whose fader you last moved.
 *
 * Touched nothing yet means EVERY channel, which is exactly what the deck's
 * master card does today, so the behaviour that exists is the default.
 *
 * Design: thoughts/shared/plans/2026-09-23-dub-deck-channel-section.md
 */

/**
 * How long a target survives without being renewed.
 *
 * A target has to expire or the channel your hand was on ten minutes ago is
 * still the one Skank fires at. Long enough to touch a fader, look up and play
 * a phrase; short enough that a forgotten target does not become a wrong note
 * later in the take.
 */
export const DUB_TARGET_TTL_MS = 30_000;

export interface DubTarget {
  channelId: number;
  /** When the hand was last on it, from `performance.now()`. */
  touchedAtMs: number;
}

/**
 * The channels an op should fire on.
 *
 * Returns every visible channel when there is no live target — no target, no
 * expiry, or a target naming a channel the pattern no longer has. That last
 * case matters: a song change can leave a target pointing past the end of the
 * pattern, and firing at a channel that is not there is worse than firing at
 * all of them.
 */
export function resolveDubTarget(
  target: DubTarget | null,
  visibleChannelCount: number,
  nowMs: number,
  ttlMs: number = DUB_TARGET_TTL_MS,
): number[] {
  const all = () => Array.from({ length: Math.max(0, visibleChannelCount) }, (_, i) => i);
  if (!target) return all();
  if (target.channelId < 0 || target.channelId >= visibleChannelCount) return all();
  if (nowMs - target.touchedAtMs > ttlMs) return all();
  return [target.channelId];
}

/** Is this channel the one the ops will act on right now? */
export function isDubTargetChannel(
  target: DubTarget | null,
  channelId: number,
  visibleChannelCount: number,
  nowMs: number,
  ttlMs: number = DUB_TARGET_TTL_MS,
): boolean {
  const resolved = resolveDubTarget(target, visibleChannelCount, nowMs, ttlMs);
  return resolved.length === 1 && resolved[0] === channelId;
}

/**
 * What the op panel says it is about to do.
 *
 * The target is invisible otherwise, and then aiming an op is a guess — the
 * one risk the design names as fatal to the whole idea.
 */
export function describeDubTarget(
  target: DubTarget | null,
  visibleChannelCount: number,
  nowMs: number,
  ttlMs: number = DUB_TARGET_TTL_MS,
): string {
  const resolved = resolveDubTarget(target, visibleChannelCount, nowMs, ttlMs);
  return resolved.length === 1 ? `Channel ${resolved[0] + 1}` : 'All channels';
}

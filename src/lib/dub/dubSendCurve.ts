/**
 * Fader position → per-channel dub tap gain, and the send levels a freshly
 * built dub wiring must start at.
 *
 * The curve was private to `ChannelRoutedEffects`. It is here because the
 * SEEDING rule belongs beside it: a per-channel gain node is created at 0, and
 * the only thing that ever wrote it was a live `setChannelDubSend` call. So
 * every path that rebuilds the wiring — a song load, a bus recreate, a
 * crash-recovery restore — produced a graph where the store said the sends
 * were up, the worklet rendered its dub slots, `DubBus` listed the channel
 * taps, the deck drew the faders at 83 %, and the gain between them was zero.
 *
 * Measured 2026-09-23 after a reload + restore: `busInput` 0.00000 with four
 * sends at 0.77-0.84 and `activeDubSlots: 4`. Re-writing the SAME values the
 * store already held took it to 0.04716. Every colour move was processing
 * silence, which is what "with all channel faders at max the only one i can
 * hear is sweep" was.
 */

import { effectiveDubSend } from './sendAudibility';

/** Largest number of tracker channels the dub bus taps. */
export const MAX_DUB_SEND_CHANNELS = 32;

/**
 * Fader position (0-1) → tap gain. Soft-compression curve matching
 * `DubBus.applyDubSendCurve` — keeps low/mid slider travel nearly linear but
 * caps the top at 0.7 so max send does not drown the dry signal in reverb.
 * Identity at 0, 0.7 at 1.0. One definition: the same number is written to
 * the tap AND reported to DubBus as the channel's restore baseline.
 */
export function dubSendToGain(fader: number): number {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(fader) ? fader : 0));
  return clamped <= 0 ? 0 : clamped >= 1 ? 0.7 : clamped * (1 - 0.3 * clamped * clamped);
}

/** What a mixer channel carries that matters here. */
export interface DubSendChannelLike {
  dubSend?: number | null;
}

/**
 * The gain every per-channel dub node should hold, given the mixer store.
 *
 * Pure, and indexed by channel, so both the initial wiring and a rebuild seed
 * from one rule instead of each remembering to. A channel the store has
 * nothing for is silent, which is also the correct value for a closed send.
 */
export function storedDubSendGains(
  channels: ReadonlyArray<DubSendChannelLike | null | undefined> | null | undefined,
  max = MAX_DUB_SEND_CHANNELS,
  /** Channels below this index bleed at the floor when closed (BLEED on). */
  bleedChannels = 0,
): number[] {
  const gains: number[] = [];
  for (let ch = 0; ch < max; ch++) {
    gains.push(dubSendToGain(effectiveDubSend(channels?.[ch]?.dubSend ?? 0, ch < bleedChannels)));
  }
  return gains;
}

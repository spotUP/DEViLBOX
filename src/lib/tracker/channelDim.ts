/**
 * Channel mute/solo dimming policy — the single source of truth for whether a
 * channel's grid column should be greyed out.
 *
 * FT2 greys the whole muted column in the pattern body (not just the header).
 * The rule is shared by every renderer (WebGL and Canvas2D), so it lives here
 * as a pure function that can be unit-tested without a canvas.
 *
 * Muted channels stay editable — dimming is purely visual.
 */

/** True when at least one channel in the pattern is soloed. */
export function anySoloActive(channels: ReadonlyArray<{ solo?: boolean }>): boolean {
  return channels.some((ch) => !!ch.solo);
}

/**
 * Whether a channel is silent under the mixer's mute/solo state — the one rule
 * the audio engines, the mixer store and every renderer share.
 *
 * A channel is silent when it is explicitly muted, or when some other channel
 * is soloed and this one is not. Mute wins: a channel that is both muted and
 * soloed stays silent.
 */
export function isChannelSilenced(muted: boolean, solo: boolean, anySolo: boolean): boolean {
  return muted || (anySolo && !solo);
}

/** Whether a channel should be drawn dimmed: exactly when it is silent. */
export const isChannelDimmed = isChannelSilenced;

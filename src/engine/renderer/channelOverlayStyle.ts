/**
 * Full-height channel overlay strengths for the pattern grid, shared by the
 * WebGL renderer and the Canvas2D fallback so both draw the same picture.
 * Every overlay is drawn after the opaque row backgrounds and before the cell
 * text, in this order: stripe, cursor-channel tint, channel colour, mute dim.
 */

/** Every second channel gets a black wash this strong, so channel boundaries read at a glance. */
export const CHANNEL_STRIPE_ALPHA = 0.07;
/** The cursor channel gets the accent hue this strong, so it never reads as one of the stripes. */
export const CURSOR_CHANNEL_TINT_ALPHA = 0.05;
/** A channel with its own colour gets that colour this strong. */
export const CHANNEL_COLOR_TINT_ALPHA = 0.03;
/** A muted (or non-soloed) channel gets a black wash this strong. */
export const MUTED_OVERLAY_ALPHA = 0.2;
/** And its cell text is drawn at this alpha. */
export const MUTED_TEXT_ALPHA = 0.55;

/** Whether channel `ch` (0-based) carries the stripe. */
export const isStripedChannel = (ch: number): boolean => ch % 2 === 1;

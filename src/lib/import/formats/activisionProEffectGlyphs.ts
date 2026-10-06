/**
 * activisionProEffectGlyphs.ts - Activision Pro track operations as grid effects.
 *
 * SINGLE SOURCE OF TRUTH for the effTyp integers an Activision Pro event's
 * operations occupy in the tracker grid. None is an XM effect: each keeps its
 * own id and its argument byte verbatim. `effTyp` is a GLOBAL id space shared
 * by every format's display path (xmEffectToString + TrackerGLRenderer +
 * TrackerCanvas2DRenderer); this block is 0xB0..0xB9.
 *
 * ZERO imports on purpose - imported by the renderer workers.
 */

export const AVP_FX_BASE = 0xb0;
export const AVP_FX_MIN = 0xb0;
export const AVP_FX_MAX = 0xb9;

/** Operation names, in id order. */
export const AVP_EFFECT_NAMES = [
  'portamento', 'hold sample', 'envelope restart', 'track volume', 'add track volume',
  'mute', 'max speed counter', 'speed variation 2', 'global transpose', 'unknown operation',
] as const;

/** One letter per operation, in id order. */
const LETTERS = 'PHEVAMSXTU';

export const AVP_EFFECT_GLYPH: Record<number, string> = Object.fromEntries(
  Array.from(LETTERS, (ch, i) => [AVP_FX_BASE + i, ch]),
);

/** An Activision Pro operation as a 3-char grid token, or null outside the block. */
export function activisionProEffectToString(effTyp: number, eff: number): string | null {
  const glyph = AVP_EFFECT_GLYPH[effTyp];
  if (glyph === undefined) return null;
  return `${glyph}${(eff & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

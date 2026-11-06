/**
 * beathovenEffectGlyphs.ts - Beathoven Synthesizer stream commands as grid effects.
 *
 * SINGLE SOURCE OF TRUTH for the effTyp integers a Beathoven command occupies in the tracker grid. None is an XM
 * effect; each keeps its own id and its operand verbatim (low byte), named in the player's terms
 * (third-party/nuade/players/beathoven/beathoven_voice.c). `effTyp` is a GLOBAL id space shared by every format's
 * display path (xmEffectToString + TrackerGLRenderer + TrackerCanvas2DRenderer); this block is 0x500..0x503.
 *
 * ZERO imports on purpose - imported by the renderer workers.
 */

export const BTH_FX_BASE = 0x500;

/** Command ids. */
export const BTH_FX = {
  /** S: slide step (0 ends the slide). */
  slide: BTH_FX_BASE,
  /** L: legato on (1) or off (0). */
  legato: BTH_FX_BASE + 1,
  /** B: note bias (added to the note number). */
  noteBias: BTH_FX_BASE + 2,
  /** A: arpeggio, the count of note numbers cycled. */
  arpeggio: BTH_FX_BASE + 3,
} as const;

export const BTH_FX_MIN = BTH_FX.slide;
export const BTH_FX_MAX = BTH_FX.arpeggio;

export const BTH_EFFECT_GLYPH: Record<number, string> = {
  [BTH_FX.slide]: 'S',
  [BTH_FX.legato]: 'L',
  [BTH_FX.noteBias]: 'B',
  [BTH_FX.arpeggio]: 'A',
};

/** A Beathoven command as a 3-char grid token, or null outside the block. */
export function beathovenEffectToString(effTyp: number, eff: number): string | null {
  const glyph = BTH_EFFECT_GLYPH[effTyp];
  if (glyph === undefined) return null;
  return `${glyph}${(eff & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

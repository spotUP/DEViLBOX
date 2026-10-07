/**
 * maEffectGlyphs.ts - Music Assembler track and position-list commands as grid effects.
 *
 * SINGLE SOURCE OF TRUTH for the effTyp integers a Music Assembler command occupies in the tracker
 * grid. None is an XM effect: each keeps its own id and its argument byte verbatim, named in the
 * player's own terms. `effTyp` is a GLOBAL id space shared by every format's display path
 * (xmEffectToString + TrackerGLRenderer + TrackerCanvas2DRenderer); this block is 0xFB..0xFE
 * (Future Player holds 0xF3..0xFA).
 *
 * ZERO imports on purpose - imported by the renderer workers.
 */

export const MA_FX_BASE = 0xfb;

/** Command names, in id order (the walk events of maWalk.ts map to these). */
export const MA_EFFECT_NAMES = ['portamento', 'legato', 'keep envelope', 'transpose'] as const;

/** Command ids. */
export const MA_FX = { portamento: MA_FX_BASE, legato: MA_FX_BASE + 1, keepEnvelope: MA_FX_BASE + 2, transpose: MA_FX_BASE + 3 } as const;

export const MA_FX_MIN = MA_FX_BASE;
export const MA_FX_MAX = MA_FX_BASE + MA_EFFECT_NAMES.length - 1;

/** One letter per command, in id order. */
const LETTERS = 'PLKT';

export const MA_EFFECT_GLYPH: Record<number, string> = Object.fromEntries(
  Array.from(LETTERS, (ch, i) => [MA_FX_BASE + i, ch]),
);

/** A Music Assembler command as a 3-char grid token, or null outside the block. */
export function musicAssemblerEffectToString(effTyp: number, eff: number): string | null {
  const glyph = MA_EFFECT_GLYPH[effTyp];
  if (glyph === undefined) return null;
  return `${glyph}${(eff & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

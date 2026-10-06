/**
 * actionamicsEffectGlyphs.ts - Actionamics Sound Tool effect ids + glyphs.
 *
 * SINGLE SOURCE OF TRUTH for the effTyp integers the sixteen track effects
 * (effect bytes 0x70..0x7F) occupy in the tracker grid. None of them is an XM
 * effect with the same meaning (set rows and break act on the whole position,
 * the volume slides restart from the instrument's attack level, ...), so each
 * keeps its own id and its argument byte verbatim. `effTyp` is a GLOBAL id
 * space shared by every format's display path (xmEffectToString +
 * TrackerGLRenderer + TrackerCanvas2DRenderer); this block is 0xA0..0xAF.
 *
 * ZERO imports on purpose - imported by the renderer workers.
 */

/** effTyp of an Actionamics effect byte (0x70..0x7F). */
export const AST_FX_BASE = 0xa0;
export const AST_FX_MIN = 0xa0;
export const AST_FX_MAX = 0xaf;

/** Effect byte names, in effect byte order 0x70..0x7F. */
export const AST_EFFECT_NAMES = [
  'arpeggio', 'slide up', 'slide down', 'volume slide after envelope', 'vibrato', 'set rows',
  'sample offset', 'note delay', 'mute', 'sample restart', 'tremolo', 'break', 'set volume',
  'volume slide', 'volume slide and vibrato', 'set speed',
] as const;

/** One letter per effect, in effect byte order. */
const LETTERS = 'AUDEVROTMSKBCLWF';

export const AST_EFFECT_GLYPH: Record<number, string> = Object.fromEntries(
  Array.from(LETTERS, (ch, i) => [AST_FX_BASE + i, ch]),
);

export const astEffectType = (effectByte: number): number => AST_FX_BASE + (effectByte - 0x70);
export const astEffectByte = (effTyp: number): number => 0x70 + (effTyp - AST_FX_BASE);

/** An Actionamics effect as a 3-char grid token, or null outside the block. */
export function actionamicsEffectToString(effTyp: number, eff: number): string | null {
  const glyph = AST_EFFECT_GLYPH[effTyp];
  if (glyph === undefined) return null;
  return `${glyph}${(eff & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

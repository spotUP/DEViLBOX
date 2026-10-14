/**
 * furnaceEffectGlyphs.ts - Furnace general effect families 0x80..0x9F as grid effects.
 *
 * Furnace passes its own effect code through as `effTyp` (furnaceEditorCells.ts), and its general
 * table (third-party/furnace-master/src/engine/engine.cpp getEffectDesc) puts two families above
 * what the shared glyph row has a letter for:
 *   80xx..8Axx  panning: 80xx set panning (00 left, 80 centre, FF right), 81/82 one channel,
 *               83xy panning slide, 84xy panbrello, 88xy/89xx/8Axx rear channels.
 *   90xx..92xx  sample offset: 90xx first byte, 91xx second byte (x256), 92xx third byte (x65536).
 * A grid cell is one glyph + two hex digits, so the family shows as its high hex digit, the same
 * digit XM uses for the same job (8xx panning, 9xx sample offset); the code's low digit is in the
 * cell's effTyp, not the glyph. This table is only consulted after every other format's block, so
 * it never overrides a glyph another format owns.
 *
 * ZERO imports on purpose - imported by the renderer workers.
 */

export const FURNACE_FX_MIN = 0x80;
export const FURNACE_FX_MAX = 0x9f;

export const FURNACE_EFFECT_GLYPH: Record<number, string> = Object.fromEntries(
  Array.from({ length: FURNACE_FX_MAX - FURNACE_FX_MIN + 1 }, (_, i) => [FURNACE_FX_MIN + i, i < 0x10 ? '8' : '9']),
);

/** A Furnace 0x80..0x9F effect as a 3-char grid token, or null outside the block. */
export function furnaceEffectToString(effTyp: number, eff: number): string | null {
  const glyph = FURNACE_EFFECT_GLYPH[effTyp];
  if (glyph === undefined) return null;
  return `${glyph}${(eff & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

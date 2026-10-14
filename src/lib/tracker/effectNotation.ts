/**
 * effectNotation - how a channel's effect columns are written in the pattern grid.
 *
 *   'tracker'  FT2 style: one glyph + two hex digits ("A0F"), 3 characters. `effTyp`
 *              lives in the one id space every tracker format shares (0x00-0x23 the
 *              FT2 letters, each format's private block above that).
 *   'furnace'  Furnace's own: the two-hex-digit effect code + the two-hex-digit value
 *              ("8040", "E580"), 4 characters, exactly as Furnace's pattern editor shows
 *              it. `effTyp` is the raw Furnace effect code (0x00-0xFF, every chip), never
 *              folded into a tracker letter, so no format's glyph block can claim it.
 *
 * The notation is a property of the cells: the importer that writes Furnace codes into
 * `effTyp` marks the channel (`channelMeta.effectNotation`), and every reader - channel
 * widths, renderers, caret and hit-test geometry, cursor digits, keyboard entry, text
 * output - asks here. A channel without the mark is 'tracker'.
 *
 * ZERO imports on purpose - imported by the renderer workers.
 */

export type EffectNotation = 'tracker' | 'furnace';

/** The notation of a channel, from its channelMeta (or a worker snapshot carrying the same field). */
export function effectNotationOf(meta: { effectNotation?: EffectNotation } | null | undefined): EffectNotation {
  return meta?.effectNotation ?? 'tracker';
}

/** Characters (= cursor digits) of the effect TYPE field: 1 glyph, or Furnace's 2 hex digits. */
export function effectTypeDigits(notation: EffectNotation | undefined): number {
  return notation === 'furnace' ? 2 : 1;
}

/** Characters of one whole effect cell (type + two value digits). */
export function effectCellChars(notation: EffectNotation | undefined): number {
  return effectTypeDigits(notation) + 2;
}

/** Pixel width of one effect cell including its trailing gap (the grid's `cw * 3 + 4` for 'tracker'). */
export function effectCellWidth(charWidth: number, notation: EffectNotation | undefined): number {
  return charWidth * effectCellChars(notation) + 4;
}

/** An empty effect cell in the notation, drawn with `dot` ('.' or the 2D renderer's '·'). */
export function emptyEffectText(notation: EffectNotation | undefined, dot = '.'): string {
  return dot.repeat(effectCellChars(notation));
}

const HEX2: string[] = Array.from({ length: 256 }, (_, i) => i.toString(16).toUpperCase().padStart(2, '0'));

/** A Furnace effect as Furnace writes it: code + value, two hex digits each ("8040"). */
export function furnaceEffectText(effTyp: number, eff: number): string {
  return HEX2[effTyp & 0xff] + HEX2[eff & 0xff];
}

/** The new effTyp after typing hex digit `digit` at type position `digitIndex` in Furnace notation. */
export function furnaceEffectTypeAfterDigit(effTyp: number, digitIndex: number, digit: number): number {
  const d = digit & 0xf;
  return digitIndex === 0 ? (d << 4) | (effTyp & 0x0f) : (effTyp & 0xf0) | d;
}

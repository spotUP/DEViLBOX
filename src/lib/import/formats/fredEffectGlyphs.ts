/**
 * fredEffectGlyphs.ts - Fred Editor private effect id block + glyphs.
 *
 * SINGLE SOURCE OF TRUTH for the effTyp integers the Fred Editor pattern
 * commands occupy in the tracker grid where no XM effect means the same
 * thing (the tempo command $82 is XM Fxx, the instrument command $83 the
 * instrument column, the pause $84 a note-off). `effTyp` is a GLOBAL id
 * space shared by every format's display path (xmEffectToString +
 * TrackerGLRenderer + TrackerCanvas2DRenderer); this block is 0x70..0x73.
 *
 * ZERO imports on purpose - imported by the renderer workers.
 *
 * Ground truth: the replayer's Lab2_CheckPort (FREDPLA0.2ED), see
 * thoughts/shared/research/2026-10-06_fred-editor-format.md.
 */

/** Fred Editor private effect ids (reserved block 0x70..0x73). */
export const FRED_FX = {
  /** P: portamento ($81) - glide over `eff` lines (byte 1). */
  portaLines: 0x70,
  /** T: portamento target note byte (byte 2). */
  portaTarget: 0x71,
  /** R: lines the glide waits before it starts (byte 3); absent = 0. */
  portaDelay: 0x72,
  /** N: a note byte outside the grid's note range (0..11, 108..127), kept verbatim. */
  rawNote: 0x73,
} as const;

export const FRED_FX_MIN = FRED_FX.portaLines;
export const FRED_FX_MAX = FRED_FX.rawNote;

export const FRED_EFFECT_GLYPH: Record<number, string> = {
  [FRED_FX.portaLines]: 'P',
  [FRED_FX.portaTarget]: 'T',
  [FRED_FX.portaDelay]: 'R',
  [FRED_FX.rawNote]: 'N',
};

/** A Fred Editor private effect as a 3-char grid token, or null outside the block. */
export function fredEffectToString(effTyp: number, eff: number): string | null {
  const glyph = FRED_EFFECT_GLYPH[effTyp];
  if (glyph === undefined) return null;
  return `${glyph}${(eff & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

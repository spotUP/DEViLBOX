/**
 * soundMasterEffectGlyphs.ts - Sound Master private effect id block + glyphs.
 *
 * SINGLE SOURCE OF TRUTH for the effTyp integers the Sound Master row bits
 * occupy in the tracker grid where no XM effect means the same thing (the
 * portamento note is XM 3xx, the info byte's volume the volume column, the
 * smpro speed and break rows XM Fxx and D00; info bit 7 (no transposes) is
 * in the note shown and the info bits the player ignores are not shown -
 * soundMasterGrid.ts). `effTyp`
 * is a GLOBAL id space shared by every format's display path
 * (xmEffectToString + TrackerGLRenderer + TrackerCanvas2DRenderer); this
 * block is 0x74..0x76, after Fred Editor's 0x70..0x73.
 *
 * ZERO imports on purpose - imported by the renderer workers.
 *
 * Ground truth: the replayer each module carries (row read, note trigger and
 * period routines), thoughts/shared/research/2026-10-06_sound-master-format.md.
 */

/** Sound Master private effect ids (reserved block 0x74..0x76). */
export const SM_FX = {
  /** H: note byte $FF - the voice holds (its envelope keeps attacking), no new note; eff = the info byte, which the player ignores. */
  hold: 0x74,
  /** L: note byte bit 7 - the pitch changes, the sample is not restarted. */
  legato: 0x75,
  /** N: a note byte whose pitch the grid cannot name, kept verbatim (eff = the byte). */
  rawNote: 0x76,
} as const;

export const SM_FX_MIN = SM_FX.hold;
export const SM_FX_MAX = SM_FX.rawNote;

export const SM_EFFECT_GLYPH: Record<number, string> = {
  [SM_FX.hold]: 'H',
  [SM_FX.legato]: 'L',
  [SM_FX.rawNote]: 'N',
};

/** A Sound Master private effect as a 3-char grid token, or null outside the block. */
export function soundMasterEffectToString(effTyp: number, eff: number): string | null {
  const glyph = SM_EFFECT_GLYPH[effTyp];
  if (glyph === undefined) return null;
  return `${glyph}${(eff & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

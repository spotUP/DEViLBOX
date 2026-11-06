/**
 * daveLoweEffectGlyphs.ts - the Dave Lowe volume-envelope command (word 12) as a grid effect.
 *
 * SINGLE SOURCE OF TRUTH for the effTyp integer a Dave Lowe SET_VOL_ENV command occupies in the tracker grid.
 * effTyp is a GLOBAL id space shared by every format's display path; 0x400 is above every other format's block
 * (Sound Factory ends at 0x322). The argument byte is the 1-based index into the song's list of distinct envelope
 * pointers (first use order), 0 = none. ZERO imports on purpose - imported by the renderer workers.
 */
export const DL_FX_VOL_ENV = 0x400;

/** The envelope command as a 3-char grid token, or null for any other effect. */
export function daveLoweEffectToString(effTyp: number, eff: number): string | null {
  if (effTyp !== DL_FX_VOL_ENV) return null;
  return `E${(eff & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

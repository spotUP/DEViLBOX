/**
 * robHubbardEffectGlyphs.ts - Rob Hubbard track commands as grid effects.
 *
 * SINGLE SOURCE OF TRUTH for the effTyp integers a Rob Hubbard stream command
 * occupies in the tracker grid. None is an XM effect: each keeps its own id and
 * its argument byte verbatim, named in the player's own terms. `effTyp` is a
 * GLOBAL id space shared by every format's display path (xmEffectToString +
 * TrackerGLRenderer + TrackerCanvas2DRenderer); this block is 0xED..0xF2.
 *
 * ZERO imports on purpose - imported by the renderer workers.
 */

export const RH_FX_BASE = 0xed;

/** Command names, in id order (the walk kinds of rhWalk.ts map to these). */
export const RH_EFFECT_NAMES = [
  'portamento speed', 'sustain', 'volume', 'song end', 'track list restart', 'unknown command',
] as const;

/** Command ids. */
export const RH_FX = {
  portamento: RH_FX_BASE, sustain: RH_FX_BASE + 1, volume: RH_FX_BASE + 2,
  songEnd: RH_FX_BASE + 3, listRestart: RH_FX_BASE + 4, unknown: RH_FX_BASE + 5,
} as const;

export const RH_FX_MIN = RH_FX_BASE;
export const RH_FX_MAX = RH_FX_BASE + RH_EFFECT_NAMES.length - 1;

/** One letter per command, in id order. */
const LETTERS = 'PSVEZU';

export const RH_EFFECT_GLYPH: Record<number, string> = Object.fromEntries(
  Array.from(LETTERS, (ch, i) => [RH_FX_BASE + i, ch]),
);

/** A Rob Hubbard command as a 3-char grid token, or null outside the block. */
export function robHubbardEffectToString(effTyp: number, eff: number): string | null {
  const glyph = RH_EFFECT_GLYPH[effTyp];
  if (glyph === undefined) return null;
  return `${glyph}${(eff & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

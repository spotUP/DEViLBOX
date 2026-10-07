/**
 * fpEffectGlyphs.ts - Future Player stream commands as grid effects.
 *
 * SINGLE SOURCE OF TRUTH for the effTyp integers a Future Player command occupies in the tracker
 * grid. None is an XM effect: each keeps its own id and its argument byte verbatim, named in the
 * player's own terms. `effTyp` is a GLOBAL id space shared by every format's display path
 * (xmEffectToString + TrackerGLRenderer + TrackerCanvas2DRenderer); this block is 0xF3..0xFA
 * (Rob Hubbard holds 0xED..0xF2).
 *
 * ZERO imports on purpose - imported by the renderer workers.
 */

export const FP_FX_BASE = 0xf3;

/** Command names, in id order (the walk kinds of fpWalk.ts map to these). */
export const FP_EFFECT_NAMES = [
  'portamento rate', 'arpeggio table', 'arpeggio reset', 'transpose 1', 'transpose 2', 'voice end', 'no retrigger', 'unknown command',
] as const;

/** Command ids. */
export const FP_FX = {
  portamento: FP_FX_BASE, arpTable: FP_FX_BASE + 1, arpReset: FP_FX_BASE + 2, transpose1: FP_FX_BASE + 3,
  transpose2: FP_FX_BASE + 4, end: FP_FX_BASE + 5, legato: FP_FX_BASE + 6, unknown: FP_FX_BASE + 7,
} as const;

export const FP_FX_MIN = FP_FX_BASE;
export const FP_FX_MAX = FP_FX_BASE + FP_EFFECT_NAMES.length - 1;

/** One letter per command, in id order. */
const LETTERS = 'PARTUELX';

export const FP_EFFECT_GLYPH: Record<number, string> = Object.fromEntries(
  Array.from(LETTERS, (ch, i) => [FP_FX_BASE + i, ch]),
);

/** A Future Player command as a 3-char grid token, or null outside the block. */
export function futurePlayerEffectToString(effTyp: number, eff: number): string | null {
  const glyph = FP_EFFECT_GLYPH[effTyp];
  if (glyph === undefined) return null;
  return `${glyph}${(eff & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

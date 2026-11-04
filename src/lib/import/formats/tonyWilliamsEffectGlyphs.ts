/**
 * tonyWilliamsEffectGlyphs.ts - Tony Williams (Sound Images) stream commands as grid effects.
 *
 * SINGLE SOURCE OF TRUTH for the effTyp integers a TW command occupies in the tracker grid.
 * effTyp is a GLOBAL id space shared by every format's display path; this block is 0x90..0x9F
 * (the only free run above 0x80, measured from every *EffectGlyphs.ts map). ZERO imports on
 * purpose - imported by the renderer workers.
 */
export const TW_FX_BASE = 0x90;

export const TW_EFFECT_NAMES = [
  'duration', 'tie', 'volume', 'envelope', 'envelope params', 'transpose', 'slide', 'vibrato',
  'vibrato off', 'flag', 'volume step', 'arpeggio', 'rest', 'fade', 'stop', 'loop',
] as const;

export const TW_FX = {
  duration: TW_FX_BASE, tie: TW_FX_BASE + 1, volume: TW_FX_BASE + 2, envelope: TW_FX_BASE + 3,
  envelopeParams: TW_FX_BASE + 4, transpose: TW_FX_BASE + 5, slide: TW_FX_BASE + 6, vibrato: TW_FX_BASE + 7,
  vibratoOff: TW_FX_BASE + 8, flag: TW_FX_BASE + 9, volumeStep: TW_FX_BASE + 10, arpeggio: TW_FX_BASE + 11,
  rest: TW_FX_BASE + 12, fade: TW_FX_BASE + 13, stop: TW_FX_BASE + 14, loop: TW_FX_BASE + 15,
} as const;

const LETTERS = 'DTVEPXSBOFUARGQL';

export const TW_EFFECT_GLYPH: Record<number, string> = Object.fromEntries(
  Array.from(LETTERS, (ch, i) => [TW_FX_BASE + i, ch]),
);

/** A TW command as a 3-char grid token, or null outside the block. */
export function tonyWilliamsEffectToString(effTyp: number, eff: number): string | null {
  const glyph = TW_EFFECT_GLYPH[effTyp];
  if (glyph === undefined) return null;
  return `${glyph}${(eff & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

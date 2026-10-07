/**
 * benDaglishEffectGlyphs.ts - Ben Daglish track and position-list commands as grid effects.
 *
 * SINGLE SOURCE OF TRUTH for the effTyp integers a Ben Daglish command occupies in the tracker
 * grid. None is an XM effect: each keeps its own id and its argument byte verbatim, named in the
 * player's own terms. `effTyp` is a GLOBAL id space shared by every format's display path
 * (xmEffectToString + TrackerGLRenderer + TrackerCanvas2DRenderer); this block is 0xD8..0xEC
 * (David Whittaker holds 0xC0..0xD4).
 *
 * ZERO imports on purpose - imported by the renderer workers.
 */

export const BD_FX_BASE = 0xd8;

/** Command names, in id order (the walk kind of ben_daglish.c's bd_walk maps to one or more of these). */
export const BD_EFFECT_NAMES = [
  'sample map', 'portamento delay', 'portamento duration', 'portamento delta', 'portamento off',
  'fade speed', 'fade duration', 'fade add', 'fade off', 'slide portamento duration', 'slide portamento off',
  'channel volume', 'volume slide speed', 'volume slide add', 'volume slide off',
  'transpose', 'track repeat', 'master fade', 'map set index', 'map set sample', 'end',
] as const;

/** Command ids. */
export const BD_FX = {
  sampleMap: BD_FX_BASE, portaDelay: BD_FX_BASE + 1, portaDuration: BD_FX_BASE + 2, portaDelta: BD_FX_BASE + 3,
  portaOff: BD_FX_BASE + 4, fadeSpeed: BD_FX_BASE + 5, fadeDuration: BD_FX_BASE + 6, fadeAdd: BD_FX_BASE + 7,
  fadeOff: BD_FX_BASE + 8, porta2Duration: BD_FX_BASE + 9, porta2Off: BD_FX_BASE + 10,
  channelVolume: BD_FX_BASE + 11, volSlideSpeed: BD_FX_BASE + 12, volSlideAdd: BD_FX_BASE + 13,
  volSlideOff: BD_FX_BASE + 14, transpose: BD_FX_BASE + 15, trackRepeat: BD_FX_BASE + 16,
  masterFade: BD_FX_BASE + 17, mapSetIndex: BD_FX_BASE + 18, mapSetSample: BD_FX_BASE + 19, end: BD_FX_BASE + 20,
} as const;

export const BD_FX_MIN = BD_FX_BASE;
export const BD_FX_MAX = BD_FX_BASE + BD_EFFECT_NAMES.length - 1;

/** One letter per command, in id order. */
const LETTERS = 'BDURNFTAOKJVSLZXYMIGE';

export const BD_EFFECT_GLYPH: Record<number, string> = Object.fromEntries(
  Array.from(LETTERS, (ch, i) => [BD_FX_BASE + i, ch]),
);

/** A Ben Daglish command as a 3-char grid token, or null outside the block. */
export function benDaglishEffectToString(effTyp: number, eff: number): string | null {
  const glyph = BD_EFFECT_GLYPH[effTyp];
  if (glyph === undefined) return null;
  return `${glyph}${(eff & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

/**
 * davidWhittakerEffectGlyphs.ts - David Whittaker track commands as grid effects.
 *
 * SINGLE SOURCE OF TRUTH for the effTyp integers a David Whittaker command
 * occupies in the tracker grid. None is an XM effect: each keeps its own id and
 * its argument byte verbatim, named in the player's own terms. `effTyp` is a
 * GLOBAL id space shared by every format's display path (xmEffectToString +
 * TrackerGLRenderer + TrackerCanvas2DRenderer); this block is 0xC0..0xD4.
 *
 * ZERO imports on purpose - imported by the renderer workers.
 */

export const DW_FX_BASE = 0xc0;

/** Command names, in id order (the walk kind of davidwhittaker.c's dw_walk maps to one of these). */
export const DW_EFFECT_NAMES = [
  'envelope', 'arpeggio', 'slide speed', 'slide delay', 'vibrato speed', 'vibrato depth', 'vibrato off',
  'global transpose', 'channel transpose', 'volume fade', 'global volume fade', 'global volume',
  'half volume on', 'half volume off', 'speed', 'delay speed', 'loop', 'restart', 'sound effect',
  'stop song', 'wait for next row',
] as const;

/** Command ids. */
export const DW_FX = {
  envelope: DW_FX_BASE, arpeggio: DW_FX_BASE + 1, slideSpeed: DW_FX_BASE + 2, slideDelay: DW_FX_BASE + 3,
  vibratoSpeed: DW_FX_BASE + 4, vibratoDepth: DW_FX_BASE + 5, vibratoOff: DW_FX_BASE + 6,
  globalTranspose: DW_FX_BASE + 7, channelTranspose: DW_FX_BASE + 8, volumeFade: DW_FX_BASE + 9,
  globalVolumeFade: DW_FX_BASE + 10, globalVolume: DW_FX_BASE + 11, halfVolumeOn: DW_FX_BASE + 12,
  halfVolumeOff: DW_FX_BASE + 13, speed: DW_FX_BASE + 14, delaySpeed: DW_FX_BASE + 15, loop: DW_FX_BASE + 16,
  restart: DW_FX_BASE + 17, soundEffect: DW_FX_BASE + 18, stopSong: DW_FX_BASE + 19, waitRow: DW_FX_BASE + 20,
} as const;

export const DW_FX_MIN = DW_FX_BASE;
export const DW_FX_MAX = DW_FX_BASE + DW_EFFECT_NAMES.length - 1;

/** One letter per command, in id order. */
const LETTERS = 'EASDVWOTCFGMHNPYLRXQU';

export const DW_EFFECT_GLYPH: Record<number, string> = Object.fromEntries(
  Array.from(LETTERS, (ch, i) => [DW_FX_BASE + i, ch]),
);

/** A David Whittaker command as a 3-char grid token, or null outside the block. */
export function davidWhittakerEffectToString(effTyp: number, eff: number): string | null {
  const glyph = DW_EFFECT_GLYPH[effTyp];
  if (glyph === undefined) return null;
  return `${glyph}${(eff & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

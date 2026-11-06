/**
 * commandStreamEffectGlyphs.ts - Riff Raff and Howie Davies stream commands as grid effects.
 *
 * SINGLE SOURCE OF TRUTH for the effTyp integers these two formats' commands occupy in the tracker grid. None is
 * an XM effect; each keeps its own id and its operand verbatim (low byte), named in the player's terms
 * (third-party/nuade/players/{riffraff,howiedavies}). `effTyp` is a GLOBAL id space shared by every format's
 * display path (xmEffectToString + TrackerGLRenderer + TrackerCanvas2DRenderer); the blocks are 0x510..0x517 and 0x520..0x521
 * (beathovenEffectGlyphs.ts holds 0x500..0x503).
 *
 * ZERO imports on purpose - imported by the renderer workers.
 */

export const RR_FX_BASE = 0x510;
/** Riff Raff pattern commands that change a voice's state (riffraff.c rr_run_command; Modulation and Loop do nothing in the player). */
export const RR_FX = {
  /** V: set volume. */
  setVolume: RR_FX_BASE,
  /** S: volume slide target (first argument byte). */
  volumeSlide: RR_FX_BASE + 1,
  /** R: volume slide rate (second argument byte). */
  volumeSlideRate: RR_FX_BASE + 2,
  /** F: master fade target (first argument byte). */
  masterFade: RR_FX_BASE + 3,
  /** G: master fade rate (second argument byte). */
  masterFadeRate: RR_FX_BASE + 4,
  /** P: pitch slide step, high byte (the 16-bit signed step is P then Q). */
  pitchSlide: RR_FX_BASE + 5,
  /** Q: pitch slide step, low byte. */
  pitchSlideLow: RR_FX_BASE + 6,
  /** O: pitch slide off. */
  pitchSlideOff: RR_FX_BASE + 7,
} as const;

export const HD_FX_BASE = 0x520;
/** Howie Davies pattern commands (howiedavies.c run_command). */
export const HD_FX = {
  /** S: speed, replayer ticks per sequencer step, for all voices. */
  speed: HD_FX_BASE,
  /** V: maximum volume. */
  maxVolume: HD_FX_BASE + 1,
} as const;

export const CS_FX_MIN = RR_FX_BASE;
export const CS_FX_MAX = HD_FX.maxVolume;

export const CS_EFFECT_GLYPH: Record<number, string> = {
  [RR_FX.setVolume]: 'V', [RR_FX.volumeSlide]: 'S', [RR_FX.volumeSlideRate]: 'R', [RR_FX.masterFade]: 'F',
  [RR_FX.masterFadeRate]: 'G', [RR_FX.pitchSlide]: 'P', [RR_FX.pitchSlideLow]: 'Q', [RR_FX.pitchSlideOff]: 'O',
  [HD_FX.speed]: 'S', [HD_FX.maxVolume]: 'V',
};

/** A command of these formats as a 3-char grid token, or null outside the blocks. */
export function commandStreamEffectToString(effTyp: number, eff: number): string | null {
  const glyph = CS_EFFECT_GLYPH[effTyp];
  if (glyph === undefined) return null;
  return `${glyph}${(eff & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

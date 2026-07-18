/**
 * sunEffectGlyphs.ts — SunTronic V1.3 private effect id block + display glyphs.
 *
 * SINGLE SOURCE OF TRUTH for the effTyp integers SunTronic's custom control
 * opcodes occupy, and the glyph each shows in the tracker grid.
 *
 * Why a dedicated block: `effTyp` is a GLOBAL id space shared by every format's
 * display path (xmEffectToString + TrackerGLRenderer + TrackerCanvas2DRenderer).
 * SunTronic's earlier ids (39-51) collided with dub (36-40 → "Z") and OPL
 * (0x30-0x3F → "~F/~C/~M/~V"), and 41-47 fell past the 41-slot glyph array so
 * the grid rendered them as "?00". Relocating every SunTronic custom effect into
 * the otherwise-unused 0x40-0x4F range makes the id globally unique, so the
 * shared renderers can show the right glyph without knowing the song's format.
 *
 * This module has ZERO imports on purpose — it is imported by the renderer
 * workers, so it must stay dependency-free.
 *
 * The PT-style SunTronic effects (pitch up/down=1/2, glide=3, volSlide=10,
 * setVolume=12, finetune=14, speedGlobal=15) deliberately reuse the standard
 * ProTracker letters and are NOT in this block — they already render correctly.
 */

/** SunTronic private control-effect ids (reserved block 0x40..0x4F). */
export const SUN_FX = {
  arpSelect: 0x40, // 64  custom Z arp-table select
  volSlideRate: 0x41, // 65  rate sibling of 0x9a volSlide (not independently encodable)
  restartVolEnv: 0x42, // 66  restart volume envelope
  restartFreqEnv: 0x43, // 67  restart frequency envelope
  masterFade: 0x44, // 68  master volume fade
  masterVol: 0x45, // 69  master volume set
  paulaAttach: 0x46, // 70  Paula channel attach (ADKCON)
  speedVoice: 0x47, // 71  per-voice speed
  tempoSlide: 0x48, // 72  tempo slide
  rowsGlobal: 0x49, // 73  global rows-per-position
  rowsVoice: 0x4a, // 74  per-voice rows-per-position
  prngSeed: 0x4b, // 75  PRNG seed (carried verbatim)
  ciaTempo: 0x4c, // 76  CIA tempo (word)
} as const;

/** Inclusive bounds of the SunTronic private effTyp block. */
export const SUN_FX_MIN = SUN_FX.arpSelect;
export const SUN_FX_MAX = SUN_FX.ciaTempo;

/**
 * Grid glyph (single type char) for each SunTronic private effTyp. The full
 * effect name is carried by the tooltip; the char only needs to be a stable,
 * distinct token. Chars are chosen mnemonically and never conflict, because the
 * id — not the char — is what disambiguates across formats.
 */
export const SUN_EFFECT_GLYPH: Record<number, string> = {
  [SUN_FX.arpSelect]: 'J', // arp
  [SUN_FX.volSlideRate]: 'R', // rate
  [SUN_FX.restartVolEnv]: 'V', // vol env
  [SUN_FX.restartFreqEnv]: 'Q', // freq env
  [SUN_FX.masterFade]: 'G', // global fade
  [SUN_FX.masterVol]: 'M', // master
  [SUN_FX.paulaAttach]: 'U', // attach
  [SUN_FX.speedVoice]: 'S', // speed
  [SUN_FX.tempoSlide]: 'T', // tempo
  [SUN_FX.rowsGlobal]: 'W', // rows global
  [SUN_FX.rowsVoice]: 'N', // rows voice
  [SUN_FX.prngSeed]: 'P', // prng
  [SUN_FX.ciaTempo]: 'O', // cia
};

/** True when `effTyp` is a SunTronic private control effect. */
export function isSunEffect(effTyp: number): boolean {
  return effTyp >= SUN_FX_MIN && effTyp <= SUN_FX_MAX;
}

/**
 * Render a SunTronic private effect as a 3-char grid token (glyph + 2 hex of
 * the low byte), or null when `effTyp` is not in the SunTronic block.
 */
export function sunEffectToString(effTyp: number, eff: number): string | null {
  const glyph = SUN_EFFECT_GLYPH[effTyp];
  if (glyph === undefined) return null;
  const hex = (eff & 0xff).toString(16).toUpperCase().padStart(2, '0');
  return `${glyph}${hex}`;
}

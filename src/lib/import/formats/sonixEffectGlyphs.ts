/**
 * sonixEffectGlyphs.ts — SNX (Sonix Music Driver) private effect id block + glyphs.
 *
 * SINGLE SOURCE OF TRUTH for the effTyp integers SNX's per-cell control opcodes
 * occupy in the tracker grid, and the glyph each shows.
 *
 * `effTyp` is a GLOBAL id space shared by every format's display path
 * (xmEffectToString + TrackerGLRenderer + TrackerCanvas2DRenderer). SNX's three
 * editable control opcodes get a dedicated block `0x60..0x62` that no other
 * format uses (avoids XM 0-35, dub 36-38, OPL 0x30-0x3F, SunTronic 0x40-0x4F,
 * DSP 0x50-0x54), so the shared renderers show the right glyph without knowing
 * the song's format.
 *
 * ZERO imports on purpose — imported by the renderer workers, so dependency-free.
 *
 * SNX opcode ground truth (sonix-wasm/src/sonix/sonix.c snx_process_channel_tick):
 *   0x81nn = channel volume (hw_vol = (cmd81+1)*(vel*2+1)>>8, 0xFF=max)
 *   0x82nn = tempo (nn>0)
 *   0x83nn = detune / pitch-mod (signed i8)
 * Instrument (0x80) and note velocity keep their native note/instrument/volume
 * columns and are NOT in this block.
 */

/** SNX private control-effect ids (reserved block 0x60..0x62). */
export const SNX_FX = {
  chanVol: 0x60, // 96  channel volume   (opcode 0x81)
  tempo: 0x61, //   97  tempo            (opcode 0x82)
  detune: 0x62, //  98  detune/pitch-mod (opcode 0x83, signed)
} as const;

/** Inclusive bounds of the SNX private effTyp block. */
export const SNX_FX_MIN = SNX_FX.chanVol;
export const SNX_FX_MAX = SNX_FX.detune;

/**
 * Grid glyph (single type char) for each SNX private effTyp. The full name is
 * carried by the tooltip; the char only needs to be a stable, distinct token.
 */
export const SNX_EFFECT_GLYPH: Record<number, string> = {
  [SNX_FX.chanVol]: 'V', // channel Volume
  [SNX_FX.tempo]: 'T', //   Tempo
  [SNX_FX.detune]: 'D', //  Detune
};

/** True when `effTyp` is an SNX private control effect. */
export function isSonixEffect(effTyp: number): boolean {
  return effTyp >= SNX_FX_MIN && effTyp <= SNX_FX_MAX;
}

/**
 * Render an SNX private effect as a 3-char grid token (glyph + 2 hex of the low
 * byte), or null when `effTyp` is not in the SNX block. The detune param is a
 * signed byte carried verbatim as its 0x00-0xFF two's-complement form.
 */
export function sonixEffectToString(effTyp: number, eff: number): string | null {
  const glyph = SNX_EFFECT_GLYPH[effTyp];
  if (glyph === undefined) return null;
  const hex = (eff & 0xff).toString(16).toUpperCase().padStart(2, '0');
  return `${glyph}${hex}`;
}

/**
 * jxsEffectGlyphs.ts - JayTrax (.jxs) row scripts as grid effects.
 *
 * A JayTrax pattern row is {note, d, instrument, p, script}. The script byte selects what the row does
 * to the playing instrument's live settings (jxs_engine.cpp script()): 1 pitch bend, 2..13 single settings,
 * 14..57 slot parameters (4 slots x 11 fields, slot = (sc - 14) / 11, field = (sc - 14) % 11), 58..73 wave
 * reset flags, 74 tempo, 75 groove. `d` is the value, `p` the signed bend speed (only the bend reads it).
 *
 * The 8-bit effTyp space is full (every other *EffectGlyphs.ts block, measured), so this block lives at
 * 0x100.. (cells carry effTyp as a plain number; the glyph lookups are Record<number, string>). ZERO imports
 * on purpose - imported by the renderer workers.
 *
 * Cell layout (injective, so an unedited row maps back to its exact bytes):
 *   effTyp / eff   script kind / d
 *   effTyp2 / eff2 JX_FX.aux / selector: p for a single setting (p != 0 only), slot 0..3 for a slot
 *                  field, wave 0..15 for a wave reset, p for a raw script
 *   A script outside the compact kinds (0 with d set, 76..255, or a slot/reset row with p != 0) is "raw":
 *   effTyp = JX_RAW_BASE + script, eff = d, eff2 = p.
 */
export const JX_FX_BASE = 0x100;
/** Single-setting scripts: id = JX_FX_BASE + script. */
export const JX_SINGLE_SCRIPTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 74, 75] as const;
export const JX_SLOT_BASE = JX_FX_BASE + 0x40; // + field 0..10
export const JX_SLOT_FIELDS = 11;
export const JX_WAVE_RESET = JX_FX_BASE + 0x50;
export const JX_AUX = JX_FX_BASE + 0x60;
export const JX_RAW_BASE = JX_FX_BASE + 0x100; // + script 0..255

export const JX_SINGLE_NAMES: Record<number, string> = {
  1: 'pitch bend', 2: 'wave', 3: 'wave length', 4: 'volume', 5: 'volume wave', 6: 'volume speed', 7: 'volume loop',
  8: 'fine tune', 9: 'pitch wave', 10: 'pitch speed', 11: 'pitch loop', 12: 'pitch delay', 13: 'arpeggio',
  74: 'tempo', 75: 'groove',
};
export const JX_SLOT_FIELD_NAMES = [
  'destination', 'source 1', 'source 2', 'oscillator', 'variable 1', 'variable 2', 'speed', 'oscillator speed',
  'oscillator flag', 'type', 'reset',
] as const;

const SINGLE_LETTERS = 'BWLVOSPFHIJDATG'; // one per JX_SINGLE_SCRIPTS entry
const SLOT_LETTERS = 'CEKMNQRUXYZ'; // one per slot field

export const JX_EFFECT_GLYPH: Record<number, string> = {};
JX_SINGLE_SCRIPTS.forEach((sc, i) => { JX_EFFECT_GLYPH[JX_FX_BASE + sc] = SINGLE_LETTERS[i]; });
for (let f = 0; f < JX_SLOT_FIELDS; f++) JX_EFFECT_GLYPH[JX_SLOT_BASE + f] = SLOT_LETTERS[f];
JX_EFFECT_GLYPH[JX_WAVE_RESET] = 'w';
JX_EFFECT_GLYPH[JX_AUX] = 'x';
for (let sc = 0; sc < 256; sc++) JX_EFFECT_GLYPH[JX_RAW_BASE + sc] = '?';

/** A JayTrax effect as a 3-char grid token, or null outside the block. */
export function jxsEffectToString(effTyp: number, eff: number): string | null {
  const glyph = JX_EFFECT_GLYPH[effTyp];
  if (glyph === undefined) return null;
  return `${glyph}${(eff & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

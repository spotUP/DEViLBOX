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
 *   A slot/reset row with p != 0 is "raw": effTyp = JX_RAW_BASE + script, eff = d, eff2 = p.
 *   Script 0 and 76..255 are inert (script() ignores them, d and p included): the cell shows no effect and
 *   applyJxsGridEdits keeps those bytes while the cell stays empty, so files stay byte-exact.
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

/**
 * What each JayTrax row script does, read from script() in jxs-wasm/src/jxs_engine.cpp.
 * The script changes the live settings of the instrument playing on the channel (nothing happens on a
 * channel with no instrument). `d` is the cell value.
 */
export const JX_SINGLE_MEANINGS: Record<number, string> = {
  1: 'Bends the pitch from the current note to the note given as the value; the bend speed is the auxiliary value',
  2: 'Selects the oscillator wave (0 to 15) of the instrument',
  3: 'Sets the wave length: values above 192 give 256 samples, above 96 give 128, above 48 give 64, otherwise 32',
  4: 'Sets the instrument volume',
  5: 'Selects the volume wave (0 to 15; 0 is off)',
  6: 'Sets how fast the volume wave advances',
  7: 'Sets the loop point the volume wave returns to',
  8: 'Sets the fine tune (0 to 15)',
  9: 'Selects the pitch wave (0 to 15; 0 is off)',
  10: 'Sets how fast the pitch wave advances',
  11: 'Sets the loop point the pitch wave returns to',
  12: 'Sets the delay before the pitch wave starts',
  13: 'Selects the arpeggio (0 to 15)',
  74: 'Sets the song tempo in beats per minute (clamped to 10 to 220)',
  75: 'Sets the groove (0 to 3)',
};

/** Meaning of one modulation slot field, same order as JX_SLOT_FIELD_NAMES. */
export const JX_SLOT_FIELD_MEANINGS = [
  'Sets which parameter the slot modulates (0 to 15)',
  'Sets the first modulation source (0 to 15)',
  'Sets the second modulation source (0 to 15)',
  'Sets the slot oscillator (0 to 15)',
  'Sets the first variable of the slot',
  'Sets the second variable of the slot',
  'Sets the slot speed',
  'Sets the oscillator speed of the slot',
  'Sets the oscillator flag of the slot (0 or 1)',
  'Sets the slot type (0 to 17)',
  'Sets the slot reset flag (0 or 1)',
] as const;

/** Describe a JayTrax grid effect, or null outside the block. */
export function jxsDescribe(effTyp: number, eff: number): { name: string; meaning: string; value: string } | null {
  const v = eff & 0xff;
  if (JX_EFFECT_GLYPH[effTyp] === undefined) return null;
  if (effTyp >= JX_RAW_BASE) {
    const sc = effTyp - JX_RAW_BASE;
    return { name: 'Raw Script', meaning: `Row script ${sc} with a non-zero auxiliary value, kept as raw bytes so the file stays byte-exact`, value: `value ${v}` };
  }
  if (effTyp === JX_AUX) return { name: 'Auxiliary Value', meaning: 'Second parameter of the row script: the bend speed, slot number or wave number', value: `value ${v}` };
  if (effTyp === JX_WAVE_RESET) return { name: 'Wave Reset', meaning: 'Sets whether the selected wave restarts on every note (0 or 1); the wave number is the auxiliary value', value: `flag ${Math.min(v, 1)}` };
  if (effTyp >= JX_SLOT_BASE && effTyp < JX_SLOT_BASE + JX_SLOT_FIELDS) {
    const f = effTyp - JX_SLOT_BASE;
    return { name: `Slot ${JX_SLOT_FIELD_NAMES[f]}`, meaning: `${JX_SLOT_FIELD_MEANINGS[f]}; the slot number (0 to 3) is the auxiliary value`, value: `value ${v}` };
  }
  const sc = effTyp - JX_FX_BASE;
  const name = JX_SINGLE_NAMES[sc];
  if (name === undefined) return null;
  const text = name.charAt(0).toUpperCase() + name.slice(1);
  return { name: text, meaning: JX_SINGLE_MEANINGS[sc], value: `value ${v}` };
}

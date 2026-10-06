/**
 * jesperOlsenEffectGlyphs.ts - Jesper Olsen (.jo, drivers L/G) private effect
 * id block + glyphs.
 *
 * SINGLE SOURCE OF TRUTH for the effTyp integers a Jesper Olsen row shows. A
 * row's zero-time commands are set-words: the word is written into the voice
 * record at offset (first byte - $80), so its second byte lands on the odd
 * byte after it (description §6.2-6.3). Field 0 is the instrument column;
 * every other field the songs use has an id here, eff = the byte it sets. A
 * field without its own id is two effects: X (the field) then Y (the byte).
 * `effTyp` is a GLOBAL id space shared by every format's display path
 * (xmEffectToString + TrackerGLRenderer + TrackerCanvas2DRenderer); this block
 * is 0x80..0x8E.
 *
 * ZERO imports on purpose - imported by the renderer workers.
 *
 * Research: thoughts/shared/research/2026-10-06_jesper-olsen-format.md
 */

/** Jesper Olsen private effect ids (reserved block 0x80..0x8E). */
export const JO_FX = {
  /** L: a tied note (row length bit 7): the note changes, nothing restarts. */
  tie: 0x80,
  /** N: a note byte the grid cannot name (period index outside C-0..B-5), eff = the byte. */
  rawNote: 0x81,
  /** R: step repeat count (record byte $07). */
  repeat: 0x82,
  /** O: the programs' note offset (record byte $09). */
  noteOffset: 0x83,
  /** T: transpose (record byte $0B). */
  transpose: 0x84,
  /** S: slide speed (record byte $0D, signed; cleared at every row). */
  slide: 0x85,
  /** P: pitch offset (record byte $0F, signed). */
  pitch: 0x86,
  /** Q: pitch offset 2 (record byte $11, signed). */
  pitch2: 0x87,
  /** V: volume factor 2 (record byte $13). */
  volume2: 0x88,
  /** U: volume factor 1 (record byte $15). */
  volume1: 0x89,
  /** W: voice volume (record byte $17). */
  voiceVolume: 0x8a,
  /** F: flags (record byte $19; bit 0 = ignore the pitch offset). */
  flags: 0x8b,
  /** H: waveform number (record byte $1F). */
  wave: 0x8c,
  /** X: a set-word to a field without its own id, eff = the field (first byte - $80). */
  field: 0x8d,
  /** Y: the byte that set-word sets (always right after its X). */
  value: 0x8e,
} as const;

export const JO_FX_MIN = JO_FX.tie;
export const JO_FX_MAX = JO_FX.value;

/** Record field (set-word first byte - $80) -> its effect id. */
export const JO_FIELD_FX: Readonly<Record<number, number>> = {
  0x06: JO_FX.repeat,
  0x08: JO_FX.noteOffset,
  0x0a: JO_FX.transpose,
  0x0c: JO_FX.slide,
  0x0e: JO_FX.pitch,
  0x10: JO_FX.pitch2,
  0x12: JO_FX.volume2,
  0x14: JO_FX.volume1,
  0x16: JO_FX.voiceVolume,
  0x18: JO_FX.flags,
  0x1e: JO_FX.wave,
};

export const JO_EFFECT_GLYPH: Record<number, string> = {
  [JO_FX.tie]: 'L',
  [JO_FX.rawNote]: 'N',
  [JO_FX.repeat]: 'R',
  [JO_FX.noteOffset]: 'O',
  [JO_FX.transpose]: 'T',
  [JO_FX.slide]: 'S',
  [JO_FX.pitch]: 'P',
  [JO_FX.pitch2]: 'Q',
  [JO_FX.volume2]: 'V',
  [JO_FX.volume1]: 'U',
  [JO_FX.voiceVolume]: 'W',
  [JO_FX.flags]: 'F',
  [JO_FX.wave]: 'H',
  [JO_FX.field]: 'X',
  [JO_FX.value]: 'Y',
};

/** A Jesper Olsen private effect as a 3-char grid token, or null outside the block. */
export function jesperOlsenEffectToString(effTyp: number, eff: number): string | null {
  const glyph = JO_EFFECT_GLYPH[effTyp];
  if (glyph === undefined) return null;
  return `${glyph}${(eff & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

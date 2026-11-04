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

/**
 * What each TW grid effect does, in the order of TW_EFFECT_NAMES / LETTERS. Read from the player
 * (thoughts/spot/2026-11-04_tw-editability.md opcode table, handler addresses in future basketball main.tw)
 * and from twCommandEffect() in tonyWilliamsGrid.ts, which defines what each cell's value is.
 * `value` renders the cell's two hex digits as text.
 */
export interface TwEffectMeaning {
  name: string;
  meaning: string;
  value: (eff: number) => string;
}

const dec = (eff: number): string => String(eff & 0xff);
const hexByte = (eff: number): string => (eff & 0xff).toString(16).toUpperCase().padStart(2, '0');
const signed = (eff: number): string => { const v = eff & 0xff; return String(v > 127 ? v - 256 : v); };

export const TW_EFFECT_MEANINGS: readonly TwEffectMeaning[] = [
  { name: 'Duration', meaning: 'Sets the length of every following note and rest until the next duration command (sticky, stream bytes E0 to FF).',
    value: (e) => `${dec(e)} ticks of 1/50 second` },
  { name: 'Tie', meaning: 'Next note continues without retriggering the sample (sets the no-retrigger flag, stream byte 81).',
    value: () => 'no parameter' },
  { name: 'Volume', meaning: 'Sets the voice volume (stream bytes B0 to BF).',
    value: (e) => `volume ${dec(e)} of 15` },
  { name: 'Envelope', meaning: 'Selects the volume envelope and loads its three nibble parameters (stream bytes C0 to CF, three operand bytes).',
    value: (e) => `envelope ${dec(e)}` },
  { name: 'Envelope Parameters', meaning: 'Sets the volume envelope parameters from a two byte operand (stream byte 84). The cell shows the first operand byte.',
    value: (e) => `first byte ${hexByte(e)}` },
  { name: 'Transpose', meaning: 'Adds a note offset to every following note on this voice (stream byte 87).',
    value: (e) => `${signed(e)} semitones` },
  { name: 'Slide', meaning: 'Sets the pitch slide (portamento) parameters from three operand bytes (stream byte 88). The cell shows the first operand byte.',
    value: (e) => `first byte ${hexByte(e)}` },
  { name: 'Vibrato', meaning: 'Switches vibrato on and sets its five parameter bytes (stream byte 89). The cell shows the first operand byte.',
    value: (e) => `first byte ${hexByte(e)}` },
  { name: 'Vibrato Off', meaning: 'Switches vibrato off (stream byte 8A).',
    value: () => 'no parameter' },
  { name: 'Flag', meaning: 'Changes a voice flag. 8B sets flag bit 1 and loads three parameters; 8C sets flag bit 5 and loads three parameters; 8D clears bit 5; 8E sets bit 4; 8F clears bit 4; 90 clears bit 0.',
    value: (e) => `command ${hexByte(e)}` },
  { name: 'Volume Step', meaning: 'Changes the volume by one step, clamped to 0..15. 91 steps down, 92 steps up.',
    value: (e) => ((e & 0xff) === 0x91 ? 'one step down' : (e & 0xff) === 0x92 ? 'one step up' : `command ${hexByte(e)}`) },
  { name: 'Arpeggio', meaning: 'Selects an arpeggio pattern from the arpeggio table (stream bytes A0 to AF).',
    value: (e) => `table entry ${dec(e)}` },
  { name: 'Rest', meaning: 'Rests for the current duration: clears the voice volume, then reloads the counter (stream bytes 85 and 86; 86 is the variant).',
    value: (e) => `command 8${(e & 0xf).toString(16).toUpperCase()}` },
  { name: 'Fade', meaning: 'Starts the global fade out (sets the song fade word to 3838, stream byte 93).',
    value: () => 'no parameter' },
  { name: 'Stop', meaning: 'Ends the stream. 82 jumps to the loop point stored in the voice list; 83 ends the song; 94 stops the song and switches the DMA off.',
    value: (e) => ((e & 0xff) === 0x82 ? 'jump to loop point' : (e & 0xff) === 0x83 ? 'song end' : (e & 0xff) === 0x94 ? 'stop song, DMA off' : `command ${hexByte(e)}`) },
  { name: 'Loop', meaning: 'Reserved letter for a loop command. The importer shows loop jumps as Stop (command 82), so this never appears in a grid.',
    value: () => 'no parameter' },
];

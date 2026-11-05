/**
 * soundFactoryEffectGlyphs.ts - Sound Factory stream commands as grid effects.
 *
 * SINGLE SOURCE OF TRUTH for the effTyp integers a Sound Factory effect opcode occupies in the tracker
 * grid. None is an XM effect: one effect id per OPERAND BYTE of the opcode, the byte kept verbatim in `eff`
 * and named in the replayer's own terms (third-party/nuade/players/soundfactory/soundfactory.c, the
 * SF_OP_* handlers). `effTyp` is a GLOBAL id space shared by every format's display path (xmEffectToString +
 * TrackerGLRenderer + TrackerCanvas2DRenderer); this block is 0x300..0x322 (JayTrax ends below 0x300).
 * SetVolume and SetTranspose reuse the Ben Daglish "channel volume" / "transpose" ids (benDaglishEffectGlyphs.ts):
 * the same voice-level meaning, one id.
 *
 * ZERO imports on purpose - imported by the renderer workers.
 */

export const SF_FX_BASE = 0x300;

/** Operand names in id order. An opcode's first (enable) byte is named for the opcode itself. */
export const SF_EFFECT_NAMES = [
  'fine tune', 'fade out', 'fade in', 'led', 'one shot', 'looping',
  'attack time', 'decay time', 'sustain level', 'release', 'release time',
  'vibrato', 'vibrato delay', 'vibrato speed', 'vibrato step', 'vibrato amount',
  'arpeggio', 'arpeggio speed',
  'phasing', 'phasing start', 'phasing end', 'phasing speed', 'phasing step',
  'portamento', 'portamento speed', 'portamento step high', 'portamento step low',
  'tremolo', 'tremolo speed', 'tremolo step', 'tremolo range',
  'filter', 'filter frequency', 'filter end', 'filter speed',
] as const;

const N = (name: (typeof SF_EFFECT_NAMES)[number]): number => SF_FX_BASE + SF_EFFECT_NAMES.indexOf(name);

/** Operand ids by name. */
export const SF_FX = {
  fineTune: N('fine tune'), fadeOut: N('fade out'), fadeIn: N('fade in'), led: N('led'),
  oneShot: N('one shot'), looping: N('looping'),
  attackTime: N('attack time'), decayTime: N('decay time'), sustainLevel: N('sustain level'),
  release: N('release'), releaseTime: N('release time'),
  vibrato: N('vibrato'), vibratoDelay: N('vibrato delay'), vibratoSpeed: N('vibrato speed'),
  vibratoStep: N('vibrato step'), vibratoAmount: N('vibrato amount'),
  arpeggio: N('arpeggio'), arpeggioSpeed: N('arpeggio speed'),
  phasing: N('phasing'), phasingStart: N('phasing start'), phasingEnd: N('phasing end'),
  phasingSpeed: N('phasing speed'), phasingStep: N('phasing step'),
  portamento: N('portamento'), portamentoSpeed: N('portamento speed'),
  portamentoStepHigh: N('portamento step high'), portamentoStepLow: N('portamento step low'),
  tremolo: N('tremolo'), tremoloSpeed: N('tremolo speed'), tremoloStep: N('tremolo step'),
  tremoloRange: N('tremolo range'),
  filter: N('filter'), filterFrequency: N('filter frequency'), filterEnd: N('filter end'),
  filterSpeed: N('filter speed'),
} as const;

export const SF_FX_MIN = SF_FX_BASE;
export const SF_FX_MAX = SF_FX_BASE + SF_EFFECT_NAMES.length - 1;

/** One distinct character per operand, in id order. */
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi';

export const SF_EFFECT_GLYPH: Record<number, string> = Object.fromEntries(
  Array.from(SF_EFFECT_NAMES, (_, i) => [SF_FX_BASE + i, LETTERS[i]]),
);

/** A Sound Factory operand as a 3-char grid token, or null outside the block. */
export function soundFactoryEffectToString(effTyp: number, eff: number): string | null {
  const glyph = SF_EFFECT_GLYPH[effTyp];
  if (glyph === undefined) return null;
  return `${glyph}${(eff & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

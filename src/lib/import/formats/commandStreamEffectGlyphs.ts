/**
 * commandStreamEffectGlyphs.ts - Riff Raff and Howie Davies stream commands as grid effects.
 *
 * SINGLE SOURCE OF TRUTH for the effTyp integers these two formats' commands occupy in the tracker grid. None is
 * an XM effect; each keeps its own id and its operand verbatim (low byte), named in the player's terms
 * (third-party/nuade/players/{riffraff,howiedavies}). `effTyp` is a GLOBAL id space shared by every format's
 * display path (xmEffectToString + TrackerGLRenderer + TrackerCanvas2DRenderer); the blocks are 0x510..0x517, 0x520..0x521, 0x530..0x531, 0x540..0x542, 0x550..0x554 and 0x560..0x56F
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

export const HC_FX_BASE = 0x530;
/** Jochen Hippel CoSo note parameter (hippel.c step_voice): the byte after the info byte, read when info bits 5-7 are set. */
export const HC_FX = {
  /** P: portamento rate (info bit 5, the byte feeds hip_portamento_apply). */
  portamento: HC_FX_BASE,
  /** F: frequency sequence number replacing the instrument's own (info bit 6). */
  altSequence: HC_FX_BASE + 1,
} as const;

export const SPL_FX_BASE = 0x540;
/** Sound Programming Language extra note bytes (spl.c step_voice): an instrument record whose flags say so makes a note command carry 1 or 3 more note bytes, each started in the same step. The operand is the stream byte verbatim (octave nibble, semitone nibble). */
export const SPL_FX = {
  /** N: second note byte of the command. */
  extraNote1: SPL_FX_BASE,
  /** N: third note byte of the command. */
  extraNote2: SPL_FX_BASE + 1,
  /** N: fourth note byte of the command. */
  extraNote3: SPL_FX_BASE + 2,
} as const;

export const RK_FX_BASE = 0x550;
/** Ron Klaren track commands that precede a note (NostalgicPlayer RonKlaren): the operand is the stream argument byte verbatim. */
export const RK_FX = {
  /** A: SetArpeggio (0x80), arpeggio number. */
  arpeggio: RK_FX_BASE,
  /** P: SetPortamento (0x81), end note index. */
  portamentoEnd: RK_FX_BASE + 1,
  /** P: SetPortamento (0x81), increment per tick. */
  portamentoIncrement: RK_FX_BASE + 2,
  /** W: SetPortamento (0x81), wait count. */
  portamentoWait: RK_FX_BASE + 3,
  /** S: ChangeAdsrSpeed (0x84), speed. */
  adsrSpeed: RK_FX_BASE + 4,
} as const;

export const ST_FX_BASE = 0x560;
/**
 * Sawteeth part-step effect byte (Step.Eff: "4 bits eff, 4 bits value"): effTyp = ST_FX_BASE + the high nibble (0..15; high nibble 0 with a value still shows, as ST_FX_BASE itself),
 * eff = the low nibble. The glyph is the high nibble's hex digit. The nibble meanings are not in the repo's replayer
 * source (NostalgicPlayer's loader only reads Eff), so they are named by number, not guessed.
 */
export const ST_FX = {
  effect0: ST_FX_BASE, effect1: ST_FX_BASE + 1, effect2: ST_FX_BASE + 2, effect3: ST_FX_BASE + 3, effect4: ST_FX_BASE + 4, effect5: ST_FX_BASE + 5,
  effect6: ST_FX_BASE + 6, effect7: ST_FX_BASE + 7, effect8: ST_FX_BASE + 8, effect9: ST_FX_BASE + 9, effectA: ST_FX_BASE + 10,
  effectB: ST_FX_BASE + 11, effectC: ST_FX_BASE + 12, effectD: ST_FX_BASE + 13, effectE: ST_FX_BASE + 14, effectF: ST_FX_BASE + 15,
} as const;

export const CS_FX_MIN = RR_FX_BASE;
export const CS_FX_MAX = ST_FX.effectF;

export const CS_EFFECT_GLYPH: Record<number, string> = {
  [RR_FX.setVolume]: 'V', [RR_FX.volumeSlide]: 'S', [RR_FX.volumeSlideRate]: 'R', [RR_FX.masterFade]: 'F',
  [RR_FX.masterFadeRate]: 'G', [RR_FX.pitchSlide]: 'P', [RR_FX.pitchSlideLow]: 'Q', [RR_FX.pitchSlideOff]: 'O',
  [HD_FX.speed]: 'S', [HD_FX.maxVolume]: 'V',
  [HC_FX.portamento]: 'P', [HC_FX.altSequence]: 'F',
  [RK_FX.arpeggio]: 'A', [RK_FX.portamentoEnd]: 'P', [RK_FX.portamentoIncrement]: 'P', [RK_FX.portamentoWait]: 'W', [RK_FX.adsrSpeed]: 'S',
  ...Object.fromEntries(Object.values(ST_FX).map((id) => [id, (id - ST_FX_BASE).toString(16).toUpperCase()])),
  [SPL_FX.extraNote1]: 'N', [SPL_FX.extraNote2]: 'N', [SPL_FX.extraNote3]: 'N',
};

/** A command of these formats as a 3-char grid token, or null outside the blocks. */
export function commandStreamEffectToString(effTyp: number, eff: number): string | null {
  const glyph = CS_EFFECT_GLYPH[effTyp];
  if (glyph === undefined) return null;
  return `${glyph}${(eff & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

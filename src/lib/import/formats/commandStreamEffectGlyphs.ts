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
/** Jochen Hippel CoSo note parameter (hippel.c step_voice; MCMD uses the same two, mcmd.c INFO_PORTAMENTO / INFO_ALT_FSEQ, shown with these ids): the byte after the info byte, read when info bits 5-7 are set. */
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

export const HS_FX_BASE = 0x570;
/** Jochen Hippel ST (.hst/.sog/.soc) note event: info bit $20 sets a portamento; the event's extra byte is the speed per tick (Hippel ST replayer, lbC000854). */
export const HS_FX = {
  /** P: portamento, speed per tick (the extra byte of a note whose info has $20). */
  portamento: HS_FX_BASE,
} as const;

export const PR_FX_BASE = 0x580;
/**
 * Paul Robotham voice-stream commands (0x80..0xff, jump-table index = byte & 0x1f; docs in the header of paulRobothamGrid.ts):
 * effTyp = PR_FX_BASE + the command index, eff = its first operand byte (0 for a command without operand). The instrument
 * command (15) is the instrument column, so it has no id. Command 22 has two operands: the second is `fadeSecond`.
 * Command 21, 23, 24, 25 and 26 are named by number: the repo has no description of what they do.
 */
export const PR_FX = {
  /** Command 1: push loop count. */
  loopCount: PR_FX_BASE + 1,
  /** Command 2: loop end (no operand). */
  loopEnd: PR_FX_BASE + 2,
  /** Command 7: vibrato. */
  vibrato: PR_FX_BASE + 7,
  /** Command 8: vibrato speed. */
  vibratoSpeed: PR_FX_BASE + 8,
  /** Command 9: slide. */
  slide: PR_FX_BASE + 9,
  /** Command 11: volume envelope. */
  volumeEnvelope: PR_FX_BASE + 11,
  /** Command 12: pitch envelope. */
  pitchEnvelope: PR_FX_BASE + 12,
  /** Command 13: volume. */
  volume: PR_FX_BASE + 13,
  /** Command 14: tempo (multiplier = operand << 4). */
  tempo: PR_FX_BASE + 14,
  /** Command 19: flags. */
  flags: PR_FX_BASE + 19,
  /** Command 20: mode. */
  mode: PR_FX_BASE + 20,
  /** Command 21 (operand meaning not documented). */
  command21: PR_FX_BASE + 21,
  /** Command 22: fade, first operand. */
  fade: PR_FX_BASE + 22,
  /** Command 23 (no operand, meaning not documented). */
  command23: PR_FX_BASE + 23,
  /** Command 24 (operand meaning not documented). */
  command24: PR_FX_BASE + 24,
  /** Command 25 (no operand, meaning not documented). */
  command25: PR_FX_BASE + 25,
  /** Command 26 (no operand, meaning not documented). */
  command26: PR_FX_BASE + 26,
  /** Command 22: fade, second operand. */
  fadeSecond: PR_FX_BASE + 27,
} as const;

export const CS_FX_MIN = RR_FX_BASE;
export const CS_FX_MAX = PR_FX.fadeSecond;

export const CS_EFFECT_GLYPH: Record<number, string> = {
  [RR_FX.setVolume]: 'V', [RR_FX.volumeSlide]: 'S', [RR_FX.volumeSlideRate]: 'R', [RR_FX.masterFade]: 'F',
  [RR_FX.masterFadeRate]: 'G', [RR_FX.pitchSlide]: 'P', [RR_FX.pitchSlideLow]: 'Q', [RR_FX.pitchSlideOff]: 'O',
  [HD_FX.speed]: 'S', [HD_FX.maxVolume]: 'V',
  [HC_FX.portamento]: 'P', [HC_FX.altSequence]: 'F',
  [RK_FX.arpeggio]: 'A', [RK_FX.portamentoEnd]: 'P', [RK_FX.portamentoIncrement]: 'P', [RK_FX.portamentoWait]: 'W', [RK_FX.adsrSpeed]: 'S',
  ...Object.fromEntries(Object.values(ST_FX).map((id) => [id, (id - ST_FX_BASE).toString(16).toUpperCase()])),
  [HS_FX.portamento]: 'P',
  [PR_FX.loopCount]: 'L', [PR_FX.loopEnd]: 'E', [PR_FX.vibrato]: 'H', [PR_FX.vibratoSpeed]: 'I', [PR_FX.slide]: 'P',
  [PR_FX.volumeEnvelope]: 'Y', [PR_FX.pitchEnvelope]: 'Z', [PR_FX.volume]: 'V', [PR_FX.tempo]: 'T', [PR_FX.flags]: 'F',
  [PR_FX.mode]: 'M', [PR_FX.command21]: 'X', [PR_FX.fade]: 'D', [PR_FX.fadeSecond]: 'G', [PR_FX.command23]: 'U',
  [PR_FX.command24]: 'K', [PR_FX.command25]: 'J', [PR_FX.command26]: 'N',
  [SPL_FX.extraNote1]: 'N', [SPL_FX.extraNote2]: 'N', [SPL_FX.extraNote3]: 'N',
};

/** A command of these formats as a 3-char grid token, or null outside the blocks. */
export function commandStreamEffectToString(effTyp: number, eff: number): string | null {
  const glyph = CS_EFFECT_GLYPH[effTyp];
  if (glyph === undefined) return null;
  return `${glyph}${(eff & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

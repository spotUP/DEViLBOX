/**
 * Sound Factory (.psf) pitch: the period the replayer plays for a note opcode,
 * the grid note that names what that period SOUNDS like, and the inverse.
 *
 * The period is not a function of the opcode alone. The replayer
 * (soundfactory-wasm/src/soundfactory.c sf_calc_period, same as
 * NostalgicPlayer SoundFactory.cs) takes note = (opcode + transpose) & 127,
 * octave = note / 12, k = note % 12 and then:
 *   - sampling period != 0: floor(sp * MUL[k] / 32768), halved per octave
 *     above the instrument's own octave (header byte +25), doubled per octave
 *     below it;
 *   - sampling period == 0: 2 * (TAB[k] * waveCount / sampleLength >> octave).
 *
 * Owner decision 2026-11-04 (thoughts/spot/2026-11-04-octave-audit.md,
 * "Sound Factory decision"): the grid names the AUDIBLE pitch. Sound Factory
 * instruments are short looped waves (8-64 bytes in goldrunner.psf), so a
 * looped buffer of L bytes played at period P sounds at
 * AMIGA_PAL_FREQUENCY / (P * L) Hz, several octaves above what ProTracker
 * naming of P alone says (that naming assumes a recorded sample). The grid
 * note is therefore periodToPitch(P) plus the instrument's audible shift: the
 * semitones between the periodNotes naming of a period and the pitch a loop of
 * this length sounds at that period (measured through xmNoteToMidi /
 * freqToMidi, no hand-written base). A one-shot or empty instrument has no
 * cycle, so its shift is 0 (plain periodNotes naming).
 *
 * The product plays a period-mode Sampler at periodMultiplier / noteToPeriod(N)
 * bytes per second, so the importer gives each instrument
 * periodMultiplier = AMIGA_PAL_FREQUENCY * 2^(-shift / 12): grid note N then
 * plays the replayer's own byte rate (soundFactoryPeriodMultiplier).
 */
import { noteToPeriod, periodToPitch, PT_FIRST_NOTE } from '@/lib/amiga/periodNotes';
import { xmNoteToMidi } from '@/lib/xmConversions';
import { freqToMidi } from '@/engine/mame/MAMEPitchUtils';
import { AMIGA_PAL_FREQUENCY } from '@/engine/replayer/PeriodTables';

/** The instrument header fields the replayer's period math reads. */
export interface SoundFactoryPitchParams {
  /** Header +2 (0 = multi-octave table mode). */
  samplingPeriod: number;
  /** Header +25: the octave at which the sampling period plays unchanged. */
  octave: number;
  /** Header +24. */
  waveCount: number;
  /** Header +0, in words. */
  sampleLength: number;
  /** The sample loops as a whole (effect byte bit 0 clear) and has data. */
  looped: boolean;
}

/** soundfactory.c's sf_default_instrument_template: what plays before any instrument is selected. */
export const SOUND_FACTORY_EMPTY_INSTRUMENT: SoundFactoryPitchParams = {
  samplingPeriod: 0, octave: 0, waveCount: 1, sampleLength: 1, looped: false,
};

// soundfactory.c:260 sf_multiply_table and :266 sf_sample_table.
const MULTIPLY_TABLE = [32768, 30929, 29193, 27555, 26008, 24549, 23171, 21870, 20643, 19484, 18391, 17359];
const SAMPLE_TABLE = [54728, 51656, 48757, 46020, 43437, 40999, 38698, 36526, 34476, 32541, 30715, 28964];

/** The period the replayer writes for a note (already opcode + transpose). Port of sf_calc_period. */
export function soundFactoryPeriod(p: SoundFactoryPitchParams, voiceNote: number): number {
  const note = voiceNote & 127;
  const octave = Math.floor(note / 12);
  const k = note % 12;
  if (p.samplingPeriod !== 0) {
    let period = Math.floor((p.samplingPeriod * MULTIPLY_TABLE[k]) / 32768);
    let cur = p.octave;
    while (cur !== octave) {
      if (cur < octave) { period = Math.floor(period / 2); cur++; }
      else { period *= 2; cur--; }
    }
    return period & 0xFFFF;
  }
  let period = SAMPLE_TABLE[k];
  if (p.waveCount !== 1) period *= p.waveCount;
  if (p.sampleLength !== 1 && p.sampleLength !== 0) period = Math.floor(period / p.sampleLength);
  period = period >>> octave;
  return (period * 2) & 0xFFFF;
}

/** Semitones between the periodNotes naming of a period and what a loop of this instrument sounds at it. */
export function soundFactoryAudibleShift(p: SoundFactoryPitchParams): number {
  const loopBytes = p.sampleLength * 2;
  if (!p.looped || loopBytes <= 0) return 0;
  const named = xmNoteToMidi(PT_FIRST_NOTE) ?? 0;
  const heard = freqToMidi(AMIGA_PAL_FREQUENCY / (noteToPeriod(PT_FIRST_NOTE) * loopBytes));
  return Math.round(heard - named);
}

/** The periodMultiplier that makes grid note N (shifted naming) play the replayer's byte rate. */
export function soundFactoryPeriodMultiplier(p: SoundFactoryPitchParams): number {
  return AMIGA_PAL_FREQUENCY * 2 ** (-soundFactoryAudibleShift(p) / 12);
}

/** Grid note (1..96) for a voice note; 0 when the replayer's period is 0. */
export function soundFactoryGridNote(p: SoundFactoryPitchParams, voiceNote: number): number {
  const period = soundFactoryPeriod(p, voiceNote);
  if (period <= 0) return 0;
  const n = periodToPitch(period) + soundFactoryAudibleShift(p);
  return Math.max(1, Math.min(96, n));
}

/**
 * The note opcode (0..127) that plays grid note `gridNote` on this instrument
 * under `transpose`: the inverse of soundFactoryGridNote. Several opcodes can
 * name one note when the period table saturates; the lowest wins. -1 when no
 * opcode reaches the note.
 */
export function soundFactoryOpcodeFor(p: SoundFactoryPitchParams, gridNote: number, transpose = 0): number {
  for (let op = 0; op < 128; op++) {
    if (soundFactoryGridNote(p, op + transpose) === gridNote) return op;
  }
  return -1;
}

/**
 * How the BASS control drives the master insert's low-band weight stage.
 *
 * The shelf and the punch are linear: every dB of heaviness they give is a dB
 * of level, and at the top of the control that level ran into the safety
 * clipper and the master limiter, which took it back — reported 2026-09-22 as
 * "at 90% it sounds heavier than at 100%". Dub weight is harmonics as much as
 * level: a saturated low band reads as heavy on any speaker, small ones
 * included, without needing the level.
 *
 * So the same control also drives a parallel band — low-passed at the shelf
 * corner, driven into the tape curve, compressed, added back under the dry
 * path. `drive` is the gain INTO the fixed curve; `gain` is how much of the
 * result is added. Both rise with the control, so the top of the travel is
 * where the harmonics are densest and the band is loudest.
 *
 * Pure. A dB in, two gains out.
 */

export interface LowBandWeight {
  /** Gain into the saturator, linear. 1 is clean. */
  drive: number;
  /** Level of the saturated band added under the dry path, linear. */
  gain: number;
}

/**
 * Drive at the top of the control, into tanh(4x). 6 was a square wave: on a
 * sine-heavy AHX bass the band read 0.102 RMS against 0.114 for the whole
 * shelved dry path, and that is fuzz, not weight — "clips/dists"
 * (2026-09-22). 3 keeps the 2nd and 3rd harmonics and loses the buzz.
 */
export const LOW_BAND_MAX_DRIVE = 3;
/**
 * Band level at the top of the control. The curve is normalised to ±1, so this
 * bounds what the band can add to a peak. Weight sits UNDER the dry low end,
 * about 8 dB below it at the top; it is felt, not heard as a second bass.
 */
export const LOW_BAND_MAX_GAIN = 0.15;
/** The BASS control's boost range; the band only answers to boosts. */
const BASS_RANGE_DB = 12;

/**
 * Low-mid dip that rides with the BASS control, in dB at the top of the
 * control. A low shelf's transition band runs about an octave above its
 * corner, and the weight band's 2nd and 3rd harmonics land in the same
 * place: at 150 Hz that is 200-400 Hz, the low mids — "still pretty muddy"
 * (2026-09-22, BASS +12 with AutoDub). A dub desk lifts the bass and cuts
 * the low mids together; that is what "heavy but clean" is.
 */
export const LOW_MID_DIP_MAX_DB = -3;   // -4.5 hollowed the mids under a full boost ("kills all other audio")

/** dB of low-mid cut for a BASS setting. Zero at or below rest. */
export function lowMidDipDbFor(bassShelfGainDb: number): number {
  const db = Number.isFinite(bassShelfGainDb) ? bassShelfGainDb : 0;
  const t = Math.max(0, Math.min(BASS_RANGE_DB, db)) / BASS_RANGE_DB;
  return t > 0 ? LOW_MID_DIP_MAX_DB * t : 0;
}

export function lowBandWeightFor(bassShelfGainDb: number): LowBandWeight {
  const db = Number.isFinite(bassShelfGainDb) ? bassShelfGainDb : 0;
  const t = Math.max(0, Math.min(BASS_RANGE_DB, db)) / BASS_RANGE_DB;
  return {
    drive: 1 + (LOW_BAND_MAX_DRIVE - 1) * t,
    gain: LOW_BAND_MAX_GAIN * t,
  };
}

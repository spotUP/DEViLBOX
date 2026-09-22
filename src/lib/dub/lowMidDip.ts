/**
 * Low-mid dip that rides with the BASS control.
 *
 * A low band lifted at 150 Hz spills into the octave above it: the shelf's
 * transition band, and the saturator's 2nd and 3rd harmonics, both land at
 * 200-400 Hz, the low mids — "still pretty muddy" (2026-09-22, BASS +12 with
 * AutoDub). A dub desk lifts the bass and cuts the low mids together; that is
 * what "heavy but clean" is. -4.5 dB hollowed the mids under a full boost
 * ("the bass kills all other audio"); -3 is the depth at the top.
 *
 * Pure. A dB in, a dB out.
 */

export const LOW_MID_DIP_MAX_DB = -3;
const BASS_RANGE_DB = 12;

/** dB of low-mid cut for a BASS setting. Zero at or below rest. */
export function lowMidDipDbFor(bassShelfGainDb: number): number {
  const db = Number.isFinite(bassShelfGainDb) ? bassShelfGainDb : 0;
  const t = Math.max(0, Math.min(BASS_RANGE_DB, db)) / BASS_RANGE_DB;
  return t > 0 ? LOW_MID_DIP_MAX_DB * t : 0;
}

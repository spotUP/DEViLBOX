/**
 * Keeps the dub RETURN under the music.
 *
 * The wet chain has gain of its own: a feedback echo at 0.79 settles at
 * 1 / (1 - 0.79), the spring and the phaser add on top, and the return sits
 * at unity after that. Measured 2026-09-22 with AutoDub on amanda.ahx: send
 * input 0.028 RMS, return 0.261 — about +19 dB through the bus — and with
 * every channel sent at 0.15 the echo came back louder than the song. With
 * the BASS control up the sum clipped: "clips/dists". Reported before that as
 * "the volume of the dub bus effects seem to hit different on different
 * songs, sometimes very loud sometimes low".
 *
 * A fixed return gain cannot be right for every tune. The return is instead
 * referenced to the programme, the way generated sounds already are: it may
 * be as loud as the music and no louder. The reference is the SMOOTHED
 * programme level, which decays over seconds, so an echo tail ringing through
 * a one-bar rest is measured against the music that just played, not against
 * the silence — the tail in the gap is the point of dub. The movement itself
 * is `stepRider`: settle, hold, creep.
 *
 * Pure. State, two levels and a validity flag in, next state out.
 */

import { stepRider, type RiderConfig, type RiderState } from './gainRider';

/** Loudest the return may be, relative to the programme's RMS. 1 is unity. */
export const MAX_WET_TO_PROGRAMME = 1.0;

/** Same pace as the trim ride; deeper, because the bus can run +20 dB. */
export const RETURN_GOVERNOR: RiderConfig = { attackFraction: 0.5, holdTicks: 8, releaseDb: 0.15, maxDb: 18 };

/**
 * How fast a held gesture lets the governor go, dB per tick.
 *
 * The idle release is 0.15 dB a tick — a creep the ear must not read as
 * movement, and from the -18 dB floor that is thirty seconds. A performer
 * pressing a toggle is not asking for a creep: 2.25 dB a tick brings the
 * floor to -0 in two seconds, which is the pace of a hand on a fader.
 */
export const GESTURE_RELEASE_DB = 2.25;

/**
 * @param gestureHeld a performer is deliberately driving the wet path. The
 *   governor then RELEASES, at gesture pace, and never tightens: the press is
 *   the performer overriding the safety. 0c158b836 only stopped it tightening,
 *   and did nothing about a clamp earned before the press — with four sends
 *   at 0.96 through a 0.79-feedback echo the governor sat at its -18 dB floor
 *   and every toggle landed on a return held at 12 % (2026-09-23,
 *   "completely dead", faders at max). Runaway protection is untouched:
 *   the tick after the hand comes off governs as before.
 */
export function governReturn(
  state: RiderState,
  returnRms: number,
  programmeRms: number,
  programmeValid: boolean,
  gestureHeld = false,
): RiderState {
  if (gestureHeld) {
    const prev = Number.isFinite(state.db) ? Math.min(0, Math.max(-RETURN_GOVERNOR.maxDb, state.db)) : 0;
    return { db: Math.min(0, prev + GESTURE_RELEASE_DB), hold: 0 };
  }
  if (!programmeValid || !Number.isFinite(programmeRms) || programmeRms <= 0
    || !Number.isFinite(returnRms) || returnRms <= 0) {
    return stepRider(state, -Infinity, RETURN_GOVERNOR);
  }
  // The return is metered before the governor's own gain, so the depth
  // already applied is taken off before comparing.
  const governed = returnRms * Math.pow(10, Math.min(0, state.db) / 20);
  const overDb = 20 * Math.log10(governed / (programmeRms * MAX_WET_TO_PROGRAMME));
  return stepRider(state, overDb, RETURN_GOVERNOR);
}

/** RMS of a time-domain buffer. */
export function bufferRms(buffer: Float32Array): number {
  if (buffer.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}

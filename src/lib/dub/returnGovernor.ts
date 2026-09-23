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

/**
 * Loudest the return may be, relative to the programme's RMS. 4 is +12 dB.
 *
 * It was 1 — unity, "as loud as the music and no louder". That was written
 * for "clips/dists" (2026-09-22): send 0.028 RMS, return 0.261, +19 dB, the
 * echo louder than the song, and the sum into the clipper. The same day fixed
 * that where it lives: the trim ride holds the clipper input to
 * `CLIP_TARGET_PEAK` and the low band has its own ceiling. Measured
 * 2026-09-23 with four sends at 0.96, `afterClip` sat at 0.18 against a 0.9
 * knee. Nothing was clipping.
 *
 * What unity DID do was treat the wet chain's designed gain as an overshoot.
 * A feedback echo at 0.79 settles near 1 / (1 - 0.79), the spring and plate
 * add on top, and the return runs +10 to +11 dB over the programme at any
 * send from 0.4 up. So the governor lived at its floor at every real send
 * level — -11 dB at 0.15, -14 dB at 0.96 — and every return toggle was
 * pressed into a return held at 12 %: "completely dead", faders at max.
 *
 * Dub wet is supposed to run hot. The clipper is fenced elsewhere. This
 * governor keeps one job, a true runaway: 4x, +12 dB, is the top of the
 * chain's own gain as measured, so it holds nothing the settings asked for
 * and still catches the +19 dB case by 7 dB.
 */
export const MAX_WET_TO_PROGRAMME = 4.0;

/** Same pace as the trim ride; deeper, because the bus can run +20 dB. */
export const RETURN_GOVERNOR: RiderConfig = { attackFraction: 0.5, holdTicks: 8, releaseDb: 0.15, maxDb: 18 };

/**
 * @param gestureHeld a performer is deliberately driving the wet path. The
 *   governor may then LOOSEN but never tighten, and it loosens at the idle
 *   creep — no faster. The first cut released at 2.25 dB a tick, thirteen dB
 *   in two seconds and re-clamped in one on release, which was heard as the
 *   move itself: "they all sound the same", "very reverb washed", "stutters
 *   when i activate/deactivate" (2026-09-23). A gesture does not uncork the
 *   wash; it only stops the governor fighting the move. With the headroom
 *   above right the governor is at 0 at every real send level anyway, so
 *   this branch matters only while a genuine runaway is being held down.
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
    return { db: Math.min(0, prev + RETURN_GOVERNOR.releaseDb), hold: 0 };
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

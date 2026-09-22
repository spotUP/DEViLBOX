/**
 * Fader ride for the master insert's trim.
 *
 * The predictive trim (`shelfTrimDb`) pays for the low-end boost from an
 * estimate: shelf gain times the share of energy that lives down there. On a
 * tune whose energy is nearly all under the corner the estimate is short, the
 * return adds on top of it, and the safety clipper takes the difference.
 * Measured 2026-09-22 with AutoDub at BASS +12: master peak 0.95 at 0.56 RMS
 * on loud bars — a 5 dB crest factor, where the programme alone runs 9 —
 * "clips/dists".
 *
 * So the estimate is corrected by a measurement: the peak at the clipper's
 * input over the whole tick, against a target one dB under the clipper's
 * knee. The ride itself is `stepRider` — settle, hold, creep — because the
 * first cut, which attacked in full and released fast, "sounds very
 * artificially sidechained".
 *
 * Pure. State and a peak in, next state out.
 */

import { stepRider, type RiderConfig, type RiderState } from './gainRider';

/**
 * Peak the clipper input is held to — just under the clipper's 0.9 knee.
 * It was 0.8, a dB of margin the low band's own ceiling now provides: with
 * the saturator bounding the low band, a 0.8 target made the ride spend the
 * lift on ordinary coincident hits (measured +2.5 of 12 dB, 2026-09-22).
 */
export const CLIP_TARGET_PEAK = 0.88;

/** Ticks are `TRIM_WATCH_MS` (250 ms) apart: settles in about a second, holds two, creeps at 0.6 dB/s. */
export const TRIM_RIDE: RiderConfig = { attackFraction: 0.5, holdTicks: 8, releaseDb: 0.15, maxDb: 12 };

/**
 * `peakRef` is the same clipper input WITHOUT the boost — the dry path before
 * the shelf plus the return. The ride answers only for what the boost adds:
 * its target is the larger of the clip target and that reference. Without
 * this, a programme whose own hits plus the echo already crossed the target
 * kept the ride pinned at its maximum with the shelf flat, and the BASS
 * control did nothing at all (measured 2026-09-22: trimRideDb -12,
 * masterBassShelfDb 0, with AutoDub). A tune that is hot on its own is the
 * master limiter's business, not the bass control's.
 */
export function rideTrim(state: RiderState, peakIn: number, peakRef = 0): RiderState {
  const ref = Number.isFinite(peakRef) && peakRef > 0 ? Math.max(CLIP_TARGET_PEAK, peakRef) : CLIP_TARGET_PEAK;
  const overDb = Number.isFinite(peakIn) && peakIn > 0
    ? 20 * Math.log10(peakIn / ref)
    : -Infinity;
  return stepRider(state, overDb, TRIM_RIDE);
}

/**
 * Where the ride's depth is spent.
 *
 * Spent on the trim alone, the ride pulled the WHOLE mix down while the shelf
 * kept adding: at BASS +12 on a loud tune that was about -6 dB on the mids
 * and highs against +6 on the lows, twelve dB of tilt — "the bass kills all
 * other audio" (2026-09-22, AutoDub). The overshoot the ride is correcting
 * IS the boost, so the boost pays first: the shelf gives up dB until it is
 * flat, and only a ride deeper than the boost reaches the trim. The bass gets
 * as heavy as fits; everything else stays where it was. A cut has no boost
 * to give, so it is trimmed as before.
 */
export interface SpentRide {
  bassDb: number;
  punchDb: number;
  trimDb: number;
}

/**
 * PUNCH is spent before BASS, the same order the ceiling uses: the control
 * the user rides keeps its value longest, the voicing gives way first. The
 * punch has to be in here at all because it takes its headroom from the
 * requested bass: with the shelf ridden flat it grew straight back to its
 * full value, a boost the ride never spent and the unboosted reference does
 * not contain, so the ride sat at its maximum with the shelf flat
 * (measured 2026-09-22: trimRideDb -12, masterBassShelfDb 0, punch 6).
 */
export function spendRide(bassDb: number, punchDb: number, rideDb: number): SpentRide {
  const bass = Number.isFinite(bassDb) ? bassDb : 0;
  const punch = Number.isFinite(punchDb) ? punchDb : 0;
  let remaining = Number.isFinite(rideDb) ? Math.min(0, rideDb) : 0;
  let punchOut = punch;
  if (punch > 0) {
    const spent = Math.max(-punch, remaining);
    punchOut = punch + spent;
    remaining -= spent;
  }
  let bassOut = bass;
  if (bass > 0) {
    const spent = Math.max(-bass, remaining);
    bassOut = bass + spent;
    remaining -= spent;
  }
  return { bassDb: bassOut, punchDb: punchOut, trimDb: remaining };
}

/** Largest absolute sample in a time-domain buffer. */
export function bufferPeak(buffer: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < buffer.length; i++) {
    const a = Math.abs(buffer[i]);
    if (a > peak) peak = a;
  }
  return peak;
}

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

/** Peak the clipper input is held to. The clipper's knee is at 0.9; this is 1 dB under it. */
export const CLIP_TARGET_PEAK = 0.8;

/** Ticks are `TRIM_WATCH_MS` (250 ms) apart: settles in about a second, holds two, creeps at 0.6 dB/s. */
export const TRIM_RIDE: RiderConfig = { attackFraction: 0.5, holdTicks: 8, releaseDb: 0.15, maxDb: 12 };

export function rideTrim(state: RiderState, peakIn: number): RiderState {
  const overDb = Number.isFinite(peakIn) && peakIn > 0
    ? 20 * Math.log10(peakIn / CLIP_TARGET_PEAK)
    : -Infinity;
  return stepRider(state, overDb, TRIM_RIDE);
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

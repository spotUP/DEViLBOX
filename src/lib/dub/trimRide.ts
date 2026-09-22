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
 * So the estimate is corrected by a measurement. Each tick the peak at the
 * clipper's input is read over the whole interval; if it is over the target
 * the ride drops by exactly the overshoot, otherwise it releases a little
 * toward zero. What a mastering engineer does by hand: attack on the bar
 * that clips, release slowly after it. Dynamics inside a bar are untouched,
 * and no lookahead stage is added to the master path, so no latency.
 *
 * Pure. Previous ride and a peak in, next ride out.
 */

/** Peak the clipper input is held to. The clipper's knee is at 0.9; this is 1 dB under it. */
export const CLIP_TARGET_PEAK = 0.8;
/** Deepest the ride can go, dB. */
export const RIDE_MAX_DB = 12;
/** Release per tick, dB. Ticks are `TRIM_WATCH_MS` apart in DubBus. */
export const RIDE_RELEASE_DB = 0.5;

export function rideTrimDb(previousRideDb: number, peakIn: number): number {
  const prev = Number.isFinite(previousRideDb) ? Math.min(0, Math.max(-RIDE_MAX_DB, previousRideDb)) : 0;
  if (!Number.isFinite(peakIn) || peakIn <= 0) return Math.min(0, prev + RIDE_RELEASE_DB);
  const overDb = 20 * Math.log10(peakIn / CLIP_TARGET_PEAK);
  if (overDb > 0) return Math.max(-RIDE_MAX_DB, prev - overDb);
  return Math.min(0, prev + RIDE_RELEASE_DB);
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

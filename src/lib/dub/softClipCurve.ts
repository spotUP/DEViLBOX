/**
 * Soft-clip curves for WaveShaperNode.
 *
 * A SAFETY clipper and a SATURATION stage are different devices, and the
 * distinction is the whole point of this file: a safety clipper must be
 * inaudible until the signal actually threatens to overflow, while a
 * saturator is supposed to colour everything it touches.
 *
 * The master insert's clipper was built as `tanh(1.2x) / tanh(1.2)` and
 * documented as "effectively linear up to ±0.9". It is not: that curve has a
 * gain of 1.43 at x = 0.1, 1.29 at x = 0.5 and 1.0 only at full scale, so it
 * applied about +3 dB of makeup to quiet signal and progressive compression
 * toward the ceiling — third-harmonic distortion across the whole mix,
 * whenever the dub bus was enabled, plus a level push into the safety limiter.
 * Reported 2026-09-18 as "the dub bus clipping and disting most of the time".
 */

/**
 * Transparent below `threshold`, soft-knee above it, asymptotic to ±1.
 *
 *   |x| <= T   →  y = x                     (bit-exact passthrough)
 *   |x| >  T   →  y = T + (1-T)·tanh((|x|-T)/(1-T))
 *
 * The knee is slope-continuous at T (d/du tanh(u) = 1 at u = 0), so there is
 * no corner to ring on, and the curve never exceeds 1.0 no matter how hot the
 * input — which is what the downstream worklets need.
 *
 * @param samples curve resolution; the WaveShaper interpolates between points,
 *   so this also sets how exact the passthrough region is.
 * @param threshold where saturation starts, 0 < T < 1.
 */
export function makeSoftClipCurve(samples = 8192, threshold = 0.9): Float32Array<ArrayBuffer> {
  const t = Math.max(0.05, Math.min(0.99, threshold));
  const span = 1 - t;
  const curve = new Float32Array(new ArrayBuffer(samples * 4));
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;   // -1 .. 1
    const a = Math.abs(x);
    const y = a <= t ? a : t + span * Math.tanh((a - t) / span);
    curve[i] = x < 0 ? -y : y;
  }
  return curve;
}

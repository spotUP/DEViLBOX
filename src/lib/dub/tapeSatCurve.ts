/**
 * Asymmetric tanh curve for WaveShaper — models transformer-coupled magnetic
 * tape saturation. Positive half compresses a touch harder than the negative
 * half; that asymmetry is the audible signature of tape vs. digital clipping.
 *
 * Unity for small signals: tanh(k·x)/k has slope 1 at zero on both halves,
 * so the stage colours and rounds the peaks without raising the level. It
 * used to be tanh(k·x)/tanh(k) - full scale mapped to 1, which made the
 * small-signal gain k/tanh(k): +4 dB at the tape stage's drive, +1.6 dB at
 * the input clip, +9 dB in "tape 15 ips" - a large share of the echo return
 * running 11.5 dB over its input ("drowning everything", 2026-09-30).
 */
export function makeTapeSatCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 4096;
  // Construct with an explicit ArrayBuffer (not ArrayBufferLike) so the
  // resulting typed array matches what WaveShaperNode.curve expects under
  // TS strict lib types.
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const kPos = Math.max(1e-3, drive * 4);
  const kNeg = Math.max(1e-3, drive * 4.4);  // +10% on negative half — asymmetric
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = x >= 0
      ? Math.tanh(x * kPos) / kPos
      : Math.tanh(x * kNeg) / kNeg;
  }
  return curve;
}

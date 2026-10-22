/**
 * Symmetric unity-slope saturation curve for a WaveShaper: tanh(k·x)/k.
 *
 * Slope 1 at zero, so the stage rounds peaks without raising or lowering the
 * level of a small signal, and without touching the shape of a note's onset.
 * The ceiling is 1/k: a harder drive (bigger k) clips earlier and lower.
 *
 * Why not Tone.Distortion: its curve is (3+k)·x·20·(π/180)/(π+k·|x|) with
 * k = amount·100, a small-signal gain of (3+k)/9 (3.7× at amount 0.3, 4.8× at
 * 0.4, 0.33× at 0) under a ceiling of ≈0.35. A 5 ms amplitude attack through
 * one of those stages reaches the ceiling within ~1 ms and reads as a thump;
 * two in a row are a near step. Its default `oversample: '2x'` also adds
 * ~128 samples (2.6 ms at 48 kHz) of FIR latency per stage, so a synth built
 * on it starts late relative to the sample channels it plays beside
 * (WobbleBass in a hybrid song, 2026-10-22).
 *
 * The asymmetric sibling for tape emulation is `src/lib/dub/tapeSatCurve.ts`.
 */
export function makeSaturationCurve(k: number, n = 4096): Float32Array<ArrayBuffer> {
  const kk = Math.max(1e-3, k);
  // Explicit ArrayBuffer so the array matches WaveShaperNode.curve under strict lib types.
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * kk) / kk;
  }
  return curve;
}

/** Hardness of a soft saturator for a 0-100 drive knob: k 1 (barely bends) to 8. */
export function softDriveK(drive: number): number {
  return 1 + Math.min(100, Math.max(0, drive)) / 100 * 7;
}

/** Hardness of a fuzz for a 0-100 drive knob: k 6 to 18, already squashed at zero drive. */
export function fuzzDriveK(drive: number): number {
  return 6 + Math.min(100, Math.max(0, drive)) / 100 * 12;
}

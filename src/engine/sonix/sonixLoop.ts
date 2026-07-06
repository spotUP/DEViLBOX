/**
 * Sustain-loop point finder for the Sonix synth audition.
 *
 * The editor auditions a note by rendering a fixed-length buffer through the WASM synth,
 * then looping a region so a held key sustains. Choosing that region badly breaks in three
 * ways seen on real instruments:
 *   - a swelling voice (Orchestra) jumps loud→quiet at the wrap ("cuts to 0") if the loop
 *     endpoints sit at very different amplitudes;
 *   - a filter-swept voice (Echo2) turns into a ~260 Hz buzz ("beard shaver") if the loop
 *     collapses to ~one waveform period of a non-periodic (swept) tail;
 *   - any voice clicks when the endpoints sit at different waveform phases.
 *
 * This searches the settled tail for a loop whose endpoints are both on a falling
 * zero-crossing (matched phase, no click) and whose leading waveform windows best match
 * (matched amplitude AND timbre, via least-squared-difference). A minimum loop length
 * (~50ms) prevents the buzz; a maximum (~0.6s) keeps it responsive. The correlation
 * self-adapts: a monotonic swell matches best at the shortest window (least amplitude
 * drift), a cyclically-modulated voice matches best ~one modulation cycle back.
 *
 * Returns null when no usable loop exists (silent or too-short buffer) — the caller then
 * plays the buffer once without looping.
 */
export interface SustainLoop {
  loopStartSec: number;
  loopEndSec: number;
}

const MIN_LOOP_SEC = 0.05; // ≥50ms → loop rate ≤20Hz, below the buzz range
const MAX_LOOP_SEC = 0.6;

/** Index of the last falling zero-crossing (v[i-1] >= 0 && v[i] < 0) in (lo, hi). */
function lastFallingCrossing(pcm: Float32Array, lo: number, hi: number): number {
  for (let i = hi - 1; i > lo; i--) {
    if (pcm[i - 1] >= 0 && pcm[i] < 0) return i;
  }
  return -1;
}

export function findSustainLoop(
  pcm: Float32Array,
  sampleRate: number,
  freqHz: number,
): SustainLoop | null {
  const n = pcm.length;
  if (n < 2048 || sampleRate <= 0 || freqHz <= 0) return null;

  const period = Math.max(2, Math.round(sampleRate / freqHz));
  const minLoop = Math.max(period, Math.round(MIN_LOOP_SEC * sampleRate));
  let maxLoop = Math.min(Math.round(MAX_LOOP_SEC * sampleRate), Math.floor(n / 2));
  if (maxLoop <= minLoop) maxLoop = minLoop + period;

  // Comparison window: a few base-wave periods, capturing phase + timbre at the splice.
  const w = Math.min(1024, Math.max(128, period * 4));

  // Loop end: last falling crossing near the buffer end, leaving room for the window.
  const loopEnd = lastFallingCrossing(pcm, minLoop + w, n);
  if (loopEnd < 0) return null;

  // Search candidate loop starts (falling crossings) minimizing the difference between the
  // window leading into loopStart and the window leading into loopEnd.
  const lo = Math.max(w, loopEnd - maxLoop);
  const hi = loopEnd - minLoop;
  let best = -1;
  let bestErr = Infinity;
  for (let i = hi; i > lo; i--) {
    if (!(pcm[i - 1] >= 0 && pcm[i] < 0)) continue; // falling crossing only
    let err = 0;
    for (let k = 0; k < w; k++) {
      const d = pcm[i - w + k] - pcm[loopEnd - w + k];
      err += d * d;
      if (err >= bestErr) break; // early-out once worse than the best so far
    }
    if (err < bestErr) { bestErr = err; best = i; }
  }
  if (best < 0) return null;

  return { loopStartSec: best / sampleRate, loopEndSec: loopEnd / sampleRate };
}

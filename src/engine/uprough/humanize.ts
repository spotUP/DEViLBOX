/**
 * Per-hit humanisation of a drum hit: tools/synth_dsp.py `humanize` (the seeded draw) and tools/hiphop.py
 * `_vary_hit` (pitch drift by band-limited resample, softer attack, gain), as pure functions.
 *
 * Float precision follows numpy: `synth_dsp.resample_ratio` returns float32, so a resampled hit is
 * rounded to float32 and the final gain multiply is a float32 multiply; the attack ramp turns the hit
 * into float64 (`np.array(smp, float)`), after which the gain multiply is float64.
 *
 * Per-hit seed design (UpRoughSoftsynth): the Python seeds each hit as `seed*2311 + step*17 + ...`.
 * The tracker has no bar/step, so the hit counter of the instrument takes the step's place:
 * `humanizeSeed(seed, hit) = seed*2311 + hit*17`. Every trigger of a humanizing voice increments the
 * counter, so two triggers of the same note differ, while the same (seed, counter) is reproducible.
 */
import { NumpyRandomState } from '@/engine/turntable/turntableSim';
import { resamplePoly } from '@/engine/dj/scratch/refDsp';
import { limitDenominator } from '@/engine/dj/scratch/scratchGrit';

export interface HitHumanize { cents: number; gain: number; attack: number; start: number }

/** synth_dsp.humanize(seed): RandomState(seed & 0xFFFFFFFF), four uniform draws in order. */
export function humanizeDraw(seed: number): HitHumanize {
  const rng = new NumpyRandomState(seed >>> 0);
  const cents = rng.uniform(-6, 6);
  const gain = 1.0 + rng.uniform(-0.08, 0.08);
  const attack = 1.0 + rng.uniform(-0.2, 0.2);
  const start = rng.uniform(0, 0.004);
  return { cents, gain, attack, start };
}

/** The per-hit seed: the hit counter stands in for the Python step index. */
export function humanizeSeed(seed: number, hit: number): number {
  return seed * 2311 + hit * 17;
}

/** synth_dsp.resample_ratio(x, ratio) for ratio != 1: resample_poly by the limited fraction, trimmed or padded to n, float32. */
export function resampleRatio(x: ArrayLike<number>, ratio: number): Float64Array {
  if (x.length < 2 || ratio === 1.0) return Float64Array.from(x, Math.fround);
  const n = Math.max(1, Math.trunc(x.length / ratio));
  const [up, down] = limitDenominator(1.0 / ratio, 2000);
  const y = resamplePoly(x, up, down);
  const out = new Float64Array(n);
  for (let i = 0; i < n && i < y.length; i++) out[i] = Math.fround(y[i]!);
  return out;
}

/** numpy.linspace(start, stop, num)[i] for num >= 1. */
function linspaceAt(start: number, stop: number, num: number, i: number): number {
  if (num === 1) return start;
  if (i === num - 1) return stop;
  return i * ((stop - start) / (num - 1)) + start;
}

/** hiphop._vary_hit(smp, h, tighten). `rate` is the engine rate (the Python uses the literal 22050). */
export function varyHit(smp: ArrayLike<number>, h: HitHumanize, tighten = 1.0, rate = 22050): Float64Array {
  const cents = h.cents * tighten;
  const gain = 1.0 + (h.gain - 1.0) * tighten;
  let out: Float64Array = Float64Array.from(smp);
  let float32 = false;
  if (Math.abs(cents) > 0.1) {
    out = resampleRatio(out, 2.0 ** (cents / 1200.0));
    float32 = true;
  }
  if (h.attack > 1.0) {
    const k = Math.min(out.length, Math.max(1, Math.trunc(0.002 * (h.attack - 1.0) * rate)));
    for (let i = 0; i < k; i++) out[i] = out[i]! * linspaceAt(0.7, 1.0, k, i);
    float32 = false;
  }
  const g = float32 ? Math.fround(gain) : gain;
  for (let i = 0; i < out.length; i++) out[i] = float32 ? Math.fround(out[i]! * g) : out[i]! * g;
  return out;
}

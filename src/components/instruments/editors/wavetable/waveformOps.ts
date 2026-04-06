/**
 * Waveform operations — DC removal, normalize, resample, requantize,
 * symmetry, phase align, Gaussian smooth.
 *
 * All ops operate on `number[]` arrays of integer sample values in
 * the range [0, maxValue]. The internal float buffer is never exposed
 * to the UI — these ops are the bridge between the UI (int values)
 * and math that needs -1..+1 bipolar floats.
 */

/** Convert int array [0, maxValue] → bipolar float array [-1, +1]. */
export function toFloat(data: number[], maxValue: number): Float32Array {
  const out = new Float32Array(data.length);
  const mid = maxValue / 2;
  for (let i = 0; i < data.length; i++) {
    out[i] = (data[i] - mid) / mid;
  }
  return out;
}

/** Convert bipolar float array [-1, +1] → int array [0, maxValue]. */
export function fromFloat(buf: Float32Array, maxValue: number): number[] {
  const out: number[] = [];
  const mid = maxValue / 2;
  for (let i = 0; i < buf.length; i++) {
    const v = Math.round(buf[i] * mid + mid);
    out.push(Math.max(0, Math.min(maxValue, v)));
  }
  return out;
}

/** Subtract mean — recenters the waveform around 0 (bipolar). */
export function dcRemove(data: number[], maxValue: number): number[] {
  if (data.length === 0) return data;
  let sum = 0;
  for (const v of data) sum += v;
  const mean = sum / data.length;
  const targetMean = maxValue / 2;
  const delta = targetMean - mean;
  return data.map(v => Math.max(0, Math.min(maxValue, Math.round(v + delta))));
}

/** Scale to full ±1 range, then requantize. */
export function normalize(data: number[], maxValue: number): number[] {
  const f = toFloat(data, maxValue);
  let peak = 0;
  for (let i = 0; i < f.length; i++) {
    const a = Math.abs(f[i]);
    if (a > peak) peak = a;
  }
  if (peak < 0.001) return data; // already silent
  const gain = 1 / peak;
  const out = new Float32Array(f.length);
  for (let i = 0; i < f.length; i++) out[i] = f[i] * gain;
  return fromFloat(out, maxValue);
}

/**
 * Resample data to a new length using linear interpolation.
 * Matches the existing resampleData() in WavetableEditor.tsx for consistency.
 */
export function resample(data: number[], targetLen: number): number[] {
  if (data.length === targetLen) return [...data];
  if (data.length === 0) return new Array(targetLen).fill(0);
  const result: number[] = [];
  const ratio = data.length / targetLen;
  for (let i = 0; i < targetLen; i++) {
    const srcPos = i * ratio;
    const srcIndex = Math.floor(srcPos);
    const frac = srcPos - srcIndex;
    const a = data[srcIndex];
    const b = data[(srcIndex + 1) % data.length];
    result.push(Math.round(a + (b - a) * frac));
  }
  return result;
}

/** Rescale sample values from oldMax → newMax. */
export function requantize(data: number[], oldMax: number, newMax: number): number[] {
  if (oldMax === newMax) return [...data];
  const scale = newMax / oldMax;
  return data.map(v => Math.max(0, Math.min(newMax, Math.round(v * scale))));
}

/** Mirror the left half onto the right half. */
export function mirrorLeftToRight(data: number[]): number[] {
  const out = [...data];
  const half = Math.floor(data.length / 2);
  for (let i = 0; i < half; i++) {
    out[data.length - 1 - i] = data[i];
  }
  return out;
}

/** Quarter-wave reflect: mirror first quarter to build a symmetric wave. */
export function quarterWaveReflect(data: number[], maxValue: number): number[] {
  const len = data.length;
  const q = Math.floor(len / 4);
  const out = new Array(len).fill(0);
  const mid = maxValue / 2;
  // First quarter: as drawn (positive half rising)
  for (let i = 0; i < q; i++) out[i] = data[i];
  // Second quarter: mirror of first (positive half falling)
  for (let i = 0; i < q; i++) out[q + i] = data[q - 1 - i];
  // Third & fourth quarters: vertical flip of first half (negative half)
  for (let i = 0; i < q * 2; i++) {
    out[q * 2 + i] = Math.max(0, Math.min(maxValue, Math.round(2 * mid - out[i])));
  }
  return out;
}

/** Rotate (phase shift) the waveform by N samples, wrapping around. */
export function rotate(data: number[], shift: number): number[] {
  const len = data.length;
  if (len === 0) return data;
  const s = ((shift % len) + len) % len;
  return [...data.slice(s), ...data.slice(0, s)];
}

/**
 * Phase-align: rotate the waveform so the sample with the maximum value
 * is at index 0. Helpful for stacking wavetables in N163/FDS.
 */
export function phaseAlignToPeak(data: number[]): number[] {
  if (data.length === 0) return data;
  let peakIdx = 0;
  let peakVal = data[0];
  for (let i = 1; i < data.length; i++) {
    if (data[i] > peakVal) {
      peakVal = data[i];
      peakIdx = i;
    }
  }
  return rotate(data, peakIdx);
}

/**
 * Gaussian smooth: each output sample is a weighted average of its
 * neighbors with a Gaussian kernel. `radius` controls the window size.
 */
export function gaussianSmooth(data: number[], radius: number, maxValue: number): number[] {
  if (radius <= 0 || data.length === 0) return [...data];
  const sigma = radius / 2;
  const kernel: number[] = [];
  let ksum = 0;
  for (let i = -radius; i <= radius; i++) {
    const w = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel.push(w);
    ksum += w;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= ksum;

  const len = data.length;
  const out: number[] = [];
  for (let i = 0; i < len; i++) {
    let v = 0;
    for (let k = -radius; k <= radius; k++) {
      const idx = ((i + k) % len + len) % len; // wrap
      v += data[idx] * kernel[k + radius];
    }
    out.push(Math.max(0, Math.min(maxValue, Math.round(v))));
  }
  return out;
}

/** Invert vertically: v → maxValue - v. */
export function invert(data: number[], maxValue: number): number[] {
  return data.map(v => maxValue - v);
}

/** Reverse the array (time-reverse). */
export function reverse(data: number[]): number[] {
  return [...data].reverse();
}

/**
 * Fill missing samples in a partial edit. When the pen jumps across
 * many X pixels in one frame, we linearly interpolate between the
 * previous drawn index and the current one so there are no gaps.
 */
export function penInterpolate(
  data: number[],
  fromIdx: number,
  toIdx: number,
  toValue: number,
  maxValue: number,
): number[] {
  if (fromIdx < 0 || fromIdx >= data.length || toIdx < 0 || toIdx >= data.length) return data;
  if (fromIdx === toIdx) {
    const out = [...data];
    out[toIdx] = Math.max(0, Math.min(maxValue, Math.round(toValue)));
    return out;
  }
  const out = [...data];
  const fromValue = data[fromIdx];
  const step = toIdx > fromIdx ? 1 : -1;
  const dist = Math.abs(toIdx - fromIdx);
  for (let k = 0; k <= dist; k++) {
    const idx = fromIdx + step * k;
    const t = k / dist;
    const v = fromValue + (toValue - fromValue) * t;
    out[idx] = Math.max(0, Math.min(maxValue, Math.round(v)));
  }
  return out;
}

/**
 * Apply a chip target's constraints to existing data. Resamples length
 * and requantizes amplitude. Used when switching chip targets.
 */
export function applyChipTarget(
  data: number[],
  currentMax: number,
  targetLen: number,
  targetMax: number,
): { data: number[]; len: number; max: number } {
  const resampled = resample(data, targetLen);
  const requantized = requantize(resampled, currentMax, targetMax);
  return { data: requantized, len: targetLen, max: targetMax };
}

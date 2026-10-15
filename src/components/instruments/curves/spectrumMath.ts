/**
 * spectrumMath.ts - the Fourier step shared by the FM curve models: an FFT and the peak picking that turns a block
 * of engine output samples into spectral lines.
 */

/** In-place radix-2 complex FFT (length a power of two). */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang); const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1; let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k]; const ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

export interface SpectrumLine { hz: number; db: number }

/**
 * The spectral lines of `samples`: local maxima of the Hann-windowed spectrum above `floorDb`, in dB relative to a sine
 * of amplitude `fullScale`. Amplitude is read at the peak bin.
 */
export function spectrumLines(samples: ArrayLike<number>, sampleRate: number, fullScale: number, floorDb = -80, maxHz = sampleRate / 2): SpectrumLine[] {
  const n = samples.length;
  const re = new Float64Array(n); const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = samples[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
  fft(re, im);
  const mag = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) mag[k] = (4 * Math.hypot(re[k], im[k])) / n;
  const lines: SpectrumLine[] = [];
  for (let k = 1; k < n / 2 - 1; k++) {
    const hz = (k * sampleRate) / n;
    if (hz > maxHz) break;
    if (mag[k] > mag[k - 1] && mag[k] >= mag[k + 1]) {
      const db = 20 * Math.log10(mag[k] / fullScale);
      if (db >= floorDb) lines.push({ hz, db });
    }
  }
  return lines;
}

/** A stem plot as one polyline: for each line, up from the floor to its level and back down. */
export function stemPoints(lines: ReadonlyArray<SpectrumLine>, floorDb: number): Array<readonly [number, number]> {
  const pts: Array<readonly [number, number]> = [];
  for (const l of lines) { pts.push([l.hz, floorDb], [l.hz, Math.max(floorDb, l.db)], [l.hz, floorDb]); }
  return pts;
}

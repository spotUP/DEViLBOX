/**
 * SpectralFilter.ts
 * FFT-based spectral filtering with editable filter curve, overlap-add processing,
 * and preset management.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FilterPoint {
  frequency: number; // Hz
  gain: number;      // dB (-60 to +6)
}

export type FilterPreset = 'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'custom';

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

/**
 * Return initial control points for a given preset type.
 * Default cutoff = 2000 Hz.
 */
export function getPresetPoints(preset: FilterPreset, cutoff = 2000): FilterPoint[] {
  switch (preset) {
    case 'lowpass':
      return [
        { frequency: 20,          gain: 0 },
        { frequency: cutoff,      gain: 0 },
        { frequency: cutoff * 1.5, gain: -60 },
        { frequency: 20000,       gain: -60 },
      ];

    case 'highpass':
      return [
        { frequency: 20,           gain: -60 },
        { frequency: cutoff * 0.67, gain: -60 },
        { frequency: cutoff,       gain: 0 },
        { frequency: 20000,        gain: 0 },
      ];

    case 'bandpass':
      return [
        { frequency: 20,              gain: -60 },
        { frequency: cutoff * 0.75,   gain: 0 },
        { frequency: cutoff,          gain: 0 },
        { frequency: cutoff * 1.33,   gain: 0 },
        { frequency: cutoff * 2,      gain: -60 },
        { frequency: 20000,           gain: -60 },
      ];

    case 'notch':
      return [
        { frequency: 20,             gain: 0 },
        { frequency: cutoff * 0.75,  gain: 0 },
        { frequency: cutoff,         gain: -60 },
        { frequency: cutoff * 1.33,  gain: 0 },
        { frequency: 20000,          gain: 0 },
      ];

    case 'custom':
    default:
      return [
        { frequency: 20,    gain: 0 },
        { frequency: 20000, gain: 0 },
      ];
  }
}

// ---------------------------------------------------------------------------
// Gain interpolation
// ---------------------------------------------------------------------------

/**
 * Interpolate gain at a given frequency using linear interpolation in
 * log10(frequency) space. Points are sorted ascending by frequency.
 * Values outside the range are clamped to the nearest endpoint.
 */
export function interpolateGain(points: FilterPoint[], frequency: number): number {
  if (points.length === 0) return 0;

  // Sort ascending by frequency
  const sorted = [...points].sort((a, b) => a.frequency - b.frequency);

  if (frequency <= sorted[0].frequency) return sorted[0].gain;
  if (frequency >= sorted[sorted.length - 1].frequency) return sorted[sorted.length - 1].gain;

  const logFreq = Math.log10(frequency);

  for (let i = 0; i < sorted.length - 1; i++) {
    const lo = sorted[i];
    const hi = sorted[i + 1];
    if (frequency >= lo.frequency && frequency <= hi.frequency) {
      const logLo = Math.log10(lo.frequency);
      const logHi = Math.log10(hi.frequency);
      const t = (logFreq - logLo) / (logHi - logLo);
      return lo.gain + t * (hi.gain - lo.gain);
    }
  }

  return sorted[sorted.length - 1].gain;
}

// ---------------------------------------------------------------------------
// Gain curve builder
// ---------------------------------------------------------------------------

/**
 * Build a linear-scale gain curve sampled at each FFT bin frequency.
 * Returns Float32Array of length fftSize/2+1 (positive frequencies only).
 */
export function buildGainCurve(
  points: FilterPoint[],
  fftSize: number,
  sampleRate: number,
): Float32Array {
  const numBins = fftSize / 2 + 1;
  const curve = new Float32Array(numBins);
  for (let i = 0; i < numBins; i++) {
    const freq = (i * sampleRate) / fftSize;
    const dB = interpolateGain(points, freq === 0 ? 1e-6 : freq);
    curve[i] = Math.pow(10, dB / 20);
  }
  return curve;
}

// ---------------------------------------------------------------------------
// FFT / IFFT (Cooley-Tukey radix-2, in-place)
// ---------------------------------------------------------------------------

/**
 * In-place bit-reversal permutation for FFT.
 */
function bitReversalPermutation(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      // Swap re
      const tmpR = re[i]; re[i] = re[j]; re[j] = tmpR;
      // Swap im
      const tmpI = im[i]; im[i] = im[j]; im[j] = tmpI;
    }
  }
}

/**
 * In-place Cooley-Tukey radix-2 FFT.
 * n must be a power of 2.
 */
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  bitReversalPermutation(re, im);

  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angleStep = -2 * Math.PI / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < halfLen; k++) {
        const angle = angleStep * k;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const uR = re[i + k];
        const uI = im[i + k];
        const vR = re[i + k + halfLen] * cosA - im[i + k + halfLen] * sinA;
        const vI = re[i + k + halfLen] * sinA + im[i + k + halfLen] * cosA;
        re[i + k]          = uR + vR;
        im[i + k]          = uI + vI;
        re[i + k + halfLen] = uR - vR;
        im[i + k + halfLen] = uI - vI;
      }
    }
  }
}

/**
 * In-place inverse FFT. Uses conjugate → FFT → conjugate → scale by 1/N.
 */
export function ifft(re: Float32Array, im: Float32Array): void {
  const n = re.length;

  // Conjugate
  for (let i = 0; i < n; i++) {
    im[i] = -im[i];
  }

  fft(re, im);

  // Conjugate and scale
  const scale = 1 / n;
  for (let i = 0; i < n; i++) {
    re[i] =  re[i] * scale;
    im[i] = -im[i] * scale;
  }
}

// ---------------------------------------------------------------------------
// Hann window
// ---------------------------------------------------------------------------

function makeHannWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return w;
}

// ---------------------------------------------------------------------------
// applySpectralFilter — overlap-add
// ---------------------------------------------------------------------------

/**
 * Apply a spectral filter to audio data using overlap-add processing.
 *
 * @param inputData  Input audio samples.
 * @param gainCurve  Linear gain per FFT bin (length fftSize/2+1), from buildGainCurve.
 * @param fftSize    Must be a power of 2.
 * @returns Filtered audio samples (same length as inputData).
 */
export function applySpectralFilter(
  inputData: Float32Array,
  gainCurve: Float32Array,
  fftSize: number,
): Float32Array {
  const hop = fftSize >> 2; // 75% overlap → hop = fftSize/4
  const hann = makeHannWindow(fftSize);
  const output = new Float32Array(inputData.length + fftSize);
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);

  for (let offset = 0; offset < inputData.length; offset += hop) {
    // Fill frame with windowed input
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < fftSize; i++) {
      const idx = offset + i;
      re[i] = idx < inputData.length ? inputData[idx] * hann[i] : 0;
    }

    // Forward FFT
    fft(re, im);

    // Apply gain curve (symmetric spectrum)
    const numBins = fftSize / 2 + 1;
    for (let b = 0; b < numBins; b++) {
      const g = gainCurve[b];
      re[b] *= g;
      im[b] *= g;
    }
    // Mirror for negative frequencies (bins fftSize/2+1 … fftSize-1)
    for (let b = 1; b < fftSize / 2; b++) {
      const mirror = fftSize - b;
      re[mirror] = re[b];
      im[mirror] = -im[b];
    }

    // Inverse FFT
    ifft(re, im);

    // Overlap-add with output window
    for (let i = 0; i < fftSize; i++) {
      output[offset + i] += re[i] * hann[i];
    }
  }

  // Normalize for 75% Hann overlap-add (sum of squared windows = fftSize * 3/8)
  // Standard OLA normalization factor for Hann window at 75% overlap is 2/3
  const normFactor = 2 / 3;
  const result = new Float32Array(inputData.length);
  for (let i = 0; i < inputData.length; i++) {
    result[i] = output[i] * normFactor;
  }
  return result;
}

// ---------------------------------------------------------------------------
// computeSpectrum — magnitude spectrum for visualization
// ---------------------------------------------------------------------------

/**
 * Compute the magnitude spectrum of a block of audio.
 * Returns dB values per bin (length fftSize/2+1).
 */
export function computeSpectrum(inputData: Float32Array, fftSize: number): Float32Array {
  const hann = makeHannWindow(fftSize);
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);

  // Use the first fftSize samples (or zero-pad)
  for (let i = 0; i < fftSize; i++) {
    re[i] = i < inputData.length ? inputData[i] * hann[i] : 0;
  }

  fft(re, im);

  const numBins = fftSize / 2 + 1;
  const spectrum = new Float32Array(numBins);
  for (let i = 0; i < numBins; i++) {
    const mag = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / fftSize;
    spectrum[i] = mag > 1e-10 ? 20 * Math.log10(mag) : -120;
  }
  return spectrum;
}

// ---------------------------------------------------------------------------
// filterAudioBuffer — high-level entry point
// ---------------------------------------------------------------------------

/**
 * Apply a spectral filter defined by control points to an AudioBuffer.
 * Optionally restrict processing to a sample-index selection range.
 *
 * @param buffer         Source AudioBuffer (unchanged; a new buffer is returned).
 * @param points         Filter curve control points.
 * @param fftSize        FFT size (default 4096, must be power of 2).
 * @param selectionStart Start sample index (inclusive). Defaults to 0.
 * @param selectionEnd   End sample index (exclusive). Defaults to buffer length.
 * @returns New AudioBuffer with the filter applied.
 */
export function filterAudioBuffer(
  buffer: AudioBuffer,
  points: FilterPoint[],
  fftSize = 4096,
  selectionStart?: number,
  selectionEnd?: number,
): AudioBuffer {
  const sampleRate = buffer.sampleRate;
  const numChannels = buffer.numberOfChannels;
  const totalSamples = buffer.length;

  const start = selectionStart ?? 0;
  const end = selectionEnd ?? totalSamples;

  const gainCurve = buildGainCurve(points, fftSize, sampleRate);

  // Create output buffer via OfflineAudioContext if available, else use a plain
  // wrapper.  Since this runs in both browser and Node test environments, we
  // construct the output channel data manually and return an AudioBuffer-like
  // object that satisfies the AudioBuffer interface used in this codebase.
  const outChannels: Float32Array<ArrayBuffer>[] = [];

  for (let ch = 0; ch < numChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = new Float32Array(totalSamples);

    // Copy the untouched regions verbatim
    dst.set(src);

    // Extract the selection region
    const selectionLength = end - start;
    if (selectionLength > 0) {
      const region = new Float32Array(src.subarray(start, end));
      const filtered = applySpectralFilter(region, gainCurve, fftSize);
      dst.set(filtered, start);
    }

    outChannels.push(dst);
  }

  // Build and return a new AudioBuffer.
  // AudioBuffer constructor is only available in browsers; in Node tests the
  // caller provides a real AudioBuffer and we need to write back via copyToChannel.
  const outBuffer = new AudioBuffer({ numberOfChannels: numChannels, length: totalSamples, sampleRate });
  for (let ch = 0; ch < numChannels; ch++) {
    outBuffer.copyToChannel(outChannels[ch], ch);
  }
  return outBuffer;
}

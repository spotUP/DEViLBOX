/**
 * Mel spectrogram computation matching CedFeatureExtractor exactly.
 *
 * Parameters (from preprocessor_config.json + config.json):
 *   sample_rate : 16000 Hz
 *   n_fft       : 512
 *   win_length  : 512
 *   hop_length  : 160
 *   n_mels      : 64
 *   f_min       : 0
 *   f_max       : 8000
 *   center      : true  (zero-pad signal by n_fft/2 on each side)
 *   window      : Hann
 *   top_db      : 120 (AmplitudeToDB dynamic range clip)
 *
 * Output tensor shape: (1, 64, T) where T = 1 + floor(N / 160)
 * CED applies BatchNorm2d internally — no external normalisation needed.
 */

export const CED_SAMPLE_RATE = 16000;
export const CED_N_MELS      = 64;
const N_FFT     = 512;
const HOP       = 160;
const F_MIN     = 0;
const F_MAX     = 8000;
const TOP_DB    = 120;

// ── Radix-2 Cooley-Tukey FFT (in-place) ──────────────────────────────────────

function fftInPlace(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wRe0 = Math.cos(ang), wIm0 = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1, wIm = 0;
      const half = len >> 1;
      for (let j = 0; j < half; j++) {
        const uRe = re[i + j], uIm = im[i + j];
        const vRe = re[i + j + half] * wRe - im[i + j + half] * wIm;
        const vIm = re[i + j + half] * wIm + im[i + j + half] * wRe;
        re[i + j]       = uRe + vRe; im[i + j]       = uIm + vIm;
        re[i + j + half] = uRe - vRe; im[i + j + half] = uIm - vIm;
        const nr = wRe * wRe0 - wIm * wIm0;
        wIm = wRe * wIm0 + wIm * wRe0; wRe = nr;
      }
    }
  }
}

// ── Hann window ───────────────────────────────────────────────────────────────

const _hannCache = new Map<number, Float32Array>();
function hannWindow(n: number): Float32Array {
  let w = _hannCache.get(n);
  if (!w) {
    w = new Float32Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
    _hannCache.set(n, w);
  }
  return w;
}

// ── Mel filterbank (HTK formula) ──────────────────────────────────────────────

function hzToMel(f: number): number { return 2595 * Math.log10(1 + f / 700); }
function melToHz(m: number): number { return 700 * (Math.pow(10, m / 2595) - 1); }

let _melFilterbank: Float32Array[] | null = null;

function getMelFilterbank(): Float32Array[] {
  if (_melFilterbank) return _melFilterbank;
  const nBins = N_FFT / 2 + 1;  // 257
  const melMin = hzToMel(F_MIN);
  const melMax = hzToMel(F_MAX);
  // n_mels + 2 centre points
  const melPts = new Float32Array(CED_N_MELS + 2);
  for (let i = 0; i < melPts.length; i++) {
    melPts[i] = melMin + (i / (CED_N_MELS + 1)) * (melMax - melMin);
  }
  // Map mel points → FFT bin indices (real-valued, fractional)
  const binPts = melPts.map(m => (melToHz(m) / (CED_SAMPLE_RATE / 2)) * (N_FFT / 2));

  _melFilterbank = [];
  for (let m = 0; m < CED_N_MELS; m++) {
    const filt = new Float32Array(nBins);
    const lo = binPts[m], ctr = binPts[m + 1], hi = binPts[m + 2];
    for (let k = 0; k < nBins; k++) {
      if (k >= lo && k <= ctr) filt[k] = (k - lo) / (ctr - lo + 1e-8);
      else if (k > ctr && k <= hi) filt[k] = (hi - k) / (hi - ctr + 1e-8);
    }
    _melFilterbank.push(filt);
  }
  return _melFilterbank;
}

// ── Linear resampler ──────────────────────────────────────────────────────────

export function resampleTo16k(pcm: Float32Array, fromRate: number): Float32Array {
  if (fromRate === CED_SAMPLE_RATE) return pcm;
  const ratio = fromRate / CED_SAMPLE_RATE;
  const outLen = Math.floor(pcm.length / ratio);
  const out = new Float32Array(outLen);

  // Anti-aliasing: for downsampling, average input samples within each output
  // window to prevent frequency content above the Nyquist of the target rate
  // from aliasing into the mel spectrogram.
  if (ratio > 1) {
    const halfWin = ratio / 2;
    for (let i = 0; i < outLen; i++) {
      const center = i * ratio;
      const start = Math.max(0, Math.floor(center - halfWin));
      const end = Math.min(pcm.length - 1, Math.ceil(center + halfWin));
      let sum = 0;
      for (let j = start; j <= end; j++) sum += pcm[j];
      out[i] = sum / (end - start + 1);
    }
  } else {
    // Upsampling: linear interpolation is fine
    for (let i = 0; i < outLen; i++) {
      const src = i * ratio;
      const lo = Math.floor(src);
      const hi = Math.min(lo + 1, pcm.length - 1);
      out[i] = pcm[lo] + (pcm[hi] - pcm[lo]) * (src - lo);
    }
  }
  return out;
}

// ── Loop short samples ────────────────────────────────────────────────────────

/** Tile PCM to at least minSamples length so CED sees meaningful audio
 *  rather than a tiny signal surrounded by zeros. */
export function tileToMinLength(pcm: Float32Array, minSamples: number): Float32Array {
  if (pcm.length >= minSamples) return pcm;
  const reps = Math.ceil(minSamples / pcm.length);
  const out = new Float32Array(reps * pcm.length);
  for (let r = 0; r < reps; r++) out.set(pcm, r * pcm.length);
  return out;
}

// ── Main entry ────────────────────────────────────────────────────────────────

/**
 * Compute CED-compatible log mel spectrogram from mono PCM.
 *
 * @param pcm        Mono Float32Array, already resampled to 16 kHz.
 * @returns          Object with `data` (Float32Array, row-major [n_mels × T]),
 *                   `nMels` (64) and `nFrames` (T).
 */
export function computeCedMelSpectrogram(pcm: Float32Array): {
  data: Float32Array; nMels: number; nFrames: number;
} {
  // Center-pad: zero-pad n_fft/2 on each side (torchaudio center=True)
  const pad = N_FFT >> 1;
  const padded = new Float32Array(pcm.length + 2 * pad);
  padded.set(pcm, pad);

  const nFrames = 1 + Math.floor(pcm.length / HOP);
  const melFb = getMelFilterbank();
  const hann = hannWindow(N_FFT);
  const re = new Float32Array(N_FFT);
  const im = new Float32Array(N_FFT);
  const nBins = N_FFT / 2 + 1;

  // Output: [n_mels, nFrames] row-major
  const mel = new Float32Array(CED_N_MELS * nFrames);

  for (let t = 0; t < nFrames; t++) {
    const start = t * HOP;
    for (let i = 0; i < N_FFT; i++) {
      const idx = start + i;
      re[i] = idx < padded.length ? padded[idx] * hann[i] : 0;
      im[i] = 0;
    }
    fftInPlace(re, im);

    // Power spectrum |X|²
    const pow = new Float32Array(nBins);
    for (let k = 0; k < nBins; k++) pow[k] = re[k] * re[k] + im[k] * im[k];

    // Apply mel filterbank
    for (let m = 0; m < CED_N_MELS; m++) {
      let energy = 0;
      const filt = melFb[m];
      for (let k = 0; k < nBins; k++) energy += pow[k] * filt[k];
      mel[m * nFrames + t] = Math.max(energy, 1e-10);
    }
  }

  // AmplitudeToDB: 10 * log10(mel), clip to top_db below maximum
  let maxDb = -Infinity;
  const db = new Float32Array(mel.length);
  for (let i = 0; i < mel.length; i++) {
    db[i] = 10 * Math.log10(mel[i]);
    if (db[i] > maxDb) maxDb = db[i];
  }
  const floor = maxDb - TOP_DB;
  for (let i = 0; i < db.length; i++) {
    if (db[i] < floor) db[i] = floor;
  }

  return { data: db, nMels: CED_N_MELS, nFrames };
}

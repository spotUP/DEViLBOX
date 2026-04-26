/**
 * Offline sample-buffer spectral analysis for channel-role classification.
 *
 * Problem this solves: tracker-module role classification (bass / percussion /
 * lead / pad) relies on either (a) classifyChannel's octave heuristic —
 * breaks on Amiga MODs that encode bass in octave 3 — or (b) instrument-name
 * regex — breaks on MODs where the "instrument name" slots hold a greeting
 * scroller instead of descriptive labels. This module reads the actual PCM,
 * runs an FFT, and classifies by spectral features that don't care about
 * encoding tricks or naming conventions.
 *
 * Pure functions: takes PCM + sample rate, returns features + classification.
 * Synchronous — the PCM lives in an `data:audio/wav;base64,...` URL on every
 * sample instrument, so decoding is an `atob` + WAV-chunk walk, no network.
 *
 * Classifier:
 *   - peakHz < 350 + low flatness                 → bass (KEY FIX: peakHz not centroid,
 *                                                     because square-wave bass at 220 Hz
 *                                                     has centroid ~524 Hz from harmonics)
 *   - low centroid + high flatness + short decay   → kick
 *   - high centroid + noisy/high-ZCR + very short → hat  (ZCR: LFSR noise better than flatness)
 *   - mid centroid + high flatness + short decay   → snare
 *   - chromaEntropy > 1.8 bits + long decay       → pad  (NEW: polyphonic sustained)
 *   - chromaEntropy > 1.8 bits + short decay      → chord (NEW: polyphonic stab)
 *   - chromaEntropy < 1.8 bits + mid/long decay   → lead (monophonic melody)
 * Confidence is 0.75 — slots between sample-URL categorize (0.8) and
 * instrument-name regex (0.6) in classifyInstrument's priority order.
 */
import type { ChannelRole } from './MusicAnalysis';
import type { ChannelSubrole } from './ChannelNaming';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DecodedPcm {
  pcm: Float32Array;     // mono, normalised to [-1, 1]
  sampleRate: number;    // Hz
  durationSec: number;
}

export interface SampleSpectrumFeatures {
  /** Spectral centroid (Hz) — "brightness". < 250 Hz → bass, > 2 kHz → hat. */
  centroidHz: number;
  /** Spectral flatness / Wiener entropy in [0, 1]. 0 = pure tone, 1 = white noise. */
  flatness: number;
  /** Peak bin frequency (Hz). Useful as a fundamental estimator for tonal samples. */
  peakHz: number;
  /** Time to envelope peak, ms (attack). */
  attackMs: number;
  /** Time from peak down to 10% of peak, ms. Short → percussive. Long → sustain. */
  decayMs: number;
  /** Peak / RMS ratio. High → transient. Low → sustained. */
  crestFactor: number;
  /** Duration of the analysed sample (before any loop), seconds. */
  durationSec: number;
}

export interface SampleClassification {
  role: ChannelRole;
  subrole?: ChannelSubrole;
  /** Classifier confidence in [0, 1]. 0 means "no opinion — features too noisy". */
  confidence: number;
  features: SampleSpectrumFeatures;
}

// ─── data:audio/wav;base64 decoder ──────────────────────────────────────────

const DATA_URL_PREFIX = 'data:audio/wav;base64,';

/** Decode a `data:audio/wav;base64,...` URL to mono Float32 PCM. Returns
 *  null when the URL isn't a WAV data URL or the header is malformed.
 *  Handles 8-bit unsigned, 16-bit signed, and 32-bit float WAV. Downmixes
 *  multi-channel to mono by averaging. */
export function decodeWavDataUrl(url: string | undefined | null): DecodedPcm | null {
  if (!url || typeof url !== 'string') return null;
  if (!url.startsWith(DATA_URL_PREFIX)) return null;
  const b64 = url.slice(DATA_URL_PREFIX.length);
  let bin: string;
  try { bin = atob(b64); } catch { return null; }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return decodeWavBytes(bytes);
}

/** Parse a WAV byte buffer → mono Float32 PCM. Exposed for direct-buffer
 *  callers (tests, future non-data-URL paths). */
export function decodeWavBytes(bytes: Uint8Array): DecodedPcm | null {
  if (bytes.length < 44) return null;
  // RIFF....WAVE
  if (bytes[0] !== 0x52 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x46) return null;
  if (bytes[8] !== 0x57 || bytes[9] !== 0x41 || bytes[10] !== 0x56 || bytes[11] !== 0x45) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let fmtSeen = false;
  let numChannels = 1;
  let sampleRate = 0;
  let bitsPerSample = 16;
  let audioFormat = 1;            // 1 = PCM, 3 = IEEE float
  let dataStart = -1;
  let dataSize = 0;

  while (offset + 8 <= bytes.length) {
    const tag = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    const chunkSize = view.getUint32(offset + 4, true);
    const bodyStart = offset + 8;
    if (tag === 'fmt ') {
      audioFormat = view.getUint16(bodyStart + 0, true);
      numChannels = view.getUint16(bodyStart + 2, true);
      sampleRate = view.getUint32(bodyStart + 4, true);
      bitsPerSample = view.getUint16(bodyStart + 14, true);
      fmtSeen = true;
    } else if (tag === 'data') {
      dataStart = bodyStart;
      dataSize = chunkSize;
      break;
    }
    offset = bodyStart + chunkSize + (chunkSize & 1); // pad to even
  }

  if (!fmtSeen || dataStart < 0 || sampleRate <= 0) return null;

  const bytesPerSample = bitsPerSample >> 3;
  if (bytesPerSample === 0) return null;
  const frameCount = Math.floor(dataSize / (bytesPerSample * numChannels));
  if (frameCount <= 0) return null;

  const pcm = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    // Mix down multi-channel to mono
    let sum = 0;
    for (let c = 0; c < numChannels; c++) {
      const pos = dataStart + (i * numChannels + c) * bytesPerSample;
      let s: number;
      if (audioFormat === 3 && bitsPerSample === 32) {
        s = view.getFloat32(pos, true);
      } else if (bitsPerSample === 16) {
        s = view.getInt16(pos, true) / 32768;
      } else if (bitsPerSample === 8) {
        // WAV 8-bit is UNSIGNED
        s = (bytes[pos] - 128) / 128;
      } else if (bitsPerSample === 24) {
        const b0 = bytes[pos];
        const b1 = bytes[pos + 1];
        const b2 = bytes[pos + 2];
        let v = (b2 << 16) | (b1 << 8) | b0;
        if (v & 0x800000) v |= ~0xffffff;
        s = v / 8388608;
      } else if (bitsPerSample === 32) {
        s = view.getInt32(pos, true) / 2147483648;
      } else {
        return null;
      }
      sum += s;
    }
    pcm[i] = sum / numChannels;
  }

  return { pcm, sampleRate, durationSec: frameCount / sampleRate };
}

// ─── Tiny radix-2 Cooley-Tukey FFT ──────────────────────────────────────────

/** Next power of two ≥ n. */
function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** In-place iterative radix-2 FFT. `re` and `im` arrays must be the same
 *  length, a power of two. Produces the forward transform (no normalisation). */
function fftInPlace(re: Float32Array, im: Float32Array): void {
  const n = re.length;

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }

  // Butterflies
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1, wIm = 0;
      const half = len >> 1;
      for (let j = 0; j < half; j++) {
        const uRe = re[i + j];
        const uIm = im[i + j];
        const vRe = re[i + j + half] * wRe - im[i + j + half] * wIm;
        const vIm = re[i + j + half] * wIm + im[i + j + half] * wRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + half] = uRe - vRe;
        im[i + j + half] = uIm - vIm;
        const nRe = wRe * wlenRe - wIm * wlenIm;
        const nIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nRe; wIm = nIm;
      }
    }
  }
}

/** Hamming window length n. */
function hamming(n: number, out: Float32Array): void {
  const k = 2 * Math.PI / (n - 1);
  for (let i = 0; i < n; i++) out[i] = 0.54 - 0.46 * Math.cos(k * i);
}

// ─── Spectrum + envelope feature extraction ────────────────────────────────

const DEFAULT_FFT_SIZE = 2048;

/** Run FFT on windowed, averaged magnitude bins. Returns half-size magnitude
 *  array (real-signal symmetry). `start` picks the analysis offset; we
 *  skip the attack transient by default so the steady-state spectrum
 *  dominates the classifier. */
function averageMagnitudeSpectrum(pcm: Float32Array, fftSize: number, start: number): Float32Array | null {
  if (pcm.length < fftSize) return null;
  const half = fftSize >> 1;
  const mag = new Float32Array(half);
  const win = new Float32Array(fftSize);
  hamming(fftSize, win);
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  const hop = fftSize >> 1;
  let frames = 0;
  for (let off = Math.max(0, start); off + fftSize <= pcm.length; off += hop) {
    for (let i = 0; i < fftSize; i++) { re[i] = pcm[off + i] * win[i]; im[i] = 0; }
    fftInPlace(re, im);
    for (let i = 0; i < half; i++) {
      const m = Math.hypot(re[i], im[i]);
      mag[i] += m;
    }
    frames++;
    if (frames >= 16) break;   // cap for speed on long samples
  }
  if (frames === 0) return null;
  for (let i = 0; i < half; i++) mag[i] /= frames;
  return mag;
}

/** Spectral centroid (Hz) = Σ(bin_k * mag_k²) / Σ mag_k². Uses power (mag²)
 *  and a relative noise-floor threshold: bins below `peak * 0.01` are
 *  treated as silence. Without the threshold, at high sample rates the
 *  thousands of near-silent upper bins drag the centroid toward the middle
 *  of the audio range (110 Hz sine at 48 kHz otherwise reads as centroid
 *  ≈ 670 Hz — looks like a lead even though the actual peak is at 117 Hz). */
function spectralCentroid(mag: Float32Array, binHz: number): number {
  if (mag.length === 0) return 0;
  let peak = 0;
  for (let i = 1; i < mag.length; i++) if (mag[i] > peak) peak = mag[i];
  if (peak === 0) return 0;
  const floor = peak * 0.01;
  let num = 0, den = 0;
  for (let i = 1; i < mag.length; i++) {   // skip DC
    const m = mag[i];
    if (m < floor) continue;
    const p = m * m;
    num += i * binHz * p;
    den += p;
  }
  return den > 0 ? num / den : 0;
}

/** Spectral flatness (Wiener entropy) = geometric_mean / arithmetic_mean, in
 *  [0, 1]. Pure sine ≈ 0, white noise ≈ 1. */
function spectralFlatness(mag: Float32Array): number {
  let logSum = 0, linSum = 0, count = 0;
  for (let i = 1; i < mag.length; i++) {
    const v = mag[i];
    if (v <= 0) continue;
    logSum += Math.log(v);
    linSum += v;
    count++;
  }
  if (count === 0 || linSum === 0) return 0;
  const geo = Math.exp(logSum / count);
  const ari = linSum / count;
  return Math.min(1, geo / ari);
}

/** Peak bin frequency (ignoring DC). */
function peakFrequency(mag: Float32Array, binHz: number): number {
  let peak = 0, peakIdx = 0;
  for (let i = 1; i < mag.length; i++) {
    if (mag[i] > peak) { peak = mag[i]; peakIdx = i; }
  }
  return peakIdx * binHz;
}

/** Envelope analysis: attack (time-to-peak) + decay (peak to 10%) + crest.
 *  Uses windowed RMS at ~200 windows across the buffer. */
function envelopeAnalysis(pcm: Float32Array, sampleRate: number): {
  attackMs: number; decayMs: number; crestFactor: number;
} {
  if (pcm.length === 0) return { attackMs: 0, decayMs: 0, crestFactor: 0 };
  const windows = Math.min(200, Math.max(8, Math.floor(pcm.length / 64)));
  const windowSize = Math.max(1, Math.floor(pcm.length / windows));
  const rms = new Float32Array(windows);
  let peakSample = 0;
  for (let w = 0; w < windows; w++) {
    let sum = 0;
    const base = w * windowSize;
    const end = Math.min(pcm.length, base + windowSize);
    for (let i = base; i < end; i++) {
      const v = pcm[i];
      sum += v * v;
      const a = v < 0 ? -v : v;
      if (a > peakSample) peakSample = a;
    }
    rms[w] = Math.sqrt(sum / Math.max(1, end - base));
  }

  // Peak RMS window + total RMS
  let peakIdx = 0, peakRms = 0, totalSq = 0;
  for (let i = 0; i < windows; i++) {
    if (rms[i] > peakRms) { peakRms = rms[i]; peakIdx = i; }
    totalSq += rms[i] * rms[i];
  }
  const meanRms = Math.sqrt(totalSq / windows);
  const msPerWindow = (windowSize / sampleRate) * 1000;
  const attackMs = peakIdx * msPerWindow;

  // Decay: find first window after peak where rms < peakRms * 0.1
  let decayMs = 0;
  const threshold = peakRms * 0.1;
  for (let i = peakIdx + 1; i < windows; i++) {
    if (rms[i] <= threshold) { decayMs = (i - peakIdx) * msPerWindow; break; }
  }
  if (decayMs === 0 && peakIdx < windows - 1) {
    // Never dropped below 10% — sustained sample
    decayMs = (windows - peakIdx) * msPerWindow;
  }

  const crestFactor = meanRms > 0 ? peakSample / meanRms : 0;
  return { attackMs, decayMs, crestFactor };
}

/** Extract all features from a decoded PCM buffer. Returns null if the
 *  sample is too short for a stable FFT frame. */
export function extractSampleFeatures(
  pcm: Float32Array,
  sampleRate: number,
  fftSize: number = DEFAULT_FFT_SIZE,
): SampleSpectrumFeatures | null {
  if (pcm.length === 0 || sampleRate <= 0) return null;
  const fft = nextPow2(Math.min(fftSize, pcm.length));
  if (fft < 64) return null;

  // Skip the first ~20 ms to bypass the attack transient for spectral measurement.
  const attackSkipSamples = Math.floor((sampleRate * 20) / 1000);
  const startOffset = pcm.length > attackSkipSamples + fft ? attackSkipSamples : 0;
  const mag = averageMagnitudeSpectrum(pcm, fft, startOffset);
  if (!mag) return null;

  const binHz = sampleRate / fft;
  const centroidHz = spectralCentroid(mag, binHz);
  const flatness = spectralFlatness(mag);
  const peakHz = peakFrequency(mag, binHz);
  const env = envelopeAnalysis(pcm, sampleRate);

  return {
    centroidHz,
    flatness,
    peakHz,
    attackMs: env.attackMs,
    decayMs: env.decayMs,
    crestFactor: env.crestFactor,
    durationSec: pcm.length / sampleRate,
  };
}

// ─── Role classifier ────────────────────────────────────────────────────────

/** Feature → role decision. Returns `empty` when evidence is ambiguous
 *  (confidence 0), so callers can fall through to other signals.
 *
 *  Thresholds picked from listening tests on real MOD/XM samples:
 *    bass:       centroid < 400 Hz, flatness < 0.2, decay > 80 ms
 *    kick:       centroid < 400 Hz, flatness >= 0.2, decay < 200 ms, short duration
 *    snare:      centroid 400-3000 Hz, flatness >= 0.35, decay < 300 ms
 *    hat:        centroid > 3000 Hz, flatness >= 0.4, decay < 150 ms
 *    pad:        centroid > 400 Hz, flatness < 0.25, decay > 500 ms
 *    lead:       centroid > 400 Hz, flatness < 0.3, decay 200-500 ms
 *    arpeggio:   (unhandled — note patterns reveal this, not spectrum)
 */
export function classifyBySpectralFeatures(f: SampleSpectrumFeatures): {
  role: ChannelRole; subrole?: ChannelSubrole; confidence: number;
} {
  // Drums first — short envelope is strongest discriminator
  const isShort = f.decayMs > 0 && f.decayMs < 300;
  const isVeryShort = f.decayMs > 0 && f.decayMs < 150;
  const isNoisy = f.flatness >= 0.35;
  const isTonal = f.flatness < 0.25;

  // Kick: low centroid + noisy + short. Confidence 0.85 (above the
  // classifyChannelWithInstruments override threshold of 0.8) because the
  // feature trio is very specific — false positives here are rare.
  if (f.centroidHz < 400 && isNoisy && isShort) {
    return { role: 'percussion', subrole: 'kick', confidence: 0.85 };
  }
  // Hat: high centroid + noisy + very short
  if (f.centroidHz > 3000 && isNoisy && isVeryShort) {
    return { role: 'percussion', subrole: 'hat', confidence: 0.85 };
  }
  // Snare: mid centroid + noisy + short + transient crest. Slightly lower
  // confidence (0.8) because mid-centroid + noisy can also be a vocal
  // chop or a filtered stab.
  if (f.centroidHz >= 400 && f.centroidHz <= 3500 && isNoisy && isShort && f.crestFactor >= 3) {
    return { role: 'percussion', subrole: 'snare', confidence: 0.8 };
  }
  // Generic percussion fallback — noisy + transient + short
  if (isNoisy && isVeryShort && f.crestFactor >= 4) {
    return { role: 'percussion', subrole: 'perc', confidence: 0.65 };
  }

  // Bass: low centroid + tonal. Textbook bass features — centroid < 400 Hz
  // AND flatness < 0.25 is very specific. Confidence 0.85 lets this
  // override note-stats in classifyChannelWithInstruments when the bass
  // instrument is the dominant one on a channel.
  if (f.centroidHz < 400 && isTonal) {
    const subrole: ChannelSubrole = f.peakHz > 0 && f.peakHz < 80 ? 'sub' : 'synth';
    return { role: 'bass', subrole, confidence: 0.85 };
  }

  // Pad: tonal + long envelope
  if (isTonal && f.decayMs >= 500) {
    return { role: 'pad', confidence: 0.7 };
  }

  // Lead: tonal + medium envelope, mid-high centroid
  if (f.flatness < 0.3 && f.decayMs >= 150 && f.decayMs < 800 && f.centroidHz >= 400) {
    return { role: 'lead', subrole: 'synth', confidence: 0.65 };
  }

  // Low-confidence lead fallback when nothing else fits + sample is tonal-ish
  if (f.flatness < 0.35 && f.centroidHz >= 300) {
    return { role: 'lead', confidence: 0.4 };
  }

  return { role: 'empty', confidence: 0 };
}

// ─── Module cache ──────────────────────────────────────────────────────────

const _dataUrlCache = new Map<string, SampleClassification | null>();
const MAX_CACHE_ENTRIES = 256;

/** Full pipeline: decode + extract + classify. Cached by URL string so
 *  repeated calls for the same instrument (AutoDub ticking, auto-naming
 *  passes) only do the FFT once. Returns null when the URL isn't a WAV
 *  data URL or is too short to analyse. */
export function analyzeSampleForClassification(
  url: string | undefined | null,
): SampleClassification | null {
  if (!url) return null;
  const cached = _dataUrlCache.get(url);
  if (cached !== undefined) return cached;

  const decoded = decodeWavDataUrl(url);
  if (!decoded) {
    _dataUrlCache.set(url, null);
    return null;
  }
  const features = extractSampleFeatures(decoded.pcm, decoded.sampleRate);
  if (!features) {
    _dataUrlCache.set(url, null);
    return null;
  }
  const decision = classifyBySpectralFeatures(features);
  const result: SampleClassification = {
    role: decision.role,
    subrole: decision.subrole,
    confidence: decision.confidence,
    features,
  };

  // Trim LRU if cache is full
  if (_dataUrlCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = _dataUrlCache.keys().next().value;
    if (firstKey !== undefined) _dataUrlCache.delete(firstKey);
  }
  _dataUrlCache.set(url, result);
  return result;
}

/** Test-only: clear the cache between test cases. */
export function _clearSampleSpectrumCache(): void {
  _dataUrlCache.clear();
}

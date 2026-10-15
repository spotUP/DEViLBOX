/**
 * Renders a klystrack instrument through the real Klystrack worklet + WASM and measures it.
 * Shared by the preset bank test and its calibration: ONE renderer, ONE feature definition.
 */
import { startWorklet, songBuffer, stereoOutputs } from './workletHarness';
import { klysTransform } from '@/engine/klystrack/KlysEngine';
import { klysInstrumentToEngine } from '@/engine/klystrack/klysSongData';
import type { KlysNativeInstrument } from '@/types/tracker';

export const SAMPLE_RATE = 48000;
export type KlysWorklet = Awaited<ReturnType<typeof startWorklet>>;

/** A loaded worklet with the real song (the song only supplies a running engine and wavetables). */
export async function loadKlysWorklet(song = 'public/data/songs/klystrack/Ocean Loader III.kt'): Promise<KlysWorklet> {
  const w = await startWorklet('klystrack', 'Klystrack', klysTransform);
  await w.send({ type: 'loadSong', buffer: songBuffer(song) });
  await w.send({ type: 'stop' });
  return w;
}

export interface Rendered { samples: Float32Array; /** mono mix, SAMPLE_RATE */ }

/** Put `inst` in slot `idx` (one setInstrumentData message), sound `note` for `holdSeconds`, then release for the rest of `totalSeconds`. */
export async function renderKlysInstrument(
  w: KlysWorklet, idx: number, inst: KlysNativeInstrument, note: number, holdSeconds: number, totalSeconds: number,
): Promise<Float32Array> {
  const { packKlysInstrument } = await import('@/engine/klystrack/KlysEngine');
  const out = stereoOutputs(1);
  await w.send({ type: 'setInstrumentData', idx, data: packKlysInstrument(klysInstrumentToEngine(inst)).buffer });
  await w.send({ type: 'previewNoteOn', inst: idx, note });
  const blocks = Math.ceil((totalSeconds * SAMPLE_RATE) / 128);
  const holdBlocks = Math.ceil((holdSeconds * SAMPLE_RATE) / 128);
  const mono = new Float32Array(blocks * 128);
  for (let b = 0; b < blocks; b++) {
    if (b === holdBlocks) await w.send({ type: 'previewNoteOff' });
    w.proc.process([], out);
    for (let k = 0; k < 128; k++) mono[b * 128 + k] = (out[0][0][k] + out[0][1][k]) / 2;
  }
  return mono;
}

export const dbOf = (x: number): number => 20 * Math.log10(Math.max(x, 1e-9));

export function rmsOf(s: Float32Array, fromSec: number, toSec: number): number {
  const a = Math.floor(fromSec * SAMPLE_RATE), b = Math.min(s.length, Math.floor(toSec * SAMPLE_RATE));
  let sum = 0;
  for (let i = a; i < b; i++) sum += s[i] * s[i];
  return Math.sqrt(sum / Math.max(1, b - a));
}

export const peakOf = (s: Float32Array): number => s.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
      }
    }
  }
}

/** Spectral centroid in Hz of the N-sample (default 4096) Hann window starting at `atSec`; 0 for a silent window. */
export function centroidAt(s: Float32Array, atSec: number, N = 4096): number {
  const start = Math.floor(atSec * SAMPLE_RATE);
  const re = new Float64Array(N), im = new Float64Array(N);
  let energy = 0;
  for (let i = 0; i < N; i++) {
    const v = (s[start + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
    re[i] = v; energy += v * v;
  }
  if (energy < 1e-12) return 0;
  fft(re, im);
  let num = 0, den = 0;
  for (let k = 1; k < N / 2; k++) {
    const mag = Math.hypot(re[k], im[k]);
    num += (k * SAMPLE_RATE / N) * mag; den += mag;
  }
  return den > 0 ? num / den : 0;
}

/**
 * The feature vector two presets are compared by: the RMS envelope in dB over 12 bins across 1.2 s (floor -80 dB)
 * followed by the log2 spectral centroid at 0.05 s and 0.5 s, scaled so one octave of centroid weighs 6 dB.
 */
export function featuresOf(s: Float32Array): number[] {
  const env: number[] = [];
  const edges = [0, 0.02, 0.05, 0.1, 0.17, 0.25, 0.35, 0.5, 0.65, 0.8, 1.0, 1.2];
  for (let i = 0; i < edges.length - 1; i++) env.push(Math.max(-80, dbOf(rmsOf(s, edges[i], edges[i + 1]))));
  const c = [0.03, 0.5].map((t) => { const hz = centroidAt(s, t); return hz > 0 ? Math.log2(hz) * 6 : -60; });
  return [...env, ...c];
}

/** Root-mean-square difference between two feature vectors (dB-like units). */
export function featureDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum / a.length);
}

/**
 * Fundamental in Hz of the `len`-second window centred on `atSec`, by normalised autocorrelation over lags for
 * `minHz`..`maxHz`; 0 when the window is silent or has no clear period (correlation below 0.3, i.e. noise).
 */
export function fundamentalAt(s: Float32Array, atSec: number, len = 0.03, minHz = 30, maxHz = 4000): number {
  const n = Math.floor(len * SAMPLE_RATE);
  const a = Math.max(0, Math.floor(atSec * SAMPLE_RATE - n / 2));
  const maxLag = Math.min(Math.floor(SAMPLE_RATE / minHz), n - 8), minLag = Math.max(2, Math.floor(SAMPLE_RATE / maxHz));
  let e0 = 0;
  for (let i = 0; i < n; i++) e0 += (s[a + i] ?? 0) ** 2;
  if (e0 < 1e-9) return 0;
  const corr: number[] = [];
  let max = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let c = 0, e1 = 0;
    for (let i = 0; i + lag < n; i++) { c += (s[a + i] ?? 0) * (s[a + i + lag] ?? 0); e1 += (s[a + i + lag] ?? 0) ** 2; }
    corr[lag] = c / Math.sqrt(e0 * Math.max(e1, 1e-12));
    if (corr[lag] > max) max = corr[lag];
  }
  if (max < 0.5) return 0;
  // the shortest lag that is a local maximum within 15 % of the best correlation (not a multiple of the period)
  let bestLag = 0;
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (corr[lag] > corr[lag - 1] && corr[lag] >= corr[lag + 1] && corr[lag] >= 0.85 * max) { bestLag = lag; break; }
  }
  return bestLag ? SAMPLE_RATE / bestLag : 0;
}

/** Spectral flatness (geometric / arithmetic mean of the magnitude spectrum, 1 = white noise) of the window at `atSec`, 100 Hz..16 kHz. */
export function flatnessAt(s: Float32Array, atSec: number): number {
  const N = 2048, start = Math.floor(atSec * SAMPLE_RATE);
  const re = new Float64Array(N), im = new Float64Array(N);
  let energy = 0;
  for (let i = 0; i < N; i++) { const v = (s[start + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1))); re[i] = v; energy += v * v; }
  if (energy < 1e-12) return 0;
  fft(re, im);
  let logSum = 0, sum = 0, n = 0;
  for (let k = Math.ceil(100 * N / SAMPLE_RATE); k < Math.floor(16000 * N / SAMPLE_RATE); k++) {
    const m = Math.hypot(re[k], im[k]) + 1e-9; logSum += Math.log(m); sum += m; n++;
  }
  return Math.exp(logSum / n) / (sum / n);
}

/** First time (s) after the peak 10 ms window at which a 10 ms window is `drop` dB below that peak; -1 if never within the render. */
export function decayTime(s: Float32Array, drop: number): number {
  const hop = 0.01, count = Math.floor(s.length / SAMPLE_RATE / hop);
  const levels = Array.from({ length: count }, (_, i) => dbOf(rmsOf(s, i * hop, (i + 1) * hop)));
  const peak = Math.max(...levels), pi = levels.indexOf(peak);
  for (let i = pi; i < count; i++) if (levels[i] < peak - drop) return i * hop;
  return -1;
}

/** Index in ms of the first sample reaching 90 % of the render's peak. */
export function peakTimeMs(s: Float32Array): number {
  const pk = peakOf(s);
  for (let i = 0; i < s.length; i++) if (Math.abs(s[i]) >= pk * 0.9) return (i / SAMPLE_RATE) * 1000;
  return -1;
}

/** The strongest FFT bin between `lo` and `hi` Hz in the 8192-sample window at `atSec`, and how far it stands above the median magnitude of 100 Hz..4 kHz (a ratio; about 1-2 for noise). */
export function bandPeak(s: Float32Array, atSec: number, lo: number, hi: number): { freq: number; prominence: number } {
  const N = 8192, start = Math.floor(atSec * SAMPLE_RATE);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = (s[start + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  fft(re, im);
  const mags: number[] = [];
  let best = 0, bestK = 0;
  for (let k = Math.ceil(100 * N / SAMPLE_RATE); k < Math.floor(4000 * N / SAMPLE_RATE); k++) {
    const m = Math.hypot(re[k], im[k]); mags.push(m);
    const f = k * SAMPLE_RATE / N;
    if (f >= lo && f <= hi && m > best) { best = m; bestK = k; }
  }
  mags.sort((a, b) => a - b);
  return { freq: bestK * SAMPLE_RATE / N, prominence: best / Math.max(mags[Math.floor(mags.length / 2)], 1e-9) };
}

/**
 * Instantaneous fundamental of a tonal drum or bass: the signal is low-passed (two one-pole stages at `lpHz`) and each
 * interval between rising zero crossings is one period. Returns [time s, Hz] pairs; the noise click of a kick is
 * cut by the low-pass, so a noisy onset yields few or no crossings rather than a wrong pitch.
 */
export function pitchTrack(s: Float32Array, lpHz = 700): Array<[number, number]> {
  const k = 1 - Math.exp((-2 * Math.PI * lpHz) / SAMPLE_RATE);
  const y = new Float32Array(s.length);
  const kd = 1 - Math.exp((-2 * Math.PI * 8) / SAMPLE_RATE); // a 8 Hz high-pass takes the oscillator's DC offset away
  let a = 0, b = 0, dc = 0;
  for (let i = 0; i < s.length; i++) { dc += kd * (s[i] - dc); a += k * (s[i] - dc - a); b += k * (a - b); y[i] = b; }
  const out: Array<[number, number]> = [];
  let last = -1;
  let peak = 0; // running amplitude: crossings of a signal that has died away are noise, not a period
  for (let i = 1; i < y.length; i++) {
    peak = Math.max(Math.abs(y[i]), peak * 0.9995);
    if (y[i - 1] <= 0 && y[i] > 0 && peak > 0.003) {
      const t = i - y[i] / (y[i] - y[i - 1]);
      if (last >= 0) out.push([t / SAMPLE_RATE, SAMPLE_RATE / (t - last)]);
      last = t;
    }
  }
  return out;
}

/** The median of the track's frequencies in [from, to] seconds; 0 if there is none. */
export function trackMedian(track: Array<[number, number]>, from: number, to: number): number {
  const v = track.filter(([t]) => t >= from && t <= to).map(([, f]) => f).sort((x, y) => x - y);
  return v.length ? v[Math.floor(v.length / 2)] : 0;
}

/** The highest frequency in [from, to] seconds; 0 if there is none. */
export function trackMax(track: Array<[number, number]>, from: number, to: number): number {
  return Math.max(0, ...track.filter(([t]) => t >= from && t <= to).map(([, f]) => f));
}

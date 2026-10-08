/**
 * Extended audio analysis for the Auto DJ (plan sections 4, 22, 49, 50):
 * activity timelines (bass, drums, harmonic, vocal, brightness), the loudness
 * set (integrated, short-term, peak, true peak, dynamic range, crest), spectral
 * balance and a chroma timeline for the local key.
 *
 * Pure: a mono PCM buffer in, numbers out. Runs inside the DJ analysis worker
 * (one pass over the track) and in tests on synthetic signals. No essentia.
 */
import type { ExtendedAnalysis, SpectralAnalysis } from './types';

export const EXTENDED_ANALYSIS_VERSION = 2;

const FRAME = 2048;
const HOP_SEC = 0.25;
const KEY_HOP_SEC = 8;
const SHORT_TERM_SEC = 3;

// ── FFT ─────────────────────────────────────────────────────────────────────

const HANN = new Float32Array(FRAME);
for (let i = 0; i < FRAME; i++) HANN[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1));

const BIT_REVERSE = new Uint16Array(FRAME);
{
  const bits = Math.log2(FRAME);
  for (let i = 0; i < FRAME; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    BIT_REVERSE[i] = r;
  }
}
const COS = new Float32Array(FRAME / 2);
const SIN = new Float32Array(FRAME / 2);
for (let i = 0; i < FRAME / 2; i++) {
  COS[i] = Math.cos((-2 * Math.PI * i) / FRAME);
  SIN[i] = Math.sin((-2 * Math.PI * i) / FRAME);
}

/** In-place radix-2 FFT of `re`/`im` (length FRAME). */
function fft(re: Float32Array, im: Float32Array): void {
  for (let i = 0; i < FRAME; i++) {
    const j = BIT_REVERSE[i];
    if (j > i) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let size = 2; size <= FRAME; size <<= 1) {
    const half = size >> 1;
    const step = FRAME / size;
    for (let start = 0; start < FRAME; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = COS[k * step];
        const wi = SIN[k * step];
        const a = start + k;
        const b = a + half;
        const tr = re[b] * wr - im[b] * wi;
        const ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
      }
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

/** Scale to 0..1 by the 95th percentile so one spike does not flatten the rest. */
export function normalizeTimeline(values: number[]): number[] {
  const ref = percentile(values.filter((v) => v > 0), 0.95);
  if (ref <= 0) return values.map(() => 0);
  return values.map((v) => Math.min(1, v / ref));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

const dB = (lin: number): number => (lin > 0 ? 20 * Math.log10(lin) : -100);

/** 4x oversampled inter-sample peak (windowed-sinc polyphase, 16 taps per phase). */
export function truePeakLinear(mono: Float32Array): number {
  const phases = [0.25, 0.5, 0.75];
  const taps = 16;
  const half = taps / 2;
  const kernels = phases.map((ph) => {
    const k = new Float32Array(taps);
    let sum = 0;
    for (let n = 0; n < taps; n++) {
      const x = n - half + 1 - ph;
      const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * (n + 0.5)) / taps);
      k[n] = sinc * w;
      sum += k[n];
    }
    for (let n = 0; n < taps; n++) k[n] /= sum;
    return k;
  });
  let peak = 0;
  for (let i = 0; i < mono.length; i++) {
    const a = Math.abs(mono[i]);
    if (a > peak) peak = a;
  }
  // Only the loud neighbourhoods can hold an inter-sample peak above the sample peak.
  const threshold = peak * 0.7;
  for (let i = half; i < mono.length - half; i++) {
    if (Math.abs(mono[i]) < threshold) continue;
    for (const k of kernels) {
      let acc = 0;
      for (let n = 0; n < taps; n++) acc += mono[i - half + 1 + n] * k[n];
      const a = Math.abs(acc);
      if (a > peak) peak = a;
    }
  }
  return peak;
}

// ── Main ────────────────────────────────────────────────────────────────────

export interface ExtendedAnalysisOptions {
  /** Beat times in seconds, for the kick strength. */
  beats?: number[];
  /** Instrument probe: called per hop with the voice-proxy factors (tests check the instrument). */
  probe?: (hop: number, info: { f0Hz: number; dominance: number; weight: number; harmonicity: number; salience: number; top: Array<{ f0Hz: number; hs: number; h1: number }> }) => void;
}

/**
 * One pass over the track. ~1500 frames for a six minute track at 44.1 kHz.
 */
export function computeExtendedAnalysis(
  mono: Float32Array,
  sampleRate: number,
  opts: ExtendedAnalysisOptions = {},
): ExtendedAnalysis {
  const hopSamples = Math.max(1, Math.round(HOP_SEC * sampleRate));
  const hops = Math.max(1, Math.floor(mono.length / hopSamples));
  const binHz = sampleRate / FRAME;
  const bin = (hz: number) => Math.min(FRAME / 2 - 1, Math.max(0, Math.round(hz / binHz)));

  const B_SUB_LO = bin(30), B_SUB_HI = bin(80);
  const B_BASS_LO = bin(30), B_BASS_HI = bin(150);
  const B_MUD_LO = bin(150), B_MUD_HI = bin(400);
  const B_MID_LO = bin(150), B_MID_HI = bin(2000);
  const B_VOX_HI = bin(3400);
  // Pitch-salience f0 range for the voice proxy: a sung line sits between
  // ~165 Hz (above the bass register) and 1 kHz and moves; a pad holds, a hat has no harmonics.
  const F0_LO = bin(180), F0_HI = bin(1000);
  const f0Track: number[] = new Array(hops).fill(0);
  const B_HIGH_LO = bin(2000), B_HIGH_HI = FRAME / 2 - 1;
  const B_CHROMA_LO = bin(80), B_CHROMA_HI = bin(2000);
  const B_FLUX_LO = bin(60), B_FLUX_HI = bin(8000);

  const re = new Float32Array(FRAME);
  const im = new Float32Array(FRAME);
  let prevMag: Float32Array | null = null;

  const bass: number[] = new Array(hops).fill(0);
  const sub: number[] = new Array(hops).fill(0);
  const mud: number[] = new Array(hops).fill(0);
  const mid: number[] = new Array(hops).fill(0);
  const high: number[] = new Array(hops).fill(0);
  const total: number[] = new Array(hops).fill(0);
  const flux: number[] = new Array(hops).fill(0);
  const bassFlux: number[] = new Array(hops).fill(0);
  const harmonic: number[] = new Array(hops).fill(0);
  const vocal: number[] = new Array(hops).fill(0);
  const centroid: number[] = new Array(hops).fill(0);
  const flatness: number[] = new Array(hops).fill(0);
  const bassPeakBin: number[] = new Array(hops).fill(-1);
  const chromaFrames: number[][] = [];

  // Sub-frames of FRAME/2 so a 70 ms hit between two hop centres is not
  // missed: band energies are averaged per hop, the onset flux takes the max.
  const SUB = FRAME >> 1;
  const subPerHop = Math.max(1, Math.floor(hopSamples / SUB));

  for (let h = 0; h < hops; h++) {
    const chroma = new Array(12).fill(0);
    let hopFlux = 0, hopBassFlux = 0;
    let bp = -1, bpv = 0;
    let nSub = 0;
    let salienceSum = 0;
    let hopSalience = 0;
    let hopF0 = 0;
    for (let sIdx = 0; sIdx < subPerHop; sIdx++) {
      const center = h * hopSamples + sIdx * SUB + (SUB >> 1);
      const start = center - (FRAME >> 1);
      for (let i = 0; i < FRAME; i++) {
        const idx = start + i;
        re[i] = idx >= 0 && idx < mono.length ? mono[idx] * HANN[i] : 0;
        im[i] = 0;
      }
      fft(re, im);
      const mag = new Float32Array(FRAME / 2);
      let sum = 0;
      let sumPow = 0;
      let weighted = 0;
      let logSum = 0;
      let linSum = 0;
      for (let k = 0; k < FRAME / 2; k++) {
        const m = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
        mag[k] = m;
        sum += m;
        sumPow += m * m;
        weighted += m * k;
        logSum += Math.log(m + 1e-9);
        linSum += m + 1e-9;
      }
      nSub++;
      total[h] += sum;
      centroid[h] += sum > 0 ? (weighted / sum) * binHz : 0;
      flatness[h] += Math.exp(logSum / (FRAME / 2)) / (linSum / (FRAME / 2));

      const band = (lo: number, hi: number) => {
        let s = 0;
        for (let k = lo; k <= hi; k++) s += mag[k];
        return s;
      };
      const tonalness = (lo: number, hi: number) => {
        let ls = 0, s = 0, n = 0;
        for (let k = lo; k <= hi; k++) { ls += Math.log(mag[k] + 1e-9); s += mag[k] + 1e-9; n++; }
        if (n === 0) return 0;
        const flat = Math.exp(ls / n) / (s / n);
        return 1 - Math.min(1, Math.max(0, flat));
      };

      // A bassline is a tone in the bass band; a kick is a broad decaying
      // sweep there. Weight the band by its tonalness so the bass timeline
      // means "bass playing", while lowRatio keeps the raw low-end weight.
      bass[h] += band(B_BASS_LO, B_BASS_HI) * (0.35 + 0.65 * tonalness(B_BASS_LO, B_BASS_HI));
      sub[h] += band(B_SUB_LO, B_SUB_HI);
      mud[h] += band(B_MUD_LO, B_MUD_HI);
      mid[h] += band(B_MID_LO, B_MID_HI);
      high[h] += band(B_HIGH_LO, B_HIGH_HI);
      harmonic[h] += band(B_MID_LO, B_MID_HI) * tonalness(B_MID_LO, B_MID_HI);
      // Harmonic salience: the f0 whose first five harmonics carry the most
      // of the frame (peaks spread over neighbouring bins), as a share of the
      // whole frame so an empty band cannot look like a voice.
      {
        // Power (not magnitude) so broadband noise with many small bins does
        // not outweigh a few strong harmonic peaks.
        // The whole main lobe (three bins) of each partial, in power.
        const p3 = (kk: number) => {
          if (kk + 1 >= FRAME / 2 || kk < 1) return 0;
          return mag[kk - 1] * mag[kk - 1] + mag[kk] * mag[kk] + mag[kk + 1] * mag[kk + 1];
        };
        let bestSal = 0, bestK = 0, bestHarm = 0;
        const top: Array<{ f0Hz: number; hs: number; h1: number }> = [];
        // Quarter-bin f0 steps: an integer-bin f0 misses the fifth partial by
        // two bins at 400 Hz.
        for (let kf = F0_LO; kf <= F0_HI; kf += 0.25) {
          const h1 = p3(Math.round(kf));
          let rest = 0;
          for (let hh = 2; hh <= 5; hh++) rest += p3(Math.round(kf * hh));
          const hs = h1 + rest;
          if (hs > bestSal) { bestSal = hs; bestK = kf; bestHarm = rest / (h1 + 1e-12); }
          if (opts.probe) { top.push({ f0Hz: kf * binHz, hs, h1 }); }
        }
        // A voice is a harmonic series (overtones 2-5 together carry about half
        // the fundamental's power); a pure pad tone is not.
        const harmonicity = Math.min(1, bestHarm * 2);
        let bandPow = 0;
        for (let k = F0_LO; k <= B_VOX_HI; k++) bandPow += mag[k] * mag[k];
        const dominance = Math.min(1, bestSal / (bandPow + 1e-12));
        const weight = Math.min(1, (bandPow / (sumPow + 1e-12)) * 3);
        const salience = dominance * weight * harmonicity;
        if (salience > hopSalience) { hopSalience = salience; hopF0 = bestK; }
        if (opts.probe && sIdx === 0) opts.probe(h, { f0Hz: bestK * binHz, dominance, weight, harmonicity, salience, top: top.sort((a, b) => b.hs - a.hs).slice(0, 4) });
        salienceSum += salience;
      }

      for (let k = B_BASS_LO; k <= B_BASS_HI; k++) if (mag[k] > bpv) { bpv = mag[k]; bp = k; }

      if (prevMag) {
        let f = 0, prevSum = 0;
        for (let k = B_FLUX_LO; k <= B_FLUX_HI; k++) {
          const d = mag[k] - prevMag[k];
          if (d > 0) f += d;
          prevSum += prevMag[k];
        }
        // Relative rise: a hit after silence is a hit, a loud pad is not.
        const rel = f / (prevSum + f + 1e-6);
        if (rel > hopFlux && prevSum + f > 1e-3) hopFlux = rel;
        let bf = 0;
        for (let k = B_BASS_LO; k <= B_BASS_HI; k++) {
          const d = mag[k] - prevMag[k];
          if (d > 0) bf += d;
        }
        if (bf > hopBassFlux) hopBassFlux = bf;
      }
      prevMag = mag;

      for (let k = B_CHROMA_LO; k <= B_CHROMA_HI; k++) {
        const hz = k * binHz;
        if (hz <= 0) continue;
        const midi = 69 + 12 * Math.log2(hz / 440);
        const pc = ((Math.round(midi) % 12) + 12) % 12;
        chroma[pc] += mag[k];
      }
    }
    const inv = 1 / Math.max(1, nSub);
    total[h] *= inv; centroid[h] *= inv; flatness[h] *= inv;
    bass[h] *= inv; sub[h] *= inv; mud[h] *= inv; mid[h] *= inv; high[h] *= inv;
    harmonic[h] *= inv;
    vocal[h] = salienceSum * inv;
    f0Track[h] = hopSalience > 0.2 ? hopF0 : 0;
    flux[h] = hopFlux;
    bassFlux[h] = hopBassFlux;
    bassPeakBin[h] = bp;
    chromaFrames.push(chroma);
  }

  // ── Loudness (time domain) ───────────────────────────────────────────────
  let sumSq = 0;
  let peak = 0;
  for (let i = 0; i < mono.length; i++) {
    const v = mono[i];
    sumSq += v * v;
    const a = Math.abs(v);
    if (a > peak) peak = a;
  }
  const rms = mono.length > 0 ? Math.sqrt(sumSq / mono.length) : 0;
  const integratedDb = dB(rms);
  const peakDb = dB(peak);
  const truePeakDb = dB(truePeakLinear(mono));

  const shortWindow = Math.round(SHORT_TERM_SEC * sampleRate);
  const shortTermDb: number[] = new Array(hops).fill(-100);
  // Prefix sum of squares for O(1) windows.
  const prefix = new Float64Array(mono.length + 1);
  for (let i = 0; i < mono.length; i++) prefix[i + 1] = prefix[i] + mono[i] * mono[i];
  for (let h = 0; h < hops; h++) {
    const center = h * hopSamples + (hopSamples >> 1);
    const s = Math.max(0, center - (shortWindow >> 1));
    const e = Math.min(mono.length, center + (shortWindow >> 1));
    const n = e - s;
    shortTermDb[h] = n > 0 ? dB(Math.sqrt((prefix[e] - prefix[s]) / n)) : -100;
  }
  const audible = shortTermDb.filter((v) => v > -70);
  const shortTermMaxDb = audible.length ? Math.max(...audible) : -100;
  const dynamicRangeDb = audible.length ? percentile(audible, 0.95) - percentile(audible, 0.1) : 0;
  const crestFactorDb = peakDb - integratedDb;

  // ── Spectral summary ─────────────────────────────────────────────────────
  const totalSum = total.reduce((a, b) => a + b, 0) || 1;
  const lowRatio = bass.reduce((a, b) => a + b, 0) / totalSum;
  const midRatio = mid.reduce((a, b) => a + b, 0) / totalSum;
  const highRatio = high.reduce((a, b) => a + b, 0) / totalSum;
  const mudRatio = mud.reduce((a, b) => a + b, 0) / totalSum;
  const centroidHz = mean(centroid.filter((_, h) => total[h] > 0));
  const brightness = Math.min(1, centroidHz / 4000);
  const spectral: SpectralAnalysis = {
    centroidHz,
    lowRatio,
    midRatio,
    highRatio,
    flatness: mean(flatness),
    brightness,
    muddiness: Math.min(1, mudRatio * 2),
  };

  // ── Bass summary ─────────────────────────────────────────────────────────
  const bassSum = bass.reduce((a, b) => a + b, 0) || 1;
  const subRatio = sub.reduce((a, b) => a + b, 0) / bassSum;
  let kickStrength = 0;
  const beats = opts.beats ?? [];
  if (beats.length > 2) {
    const meanBassFlux = mean(bassFlux) || 1e-9;
    let atBeats = 0;
    let n = 0;
    for (const t of beats) {
      const h = Math.round(t / HOP_SEC);
      if (h >= 0 && h < hops) { atBeats += bassFlux[h]; n++; }
    }
    kickStrength = n > 0 ? Math.min(1, (atBeats / n) / (meanBassFlux * 2)) : 0;
  }
  const activeBassBins = bassPeakBin.filter((b, h) => b >= 0 && bass[h] > percentile(bass, 0.5));
  const distinct = new Set(activeBassBins).size;
  const melodic = distinct >= 4;

  // ── Timelines ───────────────────────────────────────────────────────────
  // Band activities are the band's share of the frame energy (absolute, so a
  // silent track stays silent and a bass tone does not light the vocal band),
  // scaled so a typical full mix sits around 0.5-1. Onsets are a relative
  // rise, normalised by the 95th percentile but only above an absolute floor.
  const share = (band: number[], k: number) => band.map((v, i) => (total[i] > 1e-6 ? Math.min(1, (v / total[i]) * k) : 0));
  const bassTl = share(bass, 2.2);
  const harmonicTl = share(harmonic, 2.5);
  // Voices move: weight the harmonic salience by how much the f0 changes
  // over a two second window. A held pad has salience and no movement.
  const movement: number[] = new Array(hops).fill(0);
  const same = (a: number, b: number) => a > 0 && b > 0 && Math.abs(a - b) / a <= 0.03;
  // A held reading: the same f0 on both sides. A candidate that flips every
  // hop (a chord's octave pairs trading places) never forms one.
  const held = f0Track.map((v, h) => v > 0 && (same(v, f0Track[h - 1] ?? 0) || same(v, f0Track[h + 1] ?? 0)));
  for (let h = 0; h < hops; h++) {
    let moves = 0, n = 0;
    for (let j = Math.max(1, h - 4); j <= Math.min(hops - 1, h + 4); j++) {
      const a = f0Track[j - 1], b = f0Track[j];
      if (a > 0 && b > 0) { n++; if (held[j - 1] && held[j] && !same(a, b)) moves++; }
    }
    movement[h] = n ? Math.min(1, (moves / n) * 2) : 0;
  }
  const vocalTl = smooth(vocal.map((v, h) => Math.min(1, v * (0.25 + 0.75 * movement[h]))), 2);
  // Onsets are relative rises (0..1); a static pad stays near zero whatever
  // its level, because the reference never drops below 0.15.
  const fluxRef = Math.max(percentile(flux.filter((v) => v > 0), 0.95), 0.15);
  const drumsTl = flux.map((v) => (v < 0.02 ? 0 : Math.min(1, v / fluxRef)));
  const brightTl = centroid.map((c) => Math.min(1, c / 6000));

  let firstTransient = 0;
  const fluxThreshold = 0.25;
  for (let h = 0; h < hops; h++) {
    if (drumsTl[h] > fluxThreshold) { firstTransient = h * HOP_SEC; break; }
  }

  // ── Chroma per key segment ───────────────────────────────────────────────
  const framesPerKeyHop = Math.max(1, Math.round(KEY_HOP_SEC / HOP_SEC));
  const chroma: number[][] = [];
  for (let s = 0; s < chromaFrames.length; s += framesPerKeyHop) {
    const acc = new Array(12).fill(0);
    let n = 0;
    for (let h = s; h < Math.min(chromaFrames.length, s + framesPerKeyHop); h++) {
      for (let pc = 0; pc < 12; pc++) acc[pc] += chromaFrames[h][pc];
      n++;
    }
    const mx = Math.max(...acc) || 1;
    chroma.push(acc.map((v) => (n > 0 ? v / mx : 0)));
  }

  return {
    version: EXTENDED_ANALYSIS_VERSION,
    hopSec: HOP_SEC,
    bass: bassTl,
    drums: drumsTl,
    harmonic: harmonicTl,
    vocal: vocalTl,
    brightness: brightTl,
    loudnessShortTermDb: shortTermDb,
    onsetFlux: drumsTl,
    keyHopSec: KEY_HOP_SEC,
    chroma,
    loudness: { integratedDb, shortTermMaxDb, peakDb, truePeakDb, dynamicRangeDb, crestFactorDb },
    spectral,
    bassSummary: { subRatio, kickStrength, melodic },
    firstTransient,
  };
}

/** Moving average with radius `r` hops. */
export function smooth(values: number[], r: number): number[] {
  if (r <= 0) return values.slice();
  const out = new Array(values.length).fill(0);
  for (let i = 0; i < values.length; i++) {
    let s = 0, n = 0;
    for (let j = Math.max(0, i - r); j <= Math.min(values.length - 1, i + r); j++) { s += values[j]; n++; }
    out[i] = n ? s / n : 0;
  }
  return out;
}

/**
 * stretchMetrics.ts - objective time-stretch / key-lock artifact measures.
 *
 * Compares a stretched output against the UNSTRETCHED source mapped onto the
 * output timeline (output frame t <-> source frame (t - latency) * rate), so no
 * "ideal" stretched reference is needed. All signals mono float32 at SR.
 *
 *  fluxCorr      correlation of the output's onset (spectral-flux) curve with
 *                the source's; doubled / dropped / smeared hits lower it. 1 = ideal.
 *  warbleDb      frame-to-frame jitter of 8 band energies relative to the
 *                source, away from onsets (sustained notes). WSOLA splices and
 *                phasiness raise it. Lower is better.
 *  onsetSharpness median output onset-flux peak / source onset-flux peak.
 *  lsdDb         log-spectral distance at mapped times (60 dB floor).
 *
 * Used by keyLockKeepsTransientsSharp.test.ts; the measurement that chose the
 * Key Lock engine is in thoughts/shared/research/2026-10-12_keylock-stretcher-measurement.md.
 */
export const SR = 48000;
const N = 1024, HOP = 256;

function fftMag(frame: Float64Array): Float64Array {
  // radix-2 real FFT via complex FFT
  const n = frame.length; const re = Float64Array.from(frame); const im = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len; const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) {
      const a = i + k, b = a + len / 2; const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
      re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
  }
  const m = new Float64Array(n / 2 + 1); for (let k = 0; k <= n / 2; k++) m[k] = Math.hypot(re[k], im[k]); return m;
}

export interface Spec { frames: Float64Array[]; /* dB */ flux: Float64Array; }
const win = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
export function spec(x: Float32Array): Spec {
  const count = Math.floor((x.length - N) / HOP);
  const frames: Float64Array[] = []; const flux = new Float64Array(count);
  const buf = new Float64Array(N);
  for (let f = 0; f < count; f++) {
    for (let i = 0; i < N; i++) buf[i] = x[f * HOP + i] * win[i];
    const m = fftMag(buf); const db = new Float64Array(m.length);
    for (let k = 0; k < m.length; k++) db[k] = 20 * Math.log10(m[k] + 1e-5);
    frames.push(db);
    if (f > 0) { let s = 0; const p = frames[f - 1]; for (let k = 1; k < m.length; k++) { const d = db[k] - p[k]; if (d > 0) s += d; } flux[f] = s / m.length; }
  }
  return { frames, flux };
}

export function onsets(flux: Float64Array): number[] {
  const out: number[] = []; const W = 16;
  for (let f = 2; f < flux.length - 2; f++) {
    const lo = Math.max(0, f - W), hi = Math.min(flux.length, f + W);
    const loc = Array.from(flux.subarray(lo, hi)).sort((a, b) => a - b); const med = loc[loc.length >> 1];
    if (flux[f] > flux[f - 1] && flux[f] >= flux[f + 1] && flux[f] > med + 2.5 && flux[f] > 3) {
      if (out.length && f - out[out.length - 1] < 6) { if (flux[f] > flux[out[out.length - 1]]) out[out.length - 1] = f; } else out.push(f);
    }
  }
  return out;
}

/** Lag (output frames) maximising correlation of two flux curves. */
export function bestLag(a: Float64Array, b: Float64Array, maxLag: number): number {
  let best = 0, bv = -Infinity;
  for (let lag = 0; lag <= maxLag; lag++) { let s = 0; for (let i = 0; i + lag < a.length && i < b.length; i++) s += a[i + lag] * b[i]; if (s > bv) { bv = s; best = lag; } }
  return best;
}

export interface Metrics {
  warbleDb: number; latencyMs: number; onsetSharpness: number; fluxCorr: number; lsdDb: number; spuriousPerSec: number; missedPct: number; preEchoDb: number;
}

/**
 * Compare a stretched output (output time t <-> source time (t - latency) * rate)
 * against the unstretched source. `timingRef` is a signal with the stretched
 * output's exact timing but no processing latency (the plain resampled deck
 * audio) - used only to measure latency.
 */
export function measure(src: Spec, out: Spec, rate: number, latencyFrames: number): Metrics {
  const mapped = (fo: number) => (fo - latencyFrames) * rate; // source frame (fractional)
  // Ideal flux curve at output timeline: source flux sampled at mapped frames (flux per frame scales ~ with rate, ignore).
  const ideal = new Float64Array(out.flux.length);
  for (let f = 0; f < ideal.length; f++) { const s = Math.round(mapped(f)); ideal[f] = s >= 1 && s < src.flux.length ? src.flux[s] : 0; }
  const startF = Math.ceil(latencyFrames) + 8; const endF = Math.min(out.flux.length, Math.floor(src.flux.length / rate + latencyFrames)) - 8;
  // Flux correlation
  let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, n = 0;
  for (let f = startF; f < endF; f++) { const a = out.flux[f], b = ideal[f]; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b; n++; }
  const fluxCorr = (sab - sa * sb / n) / Math.sqrt((saa - sa * sa / n) * (sbb - sb * sb / n));
  // Onset sharpness: peak output flux near each strong source onset / source onset flux
  const srcOn = onsets(src.flux).filter((f) => f / rate + latencyFrames > startF && f / rate + latencyFrames < endF);
  const ratios: number[] = [];
  for (const f of srcOn) { const fo = Math.round(f / rate + latencyFrames); let pk = 0; for (let d = -2; d <= 2; d++) pk = Math.max(pk, out.flux[fo + d] ?? 0); ratios.push(pk / src.flux[f]); }
  ratios.sort((a, b) => a - b); const onsetSharpness = ratios[ratios.length >> 1];
  // Spurious / missed onsets
  const outOn = onsets(out.flux).filter((f) => f > startF && f < endF);
  const tol = 4; // frames (~21 ms)
  const exp = srcOn.map((f) => f / rate + latencyFrames);
  const spurious = outOn.filter((f) => !exp.some((e) => Math.abs(e - f) <= tol)).length;
  const missed = exp.filter((e) => !outOn.some((f) => Math.abs(e - f) <= tol)).length;
  const secs = (endF - startF) * HOP / SR;
  // Pre-echo: mean energy (dB) 3..1 frames before an onset relative to the onset frame, output minus source.
  let pe = 0, pc = 0;
  for (const f of srcOn) { const fo = Math.round(f / rate + latencyFrames);
    const e = (S: Spec, i: number) => { const fr = S.frames[i]; if (!fr) return -100; let s = 0; for (let k = 0; k < fr.length; k++) s += 10 ** (fr[k] / 10); return 10 * Math.log10(s + 1e-12); };
    const pre = (S: Spec, c: number, step: number) => Math.max(e(S, c - 2 * step), e(S, c - 3 * step)) - e(S, c + 1);
    pe += pre(out, fo, 1) - pre(src, f, Math.max(1, Math.round(rate))); pc++; }
  // Log-spectral distance, frames compared at mapped times (dB floor -60 rel. frame max)
  let lsd = 0, lc = 0;
  for (let f = startF; f < endF; f += 2) { const s = Math.round(mapped(f)); const A = out.frames[f], B = src.frames[s]; if (!A || !B) continue;
    let mx = -200; for (const v of B) mx = Math.max(mx, v); if (mx < -40) continue; let acc = 0;
    for (let k = 2; k < A.length; k++) { const a = Math.max(A[k], mx - 60), b = Math.max(B[k], mx - 60); acc += (a - b) ** 2; }
    lsd += Math.sqrt(acc / (A.length - 2)); lc++; }
  // Sustain warble: band-energy residual (output minus time-mapped source), frame-to-frame
  // change, away from onsets. WSOLA splices / phasiness show up as residual jitter.
  const edges = [2, 4, 8, 16, 32, 64, 128, 256, 512];
  const bandE = (fr: Float64Array) => edges.slice(0, -1).map((lo, i) => { let s = 0; for (let k = lo; k < edges[i + 1]; k++) s += 10 ** (fr[k] / 10); return 10 * Math.log10(s / (edges[i + 1] - lo) + 1e-10); });
  const srcBands = src.frames.map(bandE);
  const nearOnset = new Uint8Array(out.flux.length + 16);
  for (const f of onsets(src.flux)) { const fo = Math.round(f / rate + latencyFrames); for (let d = -4; d <= 10; d++) if (fo + d >= 0) nearOnset[fo + d] = 1; }
  let wj = 0, wc = 0; let prev: number[] | null = null;
  for (let f = startF; f < endF; f++) {
    const s = mapped(f); const s0 = Math.floor(s), t = s - s0; const A = out.frames[f];
    if (!A || !srcBands[s0 + 1] || nearOnset[f]) { prev = null; continue; }
    const ob = bandE(A); const res = ob.map((v, i) => v - (srcBands[s0][i] * (1 - t) + srcBands[s0 + 1][i] * t));
    const loud = srcBands[s0].map((v) => v > -70);
    if (prev) { for (let i = 0; i < res.length; i++) if (loud[i]) { wj += (res[i] - prev[i]) ** 2; wc++; } }
    prev = res;
  }
  return { warbleDb: Math.sqrt(wj / Math.max(1, wc)), latencyMs: latencyFrames * HOP / SR * 1000, onsetSharpness, fluxCorr, lsdDb: lsd / lc, spuriousPerSec: spurious / secs, missedPct: 100 * missed / Math.max(1, exp.length), preEchoDb: pe / Math.max(1, pc) };
}
export const HOP_SAMPLES = HOP;

/** AudioBufferSourceNode playbackRate as Chrome renders it: linear interpolation. */
export function resampleLinear(x: Float32Array, rate: number): Float32Array {
  const n = Math.floor((x.length - 1) / rate); const y = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = i * rate; const j = Math.floor(p); const f = p - j; y[i] = x[j] * (1 - f) + x[j + 1] * f; }
  return y;
}

/** Click train (every 250 ms) for latency probes. */
export function clickTrain(seconds: number): Float32Array {
  const x = new Float32Array(seconds * SR);
  for (let t = SR / 4; t + 48 < x.length; t += SR / 4) for (let k = 0; k < 48; k++) x[t + k] = (k % 2 ? -1 : 1) * 0.5 * Math.exp(-k / 8);
  return x;
}

function onsetEnvelope(x: Float32Array): Float32Array {
  const D = 8; const n = Math.floor(x.length / D); const e = new Float32Array(n); let a = 0;
  for (let i = 0; i < n; i++) { let m = 0; for (let k = 0; k < D; k++) m = Math.max(m, Math.abs(x[i * D + k])); a = Math.max(m, a * 0.97); e[i] = a; }
  const h = new Float32Array(n); for (let i = 1; i < n; i++) h[i] = Math.max(0, e[i] - e[i - 1]);
  return h;
}

/** Processing latency in samples (8-sample resolution): lag maximising onset-envelope correlation of out against input. */
export function latencySamples(out: Float32Array, input: Float32Array, maxMs = 400): number {
  const a = onsetEnvelope(out), b = onsetEnvelope(input); const maxLag = Math.round(maxMs / 1000 * SR / 8);
  let best = 0, bv = -Infinity;
  for (let lag = 0; lag <= maxLag; lag++) { let s = 0; for (let i = 0; i + lag < a.length && i < b.length; i++) s += a[i + lag] * b[i]; if (s > bv) { bv = s; best = lag; } }
  return best * 8;
}

/**
 * The S950 record grit (owner decision O4, 2026-10-12; scratch ledger SCR-PG-D2; reference
 * `tools/sampler.py process(x, "s950", 22050, dither=True)` :56-142 and `scratch._norm`): the
 * demo's records are mono at 22,050 Hz through its S950 sampler chain - input saturation, an
 * anti-alias low pass, sample-rate reduction by 2 with 12 % of the fold kept, 12-bit quantisation
 * with headroom and dither, the "dark linear" interpolation colour, the output filter and a noise
 * floor - then peak-normalised. A scratch-bus setting, on by default, switchable to the clean record.
 *
 * Numbers are the reference's `PROFILES["s950"]`; the filters are scipy `butter(2)` low passes
 * (bilinear with prewarp, `lfilter`), the generators numpy `RandomState` (dither seed 7, the noise
 * floor seed 1), so a Python fixture replays the chain.
 */
import { NumpyRandomState, TT_RATE } from '@/engine/turntable/turntableSim';
import { lp, resamplePoly } from './refDsp';

export const S950 = { bits: 12, decim: 2, aaCut: 8000, alias: 0.12, inDrive: 0.03, outLp: 7500, interpLp: 7000, noise: 0.002, peak: 0.8 } as const;

/** Reachability sentinel: records put through the grit. */
export const scratchGritStats = { transforms: 0 };

/** numpy `round`: half to even. */
export function roundHalfEven(v: number): number {
  const r = Math.round(v);
  return Math.abs(v - Math.trunc(v)) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

/**
 * The S950 chain on a mono signal at 22,050 Hz (`sampler.process(x, "s950", 22050, dither=True, seed=0)`),
 * then `scratch._norm`, in float64: the filters are synth_dsp `lp` (scipy butter + lfilter, `refDsp`).
 */
export function s950(input: ArrayLike<number>, rate = TT_RATE): Float64Array {
  const n = input.length;
  let y: Float64Array = new Float64Array(n);
  // input saturation
  for (let i = 0; i < n; i++) y[i] = Math.tanh(input[i]! * (1.0 + 4.0 * S950.inDrive));
  // anti-alias before the rate reduction
  y = lp(y, S950.aaCut, rate);
  // sample-rate reduction with controlled aliasing: zero-order hold, `alias` of it kept raw
  const held = new Float64Array(n);
  for (let i = 0; i < n; i++) held[i] = y[i - (i % S950.decim)]!;
  const smooth = lp(held, rate / (2.0 * S950.decim), rate);
  for (let i = 0; i < n; i++) y[i] = S950.alias * held[i]! + (1.0 - S950.alias) * smooth[i]!;
  // 12-bit quantisation with headroom, mild saturation and dither
  let m = 0;
  for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(y[i]!));
  m += 1e-9;
  const q = 2 ** (S950.bits - 1);
  const dither = new NumpyRandomState(7);
  for (let i = 0; i < n; i++) {
    let v = y[i]! / m * S950.peak;
    v = Math.tanh(v * 1.05) / 1.05;
    v = v + dither.uniform(-0.5, 0.5) / q;
    y[i] = roundHalfEven(v * q) / q * m / S950.peak;
  }
  // "dark linear" interpolation colour, the output filter
  y = lp(y, S950.interpLp, rate);
  y = lp(y, S950.outLp, rate);
  // the noise floor (synth_dsp.noise('white', seed + 1))
  const noise = new NumpyRandomState(1);
  for (let i = 0; i < n; i++) y[i] = y[i]! + S950.noise * noise.uniform(-1, 1);
  // scratch._norm
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(y[i]!));
  const den = peak + 1e-9;
  for (let i = 0; i < n; i++) y[i] = y[i]! / den;
  return y;
}

/**
 * A pack record as the demo's bank reads it (`scratch_bank._read_wav` at 22,050 Hz, then the S950):
 * PCM decoded from the WAV bytes (8 / 16 / 24 / 32 bit), the channels averaged, `resample_ratio`
 * (scipy resample_poly, trimmed to len / ratio, float32), peak-normalised in float32, the S950.
 * The browser's decoder would resample to the context rate; the demo's own steps are used instead.
 */
export function demoRecordPcm(bytes: ArrayBuffer, rate = TT_RATE, opts: { grit?: boolean } = {}): Float64Array {
  const v = new DataView(bytes);
  let off = 12, fmt: { ch: number; sr: number; bits: number } | null = null, data: [number, number] | null = null;
  while (off + 8 <= v.byteLength) {
    const id = String.fromCharCode(v.getUint8(off), v.getUint8(off + 1), v.getUint8(off + 2), v.getUint8(off + 3));
    const size = v.getUint32(off + 4, true);
    if (id === 'fmt ') fmt = { ch: v.getUint16(off + 10, true), sr: v.getUint32(off + 12, true), bits: v.getUint16(off + 22, true) };
    else if (id === 'data') data = [off + 8, Math.min(size, v.byteLength - off - 8)];
    off += 8 + size + (size & 1);
  }
  if (!fmt || !data) throw new Error('demoRecordPcm: not a PCM WAV');
  const sw = fmt.bits / 8, frames = Math.floor(data[1] / (sw * fmt.ch));
  const d = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let c = 0; c < fmt.ch; c++) {
      const p = data[0] + (f * fmt.ch + c) * sw;
      let s: number;
      if (sw === 2) s = v.getInt16(p, true) / 32768.0;
      else if (sw === 3) { let x = v.getUint8(p) | (v.getUint8(p + 1) << 8) | (v.getUint8(p + 2) << 16); if (x >= 0x800000) x -= 0x1000000; s = x / 8388608.0; }
      else if (sw === 1) s = (v.getUint8(p) - 128) / 128.0;
      else s = v.getInt32(p, true) / 2.0 ** 31;
      sum += s;
    }
    // numpy mean(1): the sum over the channels, divided by their count
    d[f] = fmt.ch > 1 ? sum / fmt.ch : sum;
  }
  return demoMonoPcm(d, fmt.sr, rate, opts);
}

/**
 * A mono signal at `srcRate` read the way the demo's bank reads a WAV after decoding (`_read_wav`): resampled
 * to `rate` (`resample_ratio`: resample_poly by the rational, trimmed to n, float32), peak-normalised in
 * float32, then the S950 unless `grit` is false. A tracker deck's sample takes this path without the grit.
 */
export function demoMonoPcm(mono: ArrayLike<number>, srcRate: number, rate = TT_RATE, opts: { grit?: boolean } = {}): Float64Array {
  let d32: Float32Array;
  if (srcRate !== rate) {
    // synth_dsp.resample_ratio(x, sr_in / sr_out): resample_poly by the rational, trimmed to n, float32
    const ratio = srcRate / rate;
    const n = Math.max(1, Math.trunc(mono.length / ratio));
    const [up, down] = limitDenominator(1.0 / ratio, 2000);
    const y = resamplePoly(mono, up, down);
    d32 = new Float32Array(n);
    for (let i = 0; i < n && i < y.length; i++) d32[i] = y[i]!;
  } else {
    d32 = Float32Array.from(mono);
  }
  // d / (max|d| + 1e-9), in float32 (numpy keeps the array's type)
  let m = 0;
  for (let i = 0; i < d32.length; i++) m = Math.max(m, Math.abs(d32[i]!));
  const den = Math.fround(m + Math.fround(1e-9));
  const d = new Float64Array(d32.length);
  for (let i = 0; i < d32.length; i++) d[i] = Math.fround(d32[i]! / den);
  if (opts.grit === false) return d;
  scratchGritStats.transforms++;
  return s950(d, rate);
}

/** Python `Fraction(x).limit_denominator(maxDen)` as [numerator, denominator]. */
function limitDenominator(x: number, maxDen: number): [number, number] {
  // the exact binary fraction of x, then the best rational with a denominator <= maxDen (CPython's algorithm)
  let [n, d] = exactFraction(x);
  if (d <= maxDen) return [n, d];
  let p0 = 0, q0 = 1, p1 = 1, q1 = 0;
  const n0 = n, d0 = d;
  for (;;) {
    const a = Math.floor(n / d);
    const q2 = q0 + a * q1;
    if (q2 > maxDen) break;
    [p0, q0, p1, q1] = [p1, q1, p0 + a * p1, q2];
    [n, d] = [d, n - a * d];
  }
  const k = Math.floor((maxDen - q0) / q1);
  const b1: [number, number] = [p0 + k * p1, q0 + k * q1], b2: [number, number] = [p1, q1];
  // the closer bound to n0 / d0
  const err = (b: [number, number]) => Math.abs(b[0] / b[1] - n0 / d0);
  return err(b2) <= err(b1) ? b2 : b1;
}
function exactFraction(x: number): [number, number] {
  let d = 1;
  while (x !== Math.floor(x) && d < 2 ** 52) { x *= 2; d *= 2; }
  return [x, d];
}

/**
 * A decoded record as the demo plays it: mono, 22,050 Hz (band-limited by an offline render), through
 * the S950, peak-normalised - then back at `outRate` (the context's rate: the ring reads frames at it),
 * so the record keeps its length and pitch.
 */
export async function gritRecord(buffer: AudioBuffer, outRate: number = buffer.sampleRate): Promise<AudioBuffer> {
  const frames = Math.max(1, Math.ceil(buffer.duration * TT_RATE));
  const off = new OfflineAudioContext(1, frames, TT_RATE);
  const src = off.createBufferSource();
  src.buffer = buffer;
  // mono: the channels summed at half each (the reference `mean(1)`)
  const mono = off.createGain();
  mono.gain.value = buffer.numberOfChannels > 1 ? 1 / buffer.numberOfChannels : 1;
  mono.channelCount = 1; mono.channelCountMode = 'explicit'; mono.channelInterpretation = 'discrete';
  const split = off.createChannelSplitter(buffer.numberOfChannels);
  src.connect(split);
  for (let c = 0; c < buffer.numberOfChannels; c++) split.connect(mono, c);
  mono.connect(off.destination);
  src.start(0);
  const resampled = (await off.startRendering()).getChannelData(0);
  // the reference reader peak-normalises the record (`_read_wav`) before the sampler
  let peak = 0;
  for (let i = 0; i < resampled.length; i++) peak = Math.max(peak, Math.abs(resampled[i]!));
  const normalised = new Float64Array(resampled.length);
  for (let i = 0; i < resampled.length; i++) normalised[i] = resampled[i]! / (peak + 1e-9);
  const gritted = Float32Array.from(s950(normalised));
  scratchGritStats.transforms++;
  const at22 = new AudioBuffer({ length: gritted.length, numberOfChannels: 1, sampleRate: TT_RATE });
  at22.copyToChannel(gritted as Float32Array<ArrayBuffer>, 0);
  if (outRate === TT_RATE) return at22;
  // back to the context's rate: the 22,050 Hz record, band-limited by an offline render
  const up = new OfflineAudioContext(1, Math.max(1, Math.round(at22.duration * outRate)), outRate);
  const back = up.createBufferSource();
  back.buffer = at22;
  back.connect(up.destination);
  back.start(0);
  return up.startRendering();
}

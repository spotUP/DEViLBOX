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

export const S950 = { bits: 12, decim: 2, aaCut: 8000, alias: 0.12, inDrive: 0.03, outLp: 7500, interpLp: 7000, noise: 0.002, peak: 0.8 } as const;

/** Reachability sentinel: records put through the grit. */
export const scratchGritStats = { transforms: 0 };

/** scipy `butter(2, fc / nyquist)` low pass applied with `lfilter` (zero initial state). */
export function butterLowpass2(x: Float64Array, fc: number, rate: number): Float64Array<ArrayBuffer> {
  const wn = Math.min(0.99, Math.max(0.001, fc / (rate / 2)));
  const k = Math.tan(Math.PI * wn / 2);
  const norm = 1 / (1 + Math.SQRT2 * k + k * k);
  const b0 = k * k * norm, b1 = 2 * b0, b2 = b0;
  const a1 = 2 * (k * k - 1) * norm, a2 = (1 - Math.SQRT2 * k + k * k) * norm;
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i]!;
    const yi = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    y[i] = yi; x2 = x1; x1 = xi; y2 = y1; y1 = yi;
  }
  return y;
}

/** The S950 chain on a mono signal at 22,050 Hz (`sampler.process(x, "s950", 22050, dither=True, seed=0)`), peak-normalised. */
export function s950(input: ArrayLike<number>, rate = TT_RATE): Float32Array {
  const n = input.length;
  let y: Float64Array<ArrayBuffer> = new Float64Array(n);
  // input saturation
  for (let i = 0; i < n; i++) y[i] = Math.tanh(input[i]! * (1 + 4 * S950.inDrive));
  // anti-alias before the rate reduction
  y = butterLowpass2(y, S950.aaCut, rate);
  // sample-rate reduction with controlled aliasing: zero-order hold, `alias` of it kept raw
  const held = new Float64Array(n);
  for (let i = 0; i < n; i++) held[i] = y[i - (i % S950.decim)]!;
  const smooth = butterLowpass2(held, rate / (2 * S950.decim), rate);
  for (let i = 0; i < n; i++) y[i] = S950.alias * held[i]! + (1 - S950.alias) * smooth[i]!;
  // 12-bit quantisation with headroom, mild saturation and dither
  let m = 0;
  for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(y[i]!));
  m += 1e-9;
  const q = 2 ** (S950.bits - 1);
  const dither = new NumpyRandomState(7);
  for (let i = 0; i < n; i++) {
    let v = y[i]! / m * S950.peak;
    v = Math.tanh(v * 1.05) / 1.05;
    v += dither.uniform(-0.5, 0.5) / q;
    y[i] = Math.round(v * q) / q * m / S950.peak;
  }
  // "dark linear" interpolation colour, the output filter
  y = butterLowpass2(y, S950.interpLp, rate);
  y = butterLowpass2(y, S950.outLp, rate);
  // the noise floor (synth_dsp.noise('white', seed + 1))
  const noise = new NumpyRandomState(1);
  for (let i = 0; i < n; i++) y[i] = y[i]! + S950.noise * noise.uniform(-1, 1);
  // scratch._norm
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(y[i]!));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = y[i]! / (peak + 1e-9);
  return out;
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
  const gritted = s950(normalised);
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

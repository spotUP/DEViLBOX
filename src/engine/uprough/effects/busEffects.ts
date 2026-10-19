/**
 * The Up Rough softsynth bus effects as pure functions (Float64Array in, Float64Array out), ported
 * sample-for-sample from the Python reference in tools/ (synth_dsp.py, sampler.py, softsynth_engine.py).
 * The defaults are the Python defaults; hiphop.render_track calls them with its own numbers.
 *
 * Reused, not rewritten: butter / lfilter / comb / allpass / reverbs (dj/scratch/refDsp), tapeSat
 * (dj/scratch/demoDrums), NumpyRandomState (turntable/turntableSim), roundHalfEven (dj/scratch/scratchGrit).
 */
import type { ParameterDef } from '@/engine/registry/SynthDescriptor';
import { NumpyRandomState } from '@/engine/turntable/turntableSim';
import {
  bp, butter, echoLine, hp, lfilter, lp, npSum, reverb as schroederReverb, samplerReverb,
  type RefReverbKind, type SamplerReverbKind,
} from '@/engine/dj/scratch/refDsp';
import { tapeSat } from '@/engine/dj/scratch/demoDrums';
import { roundHalfEven } from '@/engine/dj/scratch/scratchGrit';

/** sampler.RATE: the compressor's time constants use this, not the render rate. */
const COMPRESSOR_RATE = 22050;

type Signal = ArrayLike<number>;

/** `np.sqrt(np.mean(x ** 2))`. */
const rms = (x: Signal): number => {
  const sq = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) sq[i] = x[i]! * x[i]!;
  return Math.sqrt(npSum(sq, 0, sq.length) / x.length);
};

// ── distortion (synth_dsp Ph6) ──────────────────────────────────────────────

/** synth_dsp `soft_clip`: tanh(drive x). (demoDrums has an int8-LUT softClip with another meaning.) */
export function softClip(x: Signal, drive = 2.0): Float64Array {
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = Math.tanh(drive * x[i]!);
  return out;
}

export { tapeSat };

/** synth_dsp `tube`: asymmetric warmth, tanh(drive (x + bias)) - tanh(drive bias). */
export function tube(x: Signal, drive = 2.0, bias = 0.2): Float64Array {
  const out = new Float64Array(x.length);
  const off = Math.tanh(drive * bias);
  for (let i = 0; i < x.length; i++) out[i] = Math.tanh(drive * (x[i]! + bias)) - off;
  return out;
}

// ── delay (synth_dsp Ph8) ───────────────────────────────────────────────────

export type DelayKind = 'digital' | 'tape' | 'bbd' | 'reverse' | 'multitap';
export interface DelayOptions { kind: DelayKind; delaySec: number; fb: number; mix: number; damp: number; sat: number; wow: number }
export const DELAY_DEFAULTS: Readonly<DelayOptions> = { kind: 'digital', delaySec: 0.3, fb: 0.4, mix: 0.4, damp: 0.3, sat: 0.0, wow: 0.0 };

/** synth_dsp `delay`. Output length: len(x) + 4 d (multitap: 3 d; reverse: len(x) + d). */
export function delay(x: Signal, rate: number, options: Partial<DelayOptions> = {}): Float64Array {
  const o = { ...DELAY_DEFAULTS, ...options };
  const d = Math.max(1, Math.trunc(o.delaySec * rate));
  let { damp, sat, wow } = o;
  const n = x.length;
  if (o.kind === 'tape') { damp = Math.max(damp, 0.35); sat = Math.max(sat, 1.2); wow = Math.max(wow, 2.0); }
  else if (o.kind === 'bbd') damp = Math.max(damp, 0.5);
  else if (o.kind === 'reverse') {
    const rev = Float64Array.from(x).reverse();
    const full = Float64Array.from(echoLine(rev, d, o.fb, damp, sat, wow, rate)).reverse();
    const wet = full.subarray(Math.max(0, full.length - (n + d)));
    const out = new Float64Array(wet.length);
    for (let i = 0; i < wet.length; i++) out[i] = (1 - o.mix) * (i < n ? x[i]! : 0) + o.mix * wet[i]!;
    return out;
  } else if (o.kind === 'multitap') {
    const out = new Float64Array(n + d * 4);
    for (let i = 0; i < n; i++) out[i] = (1 - o.mix) * x[i]!;
    const taps: ReadonlyArray<readonly [number, number]> = [[1, 0.7], [2, 0.5], [3, 0.35], [4, 0.22]];
    for (const [dt, g] of taps) for (let i = 0; i < n; i++) out[dt * d + i] = out[dt * d + i]! + o.mix * g * x[i]!;
    return out.slice(0, n + d * 3);
  }
  const wet = echoLine(x, d, o.fb, damp, sat, wow, rate);
  const out = new Float64Array(wet.length);
  for (let i = 0; i < wet.length; i++) out[i] = (1 - o.mix) * (i < n ? x[i]! : 0) + o.mix * wet[i]!;
  return out;
}

// ── chorus (synth_dsp Ph10) ─────────────────────────────────────────────────

export type ChorusKind = 'stereo' | 'juno' | 'dimension' | 'ensemble';
export interface ChorusOptions {
  kind: ChorusKind; depthMs: number; rateHz: number; mix: number; voices: number;
  /** Base delay in ms; null keeps the historical 20 ms. */
  delayMs: number | null;
  /** LFO phase per voice; null is the historical v * 2.1 walk. */
  phaseOffsets: readonly number[] | null;
}
export const CHORUS_DEFAULTS: Readonly<ChorusOptions> = {
  kind: 'stereo', depthMs: 6.0, rateHz: 0.6, mix: 0.4, voices: 2, delayMs: null, phaseOffsets: null,
};

/** synth_dsp `chorus`. */
export function chorus(x: Signal, rate: number, options: Partial<ChorusOptions> = {}): Float64Array {
  const o = { ...CHORUS_DEFAULTS, ...options };
  let { voices, depthMs, rateHz } = o;
  if (o.kind === 'juno') { voices = 1; depthMs = 3.0; rateHz = 0.5; }
  else if (o.kind === 'dimension') { voices = 2; depthMs = 4.0; }
  else if (o.kind === 'ensemble') { voices = 3; depthMs = 8.0; rateHz = 0.8; }
  const n = x.length;
  const base = Math.trunc((o.delayMs === null ? 0.02 : o.delayMs * 1e-3) * rate);
  const dmax = Math.trunc(depthMs * 1e-3 * rate);
  const phases = o.phaseOffsets ? [...o.phaseOffsets] : Array.from({ length: voices }, (_, v) => v * 2.1);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = (1 - o.mix) * x[i]!;
  for (const p0 of phases) {
    const gain = o.mix / phases.length;
    for (let i = 0; i < n; i++) {
      const lfo = Math.sin(2 * Math.PI * rateHz * i / rate + p0);
      let idx = i - base - Math.trunc(dmax * (0.5 + 0.5 * lfo));
      idx = Math.min(Math.max(idx, 0), n - 1);
      out[i] = out[i]! + gain * x[idx]!;
    }
  }
  return out;
}

// ── reverb (synth_dsp Ph9 and sampler.py) ───────────────────────────────────

export interface SchroederReverbOptions { kind: RefReverbKind; mix: number; decay: number }
export const SCHROEDER_REVERB_DEFAULTS: Readonly<SchroederReverbOptions> = { kind: 'room', mix: 0.25, decay: 1.0 };

/** synth_dsp `reverb`: length len(x) + 0.12 s. */
export function schroeder(x: Signal, rate: number, options: Partial<SchroederReverbOptions> = {}): Float64Array {
  const o = { ...SCHROEDER_REVERB_DEFAULTS, ...options };
  return schroederReverb(x as Float64Array, rate, o.kind, o.mix, o.decay);
}

export interface SamplerReverbOptions { kind: SamplerReverbKind; mix: number }
export const SAMPLER_REVERB_DEFAULTS: Readonly<SamplerReverbOptions> = { kind: 'small_room', mix: 0.1 };

/** sampler.py `reverb` (hip-hop palette, all kinds but lofi_digital): the input's length. */
export function reverb(x: Signal, rate: number, options: Partial<SamplerReverbOptions> = {}): Float64Array {
  const o = { ...SAMPLER_REVERB_DEFAULTS, ...options };
  return samplerReverb(x as Float64Array, rate, o.kind, o.mix);
}

// ── drum bus, parallel dirt, mixer colour (sampler.py) ──────────────────────

export interface CompressorOptions { ratio: number; thresh: number; makeup: number; attack: number; release: number }
const COMP_ATTACK = 0.02;
const COMP_RELEASE = 0.15;
export const DRUM_BUS_COMP: Readonly<CompressorOptions> = { ratio: 1.7, thresh: 0.35, makeup: 1.05, attack: COMP_ATTACK, release: COMP_RELEASE };
export const PARALLEL_DIRT_COMP: Readonly<CompressorOptions> = { ratio: 4.0, thresh: 0.2, makeup: 1.15, attack: COMP_ATTACK, release: COMP_RELEASE };

/** sampler `_compress`: slow transient-preserving soft compression (envelope times use the 22050 Hz constant). */
export function compress(x: Signal, c: CompressorOptions): Float64Array {
  const a = Math.exp(-1.0 / (c.attack * COMPRESSOR_RATE));
  const r = Math.exp(-1.0 / (c.release * COMPRESSOR_RATE));
  const out = new Float64Array(x.length);
  let e = 0.0;
  for (let i = 0; i < x.length; i++) {
    const env = Math.abs(x[i]!);
    const coef = env > e ? a : r;
    e = coef * e + (1 - coef) * env;
    const over = Math.max(0.0, e - c.thresh);
    const g = 1.0 / (1.0 + (c.ratio - 1) * over / (c.thresh + 1e-9));
    out[i] = x[i]! * g * c.makeup;
  }
  return out;
}

export interface DrumBusOptions { drive: number; comp: boolean; compParams: Partial<CompressorOptions> }
export const DRUM_BUS_DEFAULTS: Readonly<DrumBusOptions> = { drive: 0.10, comp: true, compParams: {} };

/** sampler `drum_bus` without the optional `resample` profile: HP 28 Hz, tape saturation, glue compression, LP 12 kHz. */
export function drumBus(x: Signal, rate: number, options: Partial<DrumBusOptions> = {}): Float64Array {
  const o = { ...DRUM_BUS_DEFAULTS, ...options };
  let y: Float64Array = hp(x as Float64Array, 28, rate);
  y = tapeSat(y, 1.0 + o.drive * 2.0);
  if (o.comp) y = compress(y, { ...DRUM_BUS_COMP, ...o.compParams });
  return lp(y, 12000, rate);
}

export interface ParallelDirtOptions { wet: number; compParams: Partial<CompressorOptions> }
export const PARALLEL_DIRT_DEFAULTS: Readonly<ParallelDirtOptions> = { wet: 0.18, compParams: {} };

/** sampler `parallel_dirt`: a saturated, band-limited, compressed copy under the dry drums. */
export function parallelDirt(x: Signal, rate: number, options: Partial<ParallelDirtOptions> = {}): Float64Array {
  const o = { ...PARALLEL_DIRT_DEFAULTS, ...options };
  let d: Float64Array = bp(x as Float64Array, 180, 5000, rate);
  d = softClip(d, 2.0);
  d = compress(d, { ...PARALLEL_DIRT_COMP, ...o.compParams });
  const out = Float64Array.from(x);
  const n = Math.min(x.length, d.length);
  for (let i = 0; i < n; i++) out[i] = out[i]! + o.wet * d[i]!;
  return out;
}

export interface MixerColorOptions { drive: number; hfRolloff: number }
export const MIXER_COLOR_DEFAULTS: Readonly<MixerColorOptions> = { drive: 0.08, hfRolloff: 6500 };

/** sampler `mixer_color`: channel saturation, HF roll-off and a low-mid thickening. */
export function mixerColor(x: Signal, rate: number, options: Partial<MixerColorOptions> = {}): Float64Array {
  const o = { ...MIXER_COLOR_DEFAULTS, ...options };
  let y: Float64Array = tapeSat(x as Float64Array, 1.0 + o.drive * 1.5);
  y = lp(y, o.hfRolloff, rate);
  const low = lp(y, 500, rate);
  const out = new Float64Array(y.length);
  for (let i = 0; i < y.length; i++) out[i] = y[i]! + 0.08 * low[i]!;
  return out;
}

// ── vinyl surface (synth_dsp Ph25) ──────────────────────────────────────────

const CRACKLE_KERNELS = 8;
const VINYL_PEAK = 0.6675;
const VINYL_SURFACE_DB = -20.0;
const PINK_B = [0.049922, -0.095993, 0.050612, -0.004408];
const PINK_A = [1, -2.494956, 2.017265, -0.522189];

/** synth_dsp `_crackle_layer`: sparse damped transients, a pool of eight noise-burst kernels, band-passed. */
function crackleLayer(n: number, rate: number, rng: NumpyRandomState, perS: number, decayMs: number, skew: number, lo: number, hi: number): Float64Array {
  const count = Math.max(1, Math.trunc(perS * n / rate));
  const pos = rng.randint(0, n, count);
  const amp = rng.uniformArray(0, 1, count).map((u) => u ** skew);
  const sign = rng.uniformArray(-1, 1, count).map((v) => Math.sign(v));
  const which = rng.randint(0, CRACKLE_KERNELS, count);
  const out = new Float64Array(n);
  for (let ki = 0; ki < CRACKLE_KERNELS; ki++) {
    const sel: number[] = [];
    for (let j = 0; j < count; j++) if (which[j] === ki) sel.push(j);
    if (!sel.length) continue;
    const ms = decayMs * rng.uniform(0.65, 1.35);
    const k = Math.max(2, Math.trunc(ms * 1e-3 * rate));
    const noiseK = rng.uniformArray(-1, 1, k);
    const kernel = new Float64Array(k);
    for (let i = 0; i < k; i++) kernel[i] = noiseK[i]! * Math.exp(-i / (k / 4.0));
    const sq = kernel.map((v) => v * v);
    const kn = Math.sqrt(npSum(sq, 0, k)) + 1e-12;
    for (let i = 0; i < k; i++) kernel[i] = kernel[i]! / kn;
    const train = new Float64Array(n);
    for (const j of sel) train[pos[j]!] = train[pos[j]!]! + amp[j]! * sign[j]!;   // np.add.at: sequential
    const conv = new Float64Array(n);
    for (let p = 0; p < n; p++) {
      const t = train[p]!;
      if (t === 0) continue;
      const m = Math.min(k, n - p);
      for (let j = 0; j < m; j++) conv[p + j] = conv[p + j]! + t * kernel[j]!;
    }
    for (let i = 0; i < n; i++) out[i] = out[i]! + conv[i]!;
  }
  return bp(out, lo, hi, rate);
}

/** synth_dsp `noise("vinyl", n, rate, seed)`: the generator draws one white vector first, then `_vinyl_noise` draws its layers. */
export function vinylNoise(n: number, rate: number, seed: number): Float64Array {
  const rng = new NumpyRandomState(seed >>> 0);
  rng.uniformArray(-1, 1, n);                                  // noise()'s own `w`, unused for "vinyl"
  const w = rng.uniformArray(-1, 1, n);
  const pink = lfilter({ b: PINK_B, a: PINK_A }, w);
  const surface = lp(hp(pink, 120.0, rate, 2), 7000.0, rate, 2);
  const rumble = lp(rng.uniformArray(-1, 1, n), 40.0, rate, 4);
  const crackle = crackleLayer(n, rate, rng, 22.0, 1.6, 3.0, 800.0, 4000.0);
  const pops = crackleLayer(n, rate, rng, 2.2, 6.0, 1.6, 300.0, 4000.0);
  const lvl = (x: Float64Array, target: number): Float64Array => {
    const r = rms(x);
    if (!(r > 1e-12)) return x;
    const g = target / r;
    return x.map((v) => v * g);
  };
  const s = lvl(surface, 0.020), r4 = lvl(rumble, 0.35), c = lvl(crackle, 0.55), p = lvl(pops, 0.30);
  const y = new Float64Array(n);
  let pk = 0;
  for (let i = 0; i < n; i++) {
    y[i] = s[i]! + r4[i]! + c[i]! + p[i]!;
    pk = Math.max(pk, Math.abs(y[i]!));
  }
  if (!(pk > 1e-12)) return y;
  const g = VINYL_PEAK / pk;
  return y.map((v) => v * g);
}

export interface VinylSurfaceOptions { amount: number; seed: number; gain: number | null }
export const VINYL_SURFACE_DEFAULTS: Readonly<VinylSurfaceOptions> = { amount: 0.0, seed: 0, gain: null };

/** synth_dsp `add_vinyl_surface`: surface noise levelled VINYL_SURFACE_DB under the track's rms, scaled by `amount`. */
export function addVinylSurface(x: Signal, rate: number, options: Partial<VinylSurfaceOptions> = {}): Float64Array {
  const o = { ...VINYL_SURFACE_DEFAULTS, ...options };
  const out = Float64Array.from(x);
  if (!o.amount || x.length === 0) return out;
  const surface = vinylNoise(x.length, rate, o.seed);
  if (o.gain !== null) {
    for (let i = 0; i < out.length; i++) out[i] = out[i]! + o.gain * o.amount * surface[i]!;
    return out;
  }
  const trackRms = rms(x), surfRms = rms(surface);
  if (trackRms <= 1e-12 || surfRms <= 1e-12) return out;
  const target = trackRms * (10.0 ** (VINYL_SURFACE_DB / 20.0)) * o.amount;
  const g = target / surfRms;
  for (let i = 0; i < out.length; i++) out[i] = out[i]! + g * surface[i]!;
  return out;
}

// ── vintage character (synth_dsp Ph26) ──────────────────────────────────────

export interface VintageOptions { tapeAge: number; dacNoise: number; jitter: number; aliasing: number; wear: number; seed: number }
export const VINTAGE_DEFAULTS: Readonly<VintageOptions> = { tapeAge: 0.0, dacNoise: 0.0, jitter: 0.0, aliasing: 0.0, wear: 0.0, seed: 0 };

/** synth_dsp `vintage_character`: tape wow, sample-rate crush, vinyl wear, DAC noise and clock jitter on a finished mix. */
export function vintageCharacter(x: Signal, rate: number, options: Partial<VintageOptions> = {}): Float64Array {
  const o = { ...VINTAGE_DEFAULTS, ...options };
  let y: Float64Array = Float64Array.from(x);
  const n = y.length;
  const clip = (v: number) => Math.min(Math.max(v, 0), n - 1);
  if (o.tapeAge > 0) {
    y = lp(y, 8000 - 4000 * o.tapeAge, rate);
    const src = y;
    const idx = new Int32Array(n);
    let acc = 0;
    for (let i = 0; i < n; i++) {
      acc += 1 + 0.002 * o.tapeAge * Math.sin(2 * Math.PI * 1.2 * i / rate);
      idx[i] = clip(Math.trunc(acc));
    }
    y = Float64Array.from(idx, (j) => src[j]!);
  }
  if (o.aliasing > 0) {
    const k = 1 + Math.trunc(3 * o.aliasing);
    const src = y;
    y = Float64Array.from(src, (_, i) => src[Math.trunc(i / k) * k]!);
  }
  if (o.wear > 0) {
    const v = vinylNoise(n, rate, o.seed);
    y = y.map((s, i) => s + o.wear * v[i]!);
  }
  if (o.dacNoise > 0) {
    const w = new NumpyRandomState((o.seed + 1) >>> 0).uniformArray(-1, 1, n);
    const g = o.dacNoise * 0.01;
    y = y.map((s, i) => s + g * w[i]!);
  }
  if (o.jitter > 0) {
    const u = new NumpyRandomState(o.seed >>> 0).uniformArray(-1, 1, n);
    const g = o.jitter * 3;
    const src = y;
    y = Float64Array.from(src, (_, i) => src[clip(Math.trunc(i + g * u[i]!))]!);
  }
  return y;
}

// ── output stage (softsynth_engine.py) ──────────────────────────────────────

export const PAULA_MODELS: Readonly<Record<string, number>> = { a500: 4400, led: 3300, a1200: 7000 };
export const PAULA_ORDERS: Readonly<Record<string, number>> = { a500: 1, a1200: 1, led: 4 };
export const PAULA_DEFAULT = 'a500';

export interface PaulaOptions { model: string; cutoff: number | null; order: number | null }
export const PAULA_DEFAULTS: Readonly<PaulaOptions> = { model: PAULA_DEFAULT, cutoff: null, order: null };

/** softsynth_engine `paula_filter` with the zero-order hold off (its default): the analog output low-pass. */
export function paulaFilter(x: Signal, rate: number, options: Partial<PaulaOptions> = {}): Float64Array {
  const o = { ...PAULA_DEFAULTS, ...options };
  const cutoff = o.cutoff ?? PAULA_MODELS[o.model] ?? PAULA_MODELS[PAULA_DEFAULT]!;
  const order = o.order ?? PAULA_ORDERS[o.model] ?? 1;
  return lfilter(butter(order, Math.min(cutoff, rate * 0.49) / (rate / 2.0), 'low'), x as Float64Array);
}

/** softsynth_engine `noise_shape_int8`: second-order error-feedback quantize of a signal already scaled to +-127. */
export function noiseShapeInt8(scaled: Signal): Int8Array {
  const out = new Int8Array(scaled.length);
  let e1 = 0, e2 = 0;
  for (let i = 0; i < scaled.length; i++) {
    const v = scaled[i]! + 2.0 * e1 - e2;
    let q = roundHalfEven(v);
    q = q > 127 ? 127 : q < -128 ? -128 : q;
    e2 = e1;
    e1 = v - q;
    out[i] = q;
  }
  return out;
}

export interface MasterBusOptions { dither: boolean; lowpassHz: number | null }
export const MASTER_BUS_DEFAULTS: Readonly<MasterBusOptions> = { dither: false, lowpassHz: null };

/** softsynth_engine `master_bus`: DC removal, optional one-pole low-pass, peak-normalise to 0.94, 8-bit quantize. Returns int8. */
export function masterBus(x: Signal, options: Partial<MasterBusOptions> = {}, rate = 22050): Int8Array {
  const o = { ...MASTER_BUS_DEFAULTS, ...options };
  const n = x.length;
  const mean = npSum(x as Float64Array, 0, n) / n;
  let sig = new Float64Array(n);
  for (let i = 0; i < n; i++) sig[i] = x[i]! - mean;
  if (o.lowpassHz) {
    const a = Math.exp(-2 * Math.PI * o.lowpassHz / rate);
    let y = 0.0;
    const filtered = new Float64Array(n);
    for (let i = 0; i < n; i++) { y = a * y + (1 - a) * sig[i]!; filtered[i] = y; }
    sig = filtered;
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(sig[i]!));
  if (!peak) peak = 1.0;
  const scaled = new Float64Array(n);
  for (let i = 0; i < n; i++) scaled[i] = sig[i]! / peak * 0.94 * 127;
  if (!o.dither) return noiseShapeInt8(scaled);
  const rng = new NumpyRandomState(0x5A17);
  const a = new Float64Array(n), b = new Float64Array(n);
  for (let i = 0; i < n; i++) a[i] = rng.rand();
  for (let i = 0; i < n; i++) b[i] = rng.rand();
  const out = new Int8Array(n);
  for (let i = 0; i < n; i++) {
    const v = scaled[i]! + (a[i]! - b[i]!) * (Math.abs(scaled[i]!) > 0.5 ? 1 : 0);
    out[i] = Math.min(Math.max(roundHalfEven(v), -128), 127);
  }
  return out;
}

// ── metadata ────────────────────────────────────────────────────────────────

const knob = (key: string, label: string, min: number, max: number, def: number): ParameterDef =>
  ({ key, label, type: 'knob', min, max, default: def });

const toggle = (key: string, label: string, def: boolean): ParameterDef =>
  ({ key, label, type: 'toggle', min: 0, max: 1, default: def ? 1 : 0 });

/** Select options are numeric indices into `ids`; the ids are the option strings the functions take. */
const select = (key: string, label: string, ids: ReadonlyArray<readonly [string, string]>, def: string): ParameterDef =>
  ({ key, label, type: 'select', default: ids.findIndex(([id]) => id === def), options: ids.map(([, l], value) => ({ value, label: l })) });

/** [id, label] per select option; the option value is the index. Shared with the softsynth insert chain. */
export const DELAY_KIND_IDS: ReadonlyArray<readonly [DelayKind, string]> = [['digital', 'Digital'], ['tape', 'Tape'], ['bbd', 'Bucket Brigade'], ['reverse', 'Reverse'], ['multitap', 'Multitap']];
export const CHORUS_KIND_IDS: ReadonlyArray<readonly [ChorusKind, string]> = [['stereo', 'Stereo'], ['juno', 'Juno'], ['dimension', 'Dimension'], ['ensemble', 'Ensemble']];
export const SAMPLER_REVERB_KIND_IDS: ReadonlyArray<readonly [SamplerReverbKind, string]> = [
  ['small_room', 'Small Room'], ['dark_room', 'Dark Room'], ['short_plate', 'Short Plate'], ['gated', 'Gated'],
  ['spring', 'Spring'], ['warehouse', 'Warehouse'], ['reverse', 'Reverse'],
];

export type BusEffectId =
  | 'softClip' | 'tapeSaturation' | 'tube' | 'delay' | 'chorus' | 'schroederReverb' | 'samplerReverb'
  | 'drumBus' | 'parallelDirt' | 'mixerColor' | 'vinylSurface' | 'vintageCharacter' | 'paulaFilter' | 'masterBus';

export interface BusEffectMeta { label: string; parameters: ParameterDef[] }

export const BUS_EFFECTS: Readonly<Record<BusEffectId, BusEffectMeta>> = {
  softClip: { label: 'Soft Clip', parameters: [knob('drive', 'Drive', 0.1, 10, 2.0)] },
  tapeSaturation: { label: 'Tape Saturation', parameters: [knob('drive', 'Drive', 0.1, 10, 1.5)] },
  tube: {
    label: 'Tube Saturation',
    parameters: [knob('drive', 'Drive', 0.1, 10, 2.0), knob('bias', 'Bias', 0, 0.5, 0.2)],
  },
  delay: {
    label: 'Delay',
    parameters: [
      select('kind', 'Type', DELAY_KIND_IDS, 'digital'),
      knob('delaySec', 'Time (seconds)', 0.01, 2, DELAY_DEFAULTS.delaySec),
      knob('fb', 'Feedback', 0, 0.95, DELAY_DEFAULTS.fb),
      knob('mix', 'Mix', 0, 1, DELAY_DEFAULTS.mix),
      knob('damp', 'Damping', 0, 0.95, DELAY_DEFAULTS.damp),
      knob('sat', 'Saturation', 0, 4, DELAY_DEFAULTS.sat),
      knob('wow', 'Wow Depth (samples)', 0, 16, DELAY_DEFAULTS.wow),
    ],
  },
  chorus: {
    label: 'Chorus',
    parameters: [
      select('kind', 'Type', CHORUS_KIND_IDS, 'stereo'),
      knob('depthMs', 'Depth (milliseconds)', 0.5, 20, CHORUS_DEFAULTS.depthMs),
      knob('rateHz', 'Rate (Hz)', 0.05, 8, CHORUS_DEFAULTS.rateHz),
      knob('mix', 'Mix', 0, 1, CHORUS_DEFAULTS.mix),
      knob('voices', 'Voices', 1, 6, CHORUS_DEFAULTS.voices),
    ],
  },
  schroederReverb: {
    label: 'Room Reverb',
    parameters: [
      select('kind', 'Type', [['room', 'Room'], ['plate', 'Plate'], ['hall', 'Hall'], ['gated', 'Gated'], ['spring', 'Spring']], 'room'),
      knob('mix', 'Mix', 0, 1, SCHROEDER_REVERB_DEFAULTS.mix),
      knob('decay', 'Decay', 0.1, 2, SCHROEDER_REVERB_DEFAULTS.decay),
    ],
  },
  samplerReverb: {
    label: 'Sampler Reverb',
    parameters: [
      select('kind', 'Room', SAMPLER_REVERB_KIND_IDS, 'small_room'),
      knob('mix', 'Mix', 0, 1, SAMPLER_REVERB_DEFAULTS.mix),
    ],
  },
  drumBus: {
    label: 'Drum Bus',
    parameters: [
      knob('drive', 'Drive', 0, 1, DRUM_BUS_DEFAULTS.drive),
      toggle('comp', 'Compressor', true),
      knob('ratio', 'Compressor Ratio', 1, 10, DRUM_BUS_COMP.ratio),
      knob('thresh', 'Compressor Threshold', 0.05, 1, DRUM_BUS_COMP.thresh),
      knob('makeup', 'Compressor Makeup Gain', 0.5, 2, DRUM_BUS_COMP.makeup),
    ],
  },
  parallelDirt: {
    label: 'Parallel Dirt',
    parameters: [
      knob('wet', 'Wet', 0, 1, PARALLEL_DIRT_DEFAULTS.wet),
      knob('ratio', 'Compressor Ratio', 1, 10, PARALLEL_DIRT_COMP.ratio),
      knob('thresh', 'Compressor Threshold', 0.05, 1, PARALLEL_DIRT_COMP.thresh),
      knob('makeup', 'Compressor Makeup Gain', 0.5, 2, PARALLEL_DIRT_COMP.makeup),
    ],
  },
  mixerColor: {
    label: 'Mixer Colour',
    parameters: [
      knob('drive', 'Drive', 0, 1, MIXER_COLOR_DEFAULTS.drive),
      knob('hfRolloff', 'High Roll-Off (Hz)', 1000, 16000, MIXER_COLOR_DEFAULTS.hfRolloff),
    ],
  },
  vinylSurface: {
    label: 'Vinyl Surface',
    parameters: [knob('amount', 'Amount', 0, 1, VINYL_SURFACE_DEFAULTS.amount), knob('seed', 'Seed', 0, 65535, VINYL_SURFACE_DEFAULTS.seed)],
  },
  vintageCharacter: {
    label: 'Vintage Character',
    parameters: [
      knob('tapeAge', 'Tape Age', 0, 1, VINTAGE_DEFAULTS.tapeAge),
      knob('dacNoise', 'Converter Noise', 0, 1, VINTAGE_DEFAULTS.dacNoise),
      knob('jitter', 'Clock Jitter', 0, 1, VINTAGE_DEFAULTS.jitter),
      knob('aliasing', 'Aliasing', 0, 1, VINTAGE_DEFAULTS.aliasing),
      knob('wear', 'Vinyl Wear', 0, 1, VINTAGE_DEFAULTS.wear),
      knob('seed', 'Seed', 0, 65535, VINTAGE_DEFAULTS.seed),
    ],
  },
  paulaFilter: {
    label: 'Paula Output Filter',
    parameters: [select('model', 'Machine', [['a500', 'Amiga 500'], ['led', 'Amiga 500 LED Filter'], ['a1200', 'Amiga 1200']], 'a500')],
  },
  masterBus: {
    label: 'Master Bus',
    parameters: [toggle('dither', 'Dither', false), knob('lowpassHz', 'Low-Pass (Hz, 0 is off)', 0, 11025, 0)],
  },
};

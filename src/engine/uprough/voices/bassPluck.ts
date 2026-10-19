/**
 * The Up Rough sampled / electric / warmsub bass voices, per note: tools/hiphop.py `render_bass_bar`'s dispatch branch
 * (a Karplus string at the bass octave over the `_sub808` spine, mixed per voice), up to but NOT including the per-note
 * tail (mean removal, humanize resample, fades, groove offset, 0.85 * vel) and the bar tail / bus.
 *
 * Parity fixture: tools/softsynth-fixtures/gen_bass_pluck.py. `seed` is the PLUCK seed, i.e. the host's `seed + step`.
 * `vel` does not enter the synthesis (it only scales the note in the tail), so it is not an argument here.
 */
import { pexp, pexp2, psin, ptanh } from '@/engine/dj/scratch/portableMath';
import { hp, lp } from '@/engine/dj/scratch/refDsp';
import { roundHalfEven } from '@/engine/dj/scratch/scratchGrit';
import { NumpyRandomState } from '@/engine/turntable/turntableSim';
import { distort, karplus, moogLadder } from '../synthDsp';
import { tube } from '../effects/busEffects';

export type PluckBassVoice = 'sampled' | 'electric' | 'warmsub';

/** synth_common `hz`: 440 * exp2((semi - 69) / 12). */
export const hzOfSemi = (semi: number): number => 440.0 * pexp2((semi - 69) / 12.0);

/** `np.linspace(a, b, n)` (step form, endpoint pinned). */
function linspace(a: number, b: number, n: number): Float64Array {
  const out = new Float64Array(n);
  if (n === 1) { out[0] = a; return out; }
  const step = (b - a) / (n - 1);
  for (let i = 0; i < n; i++) out[i] = i * step + a;
  out[n - 1] = b;
  return out;
}

/** hiphop `_sub808`: a tuned sub sine with a faster-decaying 2nd/3rd harmonic knock, optional 80 ms glide, soft clip. */
export function sub808(semi: number, durS: number, rate: number, glideFrom: number | null = null, drive = 0.3): Float64Array {
  const n = Math.max(1, Math.trunc(durS * rate));
  const f0 = hzOfSemi(semi - 12);
  const freq = new Float64Array(n).fill(f0);
  if (glideFrom !== null) {
    const gl = Math.trunc(Math.min(n, 0.08 * rate));
    if (gl < n) freq.set(linspace(hzOfSemi(glideFrom - 12), f0, gl));
  }
  const ph = new Float64Array(n);
  let acc = 0.0;
  for (let i = 0; i < n; i++) { acc += 2 * Math.PI * freq[i]! / rate; ph[i] = acc; }
  const bodyTau = 0.5 * durS * rate;
  const knockTau = Math.max(1.0, 0.40 * durS * rate);
  const body = new Float64Array(n);
  for (let t = 0; t < n; t++) {
    const knock = pexp(-t / knockTau);
    body[t] = psin(ph[t]!) * pexp(-t / bodyTau) + (0.70 * psin(2 * ph[t]!) + 0.35 * psin(3 * ph[t]!)) * knock;
  }
  return distort(body, 'soft', 1.0 + drive * 3.0);
}

/** sampler.PROFILES["sp1200"]. */
const SP1200 = { bits: 12, decim: 2, aaCut: 7000, alias: 0.28, inDrive: 0.09, outLp: 7000, holdLp: 6500, noise: 0.004, peak: 0.78 } as const;

/**
 * sampler.process(x, "sp1200", rate, dither=True, seed=0): input saturation, anti-alias, sample-rate reduction with
 * controlled alias, 12-bit quantise with headroom + dither (RandomState(7)), "hold" interpolation colour, output
 * filter, white noise floor (RandomState(seed + 1)). The S950 twin lives in scratchGrit (its own constants, Math.tanh).
 */
export function sp1200Process(input: ArrayLike<number>, rate: number): Float64Array {
  const P = SP1200;
  const n = input.length;
  let y: Float64Array = new Float64Array(n);
  for (let i = 0; i < n; i++) y[i] = ptanh(input[i]! * (1.0 + 4.0 * P.inDrive));
  y = lp(y, P.aaCut, rate);
  const held = new Float64Array(n);
  for (let i = 0; i < n; i++) held[i] = y[i - (i % P.decim)]!;
  const smooth = lp(held, rate / (2.0 * P.decim), rate);
  for (let i = 0; i < n; i++) y[i] = P.alias * held[i]! + (1.0 - P.alias) * smooth[i]!;
  // _quantize
  let m = 0;
  for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(y[i]!));
  m += 1e-9;
  const q = 2 ** (P.bits - 1);
  const dither = new NumpyRandomState(7);
  const dith = dither.uniformArray(-0.5, 0.5, n);
  for (let i = 0; i < n; i++) {
    let v = y[i]! / m * P.peak;
    v = ptanh(v * 1.05) / 1.05;
    v = v + dith[i]! / q;
    y[i] = roundHalfEven(v * q) / q * m / P.peak;
  }
  // _interp_color "hold": zero-order hold of every 2nd sample, then a low pass
  const hold = new Float64Array(n);
  for (let i = 0; i < n; i++) hold[i] = y[i - (i % 2)]!;
  y = lp(hold, P.holdLp, rate);
  y = lp(y, P.outLp, rate);
  const noise = new NumpyRandomState(1).uniformArray(-1, 1, n);
  for (let i = 0; i < n; i++) y[i] = y[i]! + P.noise * noise[i]!;
  return y;
}

export interface PluckBassNote {
  /** Host semitone (the event's `semi`; the string plays semi - 12, the sub plays `_hz(semi - 12)`). */
  semi: number;
  durS: number;
  /** Previous note's semi for the 80 ms glide, or null/undefined. */
  glide?: number | null;
  /** The pluck seed: the host's `seed + step`. */
  seed: number;
  /** The style's `bass_cut` (default 1.0). */
  bcut?: number;
}

/** One note of the sampled / electric / warmsub bass, before the per-note tail. */
export function renderPluckBassNote(voice: PluckBassVoice, note: PluckBassNote, rate: number): Float64Array {
  const { semi, durS, seed } = note;
  const bcut = note.bcut ?? 1.0;
  const nNote = Math.max(1, Math.trunc(durS * rate));
  const lo = semi - 12;
  // pluck(): karplus(_hz(semi), dur, rate, damp=0.04, kind='pluck', seed, fractional=in_tune)
  let string: Float64Array = karplus(hzOfSemi(lo), durS, rate, 0.04, 'pluck', seed, true).slice(0, nNote);
  const sub = sub808(semi, durS, rate, note.glide ?? null, 0.18).slice(0, nNote);
  string = lp(string, Math.trunc(2600 * bcut), rate);
  const out = new Float64Array(nNote);
  if (voice === 'sampled') {
    const s = sp1200Process(string, rate);
    for (let i = 0; i < nNote; i++) out[i] = 0.55 * sub[i]! + 0.80 * s[i]!;
  } else if (voice === 'electric') {
    string = moogLadder(string, Math.trunc(2400 * bcut), 0.46, rate);
    string = tube(string, 3.6, 0.20);
    string = distort(string, 'rat', 1.8);
    for (let i = 0; i < nNote; i++) out[i] = 0.70 * sub[i]! + 0.70 * string[i]!;
  } else {
    const h = hp(tube(sub, 3.2, 0.22), 180, rate);
    const l = lp(string, 1200, rate);
    for (let i = 0; i < nNote; i++) out[i] = 0.80 * sub[i]! + 0.45 * h[i]! + 0.42 * l[i]!;
  }
  return out;
}

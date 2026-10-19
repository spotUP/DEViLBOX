/**
 * The Up Rough demo's drum voices that its beat-juggle breaks are built from (drummachine.py `kick808`,
 * `snare808`, `hat`, `snare909` with their VOICE_PARAMS defaults, the int8 tanh LUT `_soft_clip`, the one-pole
 * filters; synth_dsp.py `tape_sat`). Float64, the reference's own order of operations and generators (numpy
 * RandomState = MT19937), so `make_break` nulls against the demo (ledger PG-I, J3).
 */

import { NumpyRandomState, linspace } from '@/engine/turntable/turntableSim';
import { roundHalfEven } from './scratchGrit';
import { lfilter, reverb } from './refDsp';
import { pexp, pexp2, psin, ptanh } from './portableMath';

export const DEMO_DRUM_RATE = 22050;

/** drummachine.VOICE_PARAMS for the voices the breaks use. */
export const DEMO_VOICE_PARAMS = {
  kick808: { tune: 8, pitch_start: 24, pitch_decay: 55, amp_decay: 300, click: 0.2, drive: 2.0, pitch_tail_ms: 330.0, pitch_tail_amt: 0.08, amp_punch: 1.5, amp_punch_ms: 10.0, body_h3: 0.08, click_ms: 4.0, click_len_ms: 8.0, click_hp: 600.0 },
  snare808: { tune: 29, noise_amt: 0.6, body_decay: 120, noise_decay: 95, drive: 0.1 },
  snare909: { tune: 31, noise_amt: 0.7, body_decay: 80, noise_decay: 140, drive: 0.25 },
  hat: { tune: 1.0 },
} as const;

/** Every keyword of drummachine `kick808` / `kick909`. */
export interface KickParams { tune: number; pitch_start: number; pitch_decay: number; amp_decay: number; click: number; drive: number; pitch_tail_ms: number; pitch_tail_amt: number; amp_punch: number; amp_punch_ms: number; body_h3: number; click_ms: number; click_len_ms: number; click_hp: number }
export const KICK909_PARAMS: KickParams = { tune: 11, pitch_start: 20, pitch_decay: 30, amp_decay: 250, click: 0.25, drive: 2.0, pitch_tail_ms: 180.0, pitch_tail_amt: 0.08, amp_punch: 1.5, amp_punch_ms: 8.0, body_h3: 0.08, click_ms: 4.0, click_len_ms: 8.0, click_hp: 700.0 };

/** Every keyword of drummachine `snare808` / `snare909`. */
export interface SnareParams { tune: number; noise_amt: number; body_decay: number; noise_decay: number; drive: number }

/** drummachine.VOICE_PARAMS clap808 / clap909 (`taps` are onset times in ms; `room_kind` names a synth_dsp reverb). */
export interface ClapParams { bright: number; tap_ms: number; tap_decay_ms: number; taps: readonly number[]; tail_decay_ms: number; tail_level: number; band_lo: number; band_hi: number; lp_stages: number; hp_stages: number; room_wet: number; room_kind: 'room' | 'plate' | 'hall'; room_decay: number; room_tail_ms: number; drive: number; body: number }
export const CLAP808_PARAMS: ClapParams = { bright: 1.0, tap_ms: 4.0, tap_decay_ms: 3.0, taps: [0.0, 10.0, 20.0], tail_decay_ms: 45.0, tail_level: 0.22, band_lo: 1000.0, band_hi: 2200.0, lp_stages: 3, hp_stages: 2, room_wet: 0.30, room_kind: 'room', room_decay: 0.5, room_tail_ms: 170.0, drive: 1.0, body: 0.0 };
export const CLAP909_PARAMS: ClapParams = { bright: 1.2, tap_ms: 4.0, tap_decay_ms: 3.0, taps: [0.0, 10.0, 20.0, 31.0], tail_decay_ms: 55.0, tail_level: 0.28, band_lo: 900.0, band_hi: 2600.0, lp_stages: 3, hp_stages: 2, room_wet: 0.5, room_kind: 'hall', room_decay: 0.8, room_tail_ms: 260.0, drive: 1.0, body: 0.0 };

export type DrumMachine = '808' | '909';

/** `_semi_hz`: a drum 'tune' as semitones over C1. */
export const semiHz = (semi: number): number => 32.703 * pexp2(semi / 12.0);

/** `_exp_decay(n, decay_ms)`. */
export function expDecay(n: number, decayMs: number, rate = DEMO_DRUM_RATE): Float64Array {
  const tau = Math.max(1.0, decayMs * 1e-3 * rate);
  const out = new Float64Array(n);
  for (let k = 0; k < n; k++) out[k] = pexp(-k / tau);
  return out;
}

/** `_noise(n, seed)`: RandomState(seed).uniform(-1, 1, n). */
export function demoNoise(n: number, seed = 0): Float64Array {
  const rng = new NumpyRandomState(seed >>> 0);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = rng.uniform(-1, 1);
  return out;
}

/** `_onepole_hp`: lfilter([a, -a], [1, -a]). */
export function onepoleHp(x: ArrayLike<number>, cutoffHz: number, rate = DEMO_DRUM_RATE): Float64Array {
  const a = pexp(-2 * Math.PI * cutoffHz / rate);
  return lfilter({ b: [a, -a], a: [1.0, -a] }, x);
}

/** `_onepole_lp`: lfilter([1 - a], [1, -a]). */
export function onepoleLp(x: ArrayLike<number>, hz: number, rate = DEMO_DRUM_RATE): Float64Array {
  const a = pexp(-2 * Math.PI * hz / rate);
  return lfilter({ b: [1.0 - a], a: [1.0, -a] }, x);
}

/** softsynth.sat_lut('tanh', drive, size): round(tanh(d x) / tanh(d) x 115) over linspace(-1, 1, size). */
export function satLut(drive = 2.0, size = 512): Int16Array {
  const x = linspace(-1.0, 1.0, size);
  const d = Math.max(0.1, drive);
  const out = new Int16Array(size);
  for (let i = 0; i < size; i++) out[i] = roundHalfEven((ptanh(d * x[i]!) / ptanh(d)) * 115.0);
  return out;
}

const TANH_LUT = satLut(2.0, 512);

/** `_soft_clip(x, drive)`: clip x (1 + drive), int8, through the tanh LUT (nearest index), / 127. */
export function softClip(x: ArrayLike<number>, drive: number): Float64Array {
  const out = new Float64Array(x.length);
  const L = TANH_LUT.length;
  for (let i = 0; i < x.length; i++) {
    const d = Math.min(1, Math.max(-1, x[i]! * (1 + drive)));
    const v = roundHalfEven(d * 127);
    const idx = Math.min(L - 1, Math.max(0, roundHalfEven((v / 128.0 + 1.0) * (L - 1) / 2.0)));
    out[i] = TANH_LUT[idx]! / 127.0;
  }
  return out;
}

/** synth_dsp `tape_sat`: tanh(drive x) - 0.12 y^3. */
export function tapeSat(x: ArrayLike<number>, drive = 1.5): Float64Array {
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) { const y = ptanh(drive * x[i]!); out[i] = y - 0.12 * y ** 3; }
  return out;
}

const cumsum = (x: ArrayLike<number>): Float64Array => {
  const out = new Float64Array(x.length);
  let s = 0;
  for (let i = 0; i < x.length; i++) { s += x[i]!; out[i] = s; }
  return out;
};

/** `_pitch_env(n, start, drop_ms, tail_ms, tail_amt)`: the kick/tom/conga downward pitch envelope in semitones. */
export function pitchEnv(n: number, startSemi: number, dropMs: number, rate = DEMO_DRUM_RATE, tailMs: number | null = null, tailAmt = 0.0): Float64Array {
  const fast = expDecay(n, dropMs, rate);
  const out = new Float64Array(n);
  if (tailAmt <= 0.0) { for (let i = 0; i < n; i++) out[i] = startSemi * fast[i]!; return out; }
  const slow = expDecay(n, Math.max(dropMs, tailMs ? tailMs : dropMs * 6.0), rate);
  const w = Math.min(1.0, Math.max(0.0, tailAmt));
  for (let i = 0; i < n; i++) out[i] = startSemi * ((1.0 - w) * fast[i]! + w * slow[i]!);
  return out;
}

/** `_osc_sweep(..., 'sine')`: phase = cumsum(2 pi base 2^(p/12) / rate). */
export function oscSweepSine(n: number, baseHz: number, pitchSemi: ArrayLike<number>, rate = DEMO_DRUM_RATE): Float64Array {
  const inc = new Float64Array(n);
  for (let i = 0; i < n; i++) inc[i] = 2 * Math.PI * (baseHz * pexp2(pitchSemi[i]! / 12.0)) / rate;
  const ph = cumsum(inc);
  for (let i = 0; i < n; i++) ph[i] = psin(ph[i]!);
  return ph;
}

const maxAbs = (x: ArrayLike<number>): number => { let m = 0; for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]!)); return m; };
/** `x / (np.max(np.abs(x)) or 1.0)` into a fresh array. */
const peakNorm = (x: ArrayLike<number>): Float64Array => { const m = maxAbs(x) || 1.0; const o = new Float64Array(x.length); for (let i = 0; i < x.length; i++) o[i] = x[i]! / m; return o; };

/** `dirt_stage(sig, amount)`: saturation bypassed at 0. */
export function dirtStage(sig: Float64Array, amount: number): Float64Array {
  return amount && amount > 0 ? softClip(sig, amount) : sig;
}

/** `pcm_grain(sig, bits)`: quantise against the voice's own peak (the 909's 6-bit sampler). */
export function pcmGrain(sig: Float64Array, bits = 6): Float64Array {
  if (!bits || bits <= 0 || bits >= 16) return sig;
  const pk = maxAbs(sig);
  if (!(pk > 0)) return sig;
  const steps = 2 ** (Math.trunc(bits) - 1);
  const out = new Float64Array(sig.length);
  for (let i = 0; i < sig.length; i++) out[i] = roundHalfEven(sig[i]! / pk * steps) / steps * pk;
  return out;
}

/** `_machine_pcm_bits(voice, machine, override)`: an override >= 0 wins; else 6 bits on the 909's ride/crash/hat, 0 on the 808. */
export const machinePcmBits = (machine: DrumMachine, override: number | undefined): number =>
  override !== undefined && Math.trunc(override) >= 0 ? Math.trunc(override) : machine === '909' ? 6 : 0;

/** drummachine `kick808` (two-stage pitch, punch, body harmonics, the beater, the LUT clip); `defaults` = kick909's for `kick909`. */
export function kick808(opts: Partial<KickParams> = {}, rate = DEMO_DRUM_RATE, defaults: KickParams = DEMO_VOICE_PARAMS.kick808): Float64Array {
  const P: KickParams = { ...defaults };
  for (const k of Object.keys(opts) as (keyof KickParams)[]) if (opts[k] !== undefined) P[k] = opts[k]!;
  const n = Math.trunc(P.amp_decay * 1e-3 * rate);
  const pitch = pitchEnv(n, P.pitch_start, P.pitch_decay, rate, P.pitch_tail_ms, P.pitch_tail_amt);
  const base = semiHz(P.tune);
  const body = oscSweepSine(n, base, pitch, rate);
  if (P.body_h3 > 0) {
    const inc = new Float64Array(n);
    for (let i = 0; i < n; i++) inc[i] = 2 * Math.PI * base * pexp2(pitch[i]! / 12.0) / rate;
    const ph = cumsum(inc);
    for (let i = 0; i < n; i++) body[i] = body[i]! + P.body_h3 * psin(3 * ph[i]!) + 0.4 * P.body_h3 * psin(2 * ph[i]!);
  }
  // _amp_env(punch)
  const rel = expDecay(n, P.amp_decay, rate);
  const sig = new Float64Array(n);
  if (P.amp_punch <= 0.0) {
    for (let i = 0; i < n; i++) sig[i] = body[i]! * rel[i]!;
  } else {
    const pun = expDecay(n, Math.max(0.5, P.amp_punch_ms), rate);
    for (let i = 0; i < n; i++) sig[i] = body[i]! * ((rel[i]! + P.amp_punch * pun[i]!) / (1.0 + P.amp_punch));
  }
  if (P.click > 0) {
    const cn = Math.min(n, Math.trunc(P.click_len_ms * 1e-3 * rate));
    const nz = demoNoise(cn, 1), env = expDecay(cn, P.click_ms, rate);
    let beater: Float64Array = new Float64Array(cn);
    for (let i = 0; i < cn; i++) beater[i] = nz[i]! * env[i]!;
    if (P.click_hp > 0) beater = onepoleHp(beater, P.click_hp, rate);
    for (let i = 0; i < cn; i++) sig[i] = sig[i]! + P.click * beater[i]!;
  }
  return softClip(sig, P.drive);
}

/** drummachine `kick909`: `kick808` on the 909's VOICE_PARAMS. */
export const kick909 = (opts: Partial<KickParams> = {}, rate = DEMO_DRUM_RATE): Float64Array => kick808(opts, rate, KICK909_PARAMS);

/** drummachine `snare808` / `snare909`'s voice: the tuned pair with the attack blip, the band-passed rattle, the snap. */
export function snare808(opts: Partial<SnareParams> = {}, rate = DEMO_DRUM_RATE, defaults: SnareParams = DEMO_VOICE_PARAMS.snare808): Float64Array {
  const tune = opts.tune ?? defaults.tune, noiseAmt = opts.noise_amt ?? defaults.noise_amt;
  const bodyDecay = opts.body_decay ?? defaults.body_decay, noiseDecay = opts.noise_decay ?? defaults.noise_decay;
  const drive = opts.drive ?? defaults.drive;
  const n = Math.trunc(Math.max(bodyDecay, noiseDecay) * 1e-3 * rate);
  const f0 = semiHz(tune);
  const pblip = new Float64Array(n);
  for (let i = 0; i < n; i++) pblip[i] = 1.0 + 0.5 * pexp(-(i / rate) / 0.008);
  const cb = cumsum(pblip);
  const tone = (mult: number): Float64Array => {
    const out = new Float64Array(n);
    const k = 2 * Math.PI * f0 * mult;
    for (let i = 0; i < n; i++) { const p = k * cb[i]! / rate; out[i] = psin(p) + 0.12 * psin(3 * p); }
    return out;
  };
  const t1 = tone(1.0), t2 = tone(1.83), t3 = tone(1.93), bd = expDecay(n, bodyDecay, rate);
  const nz = onepoleLp(onepoleHp(demoNoise(n, 2), 1500, rate), 7000, rate), nd = expDecay(n, noiseDecay, rate);
  const snap = onepoleHp(demoNoise(n, 7), 3500, rate), sd = expDecay(n, 8, rate);
  const mix = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const body = (t1[i]! + 0.85 * t2[i]! + 0.25 * t3[i]!) * bd[i]!;
    mix[i] = (1.0 - noiseAmt) * 1.5 * body + noiseAmt * (nz[i]! * nd[i]!) + 0.5 * (snap[i]! * sd[i]!);
  }
  return softClip(mix, drive);
}

/** drummachine `snare909`: the 808 voice on the 909's defaults. */
export const snare909 = (opts: Partial<SnareParams> = {}, rate = DEMO_DRUM_RATE): Float64Array => snare808(opts, rate, DEMO_VOICE_PARAMS.snare909);

/** drummachine `clap`: tapped noise bursts, a one-pole band cascade, an optional body layer, the Schroeder room, the clip. */
export function clap(opts: Partial<ClapParams> = {}, rate = DEMO_DRUM_RATE, defaults: ClapParams = CLAP909_PARAMS): Float64Array {
  const P: ClapParams = { ...defaults, ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)) } as ClapParams;
  let n = Math.trunc(0.22 * rate);
  let out: Float64Array = new Float64Array(n);
  for (const offMs of P.taps) {
    const s = Math.trunc(offMs * 1e-3 * rate);
    const bn = Math.trunc(P.tap_ms * 1e-3 * rate);
    if (s + bn <= n) {
      const nz = demoNoise(bn, 3 + s), env = expDecay(bn, P.tap_decay_ms, rate);
      for (let i = 0; i < bn; i++) out[s + i] = out[s + i]! + nz[i]! * env[i]!;
    }
  }
  const tn = demoNoise(n, 9), te = expDecay(n, P.tail_decay_ms, rate);
  for (let i = 0; i < n; i++) out[i] = out[i]! + tn[i]! * te[i]! * P.tail_level;
  for (let k = 0; k < Math.trunc(P.hp_stages); k++) out = onepoleHp(out, P.band_lo * P.bright, rate);
  for (let k = 0; k < Math.trunc(P.lp_stages); k++) out = onepoleLp(out, P.band_hi * P.bright, rate);
  if (P.body > 0.0) {
    const bz = demoNoise(n, 33), be = expDecay(n, 60, rate);
    const raw = new Float64Array(n);
    for (let i = 0; i < n; i++) raw[i] = bz[i]! * be[i]!;
    const lo = onepoleLp(raw, 900, rate);
    for (let i = 0; i < n; i++) out[i] = out[i]! + lo[i]! * P.body;
  }
  if (P.room_wet > 0) {
    const pad = new Float64Array(n + Math.trunc(P.room_tail_ms * 1e-3 * rate));
    pad.set(out);
    const wet = reverb(pad, rate, P.room_kind, 1.0, P.room_decay);
    n = Math.max(pad.length, wet.length);
    const mixed = new Float64Array(n);
    for (let i = 0; i < n; i++) mixed[i] = (1.0 - P.room_wet) * (i < pad.length ? pad[i]! : 0) + P.room_wet * (i < wet.length ? wet[i]! : 0);
    out = onepoleLp(onepoleHp(mixed, 400.0, rate), 5000.0, rate);
  }
  out = peakNorm(out);
  if (P.drive > 0) out = peakNorm(softClip(out, P.drive));
  return out;
}

const HAT_RATIOS = [1.000, 1.271, 1.593, 1.907, 2.318, 2.771, 3.146, 3.697] as const;
const RIDE_RATIOS = [1.000, 1.233, 1.487, 1.862, 2.241, 2.684, 3.031, 3.528, 4.281] as const;
const HAT_PHASES = [0, 1.27, 2.46, 3.82, 5.01, 5.78, 0.63, 4.19] as const;

/** `_metallic_cluster(base, ratios, n, rate, seed, hp, lp)`: inharmonic pulse partials, then a broad high-pass and low-pass. */
export function metallicCluster(base: number, ratios: readonly number[], n: number, rate: number, seed: number, hp: number, lp: number): Float64Array {
  const rng = new NumpyRandomState(seed >>> 0);
  const sig = new Float64Array(n);
  ratios.forEach((r, i) => {
    const detune = 1.0 + (0.006 * (2 * (i % 3) - 1));
    const pw = 0.44 + 0.03 * (i % 4);
    const ph = HAT_PHASES[i % HAT_PHASES.length]!;
    const amp = 0.7 + 0.6 * rng.rand();
    for (let k = 0; k < n; k++) {
      const frac = (base * r * detune * (k / rate) + ph / (2 * Math.PI)) % 1.0;
      sig[k] = sig[k]! + amp * (frac < pw ? 1.0 : -1.0);
    }
  });
  return onepoleLp(onepoleHp(sig, hp, rate), lp, rate);
}

/** `_hat_noise(n, rate, seed, hp)`: pink-dominant plus white, high-passed. */
export function hatNoise(n: number, rate: number, seed: number, hp: number): Float64Array {
  const white = demoNoise(n, seed);
  const pink = onepoleLp(white, 1800, rate);
  const pm = maxAbs(pink) || 1;
  const mix = new Float64Array(n);
  for (let k = 0; k < n; k++) mix[k] = 0.7 * pink[k]! / pm + 0.3 * white[k]!;
  return onepoleHp(mix, hp, rate);
}

/** Every keyword of drummachine `hat` (`open_hat` as a boolean; `decay` null = the machine's own; lp / hp 0 = off). */
export interface HatParams { open_hat: boolean; tune: number; machine: DrumMachine; seed: number; noise: number; decay: number | null; start_ms: number; pcm_bits: number | undefined; dirt: number; lp: number; hp: number }

/** drummachine `hat`: the metallic cluster, the noise, the transient grit, the body (and open-hat fizz) envelope, jitter, tanh, filters, the machine's PCM grain. */
export function hat(opts: Partial<HatParams> = {}, rate = DEMO_DRUM_RATE): Float64Array {
  const openHat = opts.open_hat ?? false, tune = opts.tune ?? DEMO_VOICE_PARAMS.hat.tune, machine = opts.machine ?? '909';
  const seed = opts.seed ?? 4, noiseScale = opts.noise ?? 1.0, startMs = opts.start_ms ?? 0.0, dirt = opts.dirt ?? 0.0;
  const lpHz = opts.lp ?? 0.0, hpHz = opts.hp ?? 0.0;
  const decay = opts.decay ?? (machine === '909' ? (openHat ? 420 : 70) : (openHat ? 380 : 55));
  const n = Math.trunc((decay + 40) * 1e-3 * rate);
  const base = 1500.0 * tune;
  const [metLvl, noiseLvl0] = machine === '808' ? [0.55, 0.42] : [0.45, 0.55];
  const noiseLvl = noiseLvl0 * noiseScale;
  const metallic = peakNorm(metallicCluster(base, HAT_RATIOS, n, rate, seed, 2800, 8000));
  const noise = peakNorm(hatNoise(n, rate, seed + 11, machine === '909' ? 3200 : 3000));
  let sig: Float64Array = new Float64Array(n);
  for (let k = 0; k < n; k++) sig[k] = metLvl * metallic[k]! + noiseLvl * noise[k]!;
  const ac = Math.trunc(0.003 * rate);
  const grit = onepoleHp(demoNoise(ac, seed + 3), 6500, rate);
  for (let k = 0; k < ac; k++) sig[k] = sig[k]! + 0.22 * grit[k]!;
  const bodyEnv = expDecay(n, decay, rate);
  if (openHat) {
    const hf = onepoleHp(sig, 6500, rate), fe = expDecay(n, decay * 0.35, rate);
    for (let k = 0; k < n; k++) sig[k] = sig[k]! * bodyEnv[k]! + hf[k]! * Math.max(fe[k]! - bodyEnv[k]!, 0);
  } else {
    for (let k = 0; k < n; k++) sig[k] = sig[k]! * bodyEnv[k]!;
  }
  const jr = new NumpyRandomState((seed + 5) >>> 0);
  const r1 = jr.rand(), r2 = jr.rand();
  for (let k = 0; k < n; k++) {
    const jit = 1.0 + 0.04 * psin(2 * Math.PI * (30 + 40 * r1) * (k / rate) + r2 * 6);
    sig[k] = ptanh(sig[k]! * jit * 1.3);
  }
  sig = lpHz ? onepoleLp(onepoleLp(sig, lpHz, rate), lpHz, rate) : onepoleLp(sig, machine === '909' ? 8500 : 7500, rate);
  if (hpHz) sig = onepoleHp(onepoleHp(sig, hpHz, rate), hpHz, rate);
  if (startMs) {
    const cut = Math.min(Math.trunc(startMs * 1e-3 * rate), Math.max(0, sig.length - 2));
    if (cut > 0) {
      sig = sig.slice(cut);
      const ramp = Math.min(Math.trunc(0.001 * rate), sig.length);
      if (ramp > 1) { const lin = linspace(0.0, 1.0, ramp); for (let i = 0; i < ramp; i++) sig[i] = sig[i]! * lin[i]!; }
    }
  }
  const pk = maxAbs(sig) || 1.0;
  const norm = new Float64Array(sig.length);
  for (let k = 0; k < sig.length; k++) norm[k] = sig[k]! / pk * 0.9;
  return dirtStage(pcmGrain(norm, machinePcmBits(machine, opts.pcm_bits)), dirt);
}

/** The beat-juggle's hat: `hat(open_hat=False, machine='909')` at `seed`. */
export const hat909 = (rate = DEMO_DRUM_RATE, seed = 4): Float64Array => hat({ seed }, rate);

/** Every keyword of drummachine `tom`. */
export interface TomParams { tune: number; pitch_drop: number; decay: number; drive: number; machine: DrumMachine }
export function tom(opts: Partial<TomParams> = {}, rate = DEMO_DRUM_RATE): Float64Array {
  const tune = opts.tune ?? 20, pitchDrop = opts.pitch_drop ?? 8, decay = opts.decay ?? 250, drive = opts.drive ?? 0.1, machine = opts.machine ?? '909';
  const n = Math.trunc(decay * 1e-3 * rate);
  const sweepMs = decay * (machine === '909' ? 0.25 : 0.4);
  const body = oscSweepSine(n, semiHz(tune), pitchEnv(n, pitchDrop, sweepMs, rate), rate);
  const env = expDecay(n, decay, rate);
  for (let i = 0; i < n; i++) body[i] = body[i]! * env[i]!;
  return softClip(body, drive * (machine === '909' ? 1.3 : 1.0));
}

/** drummachine `rim`: damped inharmonic shell modes, a noise snap, a soft click, the asymmetric tanh, a band filter. */
export function rim(opts: { machine?: DrumMachine; seed?: number } = {}, rate = DEMO_DRUM_RATE): Float64Array {
  const machine = opts.machine ?? '909', seed = opts.seed ?? 8;
  const is808 = machine === '808';
  const modes: ReadonlyArray<readonly [number, number]> = is808 ? [[860, 70], [1260, 48], [1810, 30]] : [[1120, 52], [1790, 35], [2670, 22]];
  const [bodyLvl, noiseLvl, clickLvl] = is808 ? [0.65, 0.22, 0.06] : [0.52, 0.31, 0.10];
  const [atkMs, ndecay, hpHz, lpHz, drive] = is808 ? [1.2, 18, 320, 4200, 0.08] : [0.8, 21, 420, 5800, 0.13];
  const n = Math.trunc((modes[0]![1] + 30) * 1e-3 * rate);
  const phases = [0.0, 1.9, 3.7];
  let body: Float64Array = new Float64Array(n);
  modes.forEach(([f, dec], i) => {
    const env = expDecay(n, dec, rate);
    for (let k = 0; k < n; k++) body[k] = body[k]! + (0.9 ** i) * psin(2 * Math.PI * f * (k / rate) + phases[i]!) * env[k]!;
  });
  body = peakNorm(body);
  const nb = Math.trunc(ndecay * 1e-3 * rate);
  let noise: Float64Array = new Float64Array(n);
  {
    const f = onepoleLp(onepoleHp(demoNoise(nb, seed), 1000, rate), 4000, rate), e = expDecay(nb, ndecay, rate);
    for (let k = 0; k < nb; k++) noise[k] = f[k]! * e[k]!;
  }
  noise = peakNorm(noise);
  const cl = Math.trunc(0.008 * rate);
  let click: Float64Array = new Float64Array(n);
  {
    const f = onepoleHp(demoNoise(cl, seed + 1), 2500, rate), e = expDecay(cl, 4, rate);
    for (let k = 0; k < cl; k++) click[k] = f[k]! * e[k]!;
  }
  click = peakNorm(click);
  let sig: Float64Array = new Float64Array(n);
  for (let k = 0; k < n; k++) sig[k] = bodyLvl * body[k]! + noiseLvl * noise[k]! + clickLvl * click[k]!;
  const a = Math.max(2, Math.trunc(atkMs * 1e-3 * rate));
  const lin = linspace(0, 1, a);
  for (let k = 0; k < a; k++) sig[k] = sig[k]! * lin[k]! ** 1.2;
  for (let k = 0; k < n; k++) {
    const d = Math.min(1, Math.max(-1, sig[k]! * (1 + drive * 3)));
    sig[k] = ptanh(d >= 0 ? d : d * 0.85);
  }
  sig = onepoleLp(onepoleHp(sig, hpHz, rate), lpHz, rate);
  const m = maxAbs(sig) || 1.0;
  const out = new Float64Array(n);
  for (let k = 0; k < n; k++) out[k] = sig[k]! / m * 0.72;
  return out;
}

/** drummachine `cowbell`: two detuned squares, high-passed at 500 Hz. */
export function cowbell(opts: { tune?: number; dirt?: number } = {}, rate = DEMO_DRUM_RATE): Float64Array {
  const tune = opts.tune ?? 1.0, dirt = opts.dirt ?? 0.0;
  const n = Math.trunc(0.18 * rate);
  const sq = new Float64Array(n);
  for (let k = 0; k < n; k++) { const t = k / rate; sq[k] = Math.sign(psin(2 * Math.PI * 555 * tune * t)) + Math.sign(psin(2 * Math.PI * 835 * tune * t)); }
  const hpd = onepoleHp(sq, 500, rate), env = expDecay(n, 120, rate);
  for (let k = 0; k < n; k++) hpd[k] = hpd[k]! * env[k]!;
  return dirtStage(peakNorm(hpd), dirt);
}

/** drummachine `conga`: sine body, a very fast 5-semitone drop, a light clip. */
export function conga(opts: { tune?: number; decay?: number; dirt?: number } = {}, rate = DEMO_DRUM_RATE): Float64Array {
  const tune = opts.tune ?? 32, decay = opts.decay ?? 140, dirt = opts.dirt ?? 0.0;
  const n = Math.trunc(decay * 1e-3 * rate);
  const body = oscSweepSine(n, semiHz(tune), pitchEnv(n, 5, decay * 0.2, rate), rate);
  const env = expDecay(n, decay, rate);
  for (let i = 0; i < n; i++) body[i] = body[i]! * env[i]!;
  return dirtStage(softClip(body, 0.05), dirt);
}

/** drummachine `ride`: strike, metallic body and noise wash layers, the ring-mod texture, the fizz, tanh, the machine's PCM grain. */
export function ride(opts: { seed?: number; machine?: DrumMachine; pcm_bits?: number; dirt?: number } = {}, rate = DEMO_DRUM_RATE): Float64Array {
  const seed = opts.seed ?? 6, machine = opts.machine ?? '909', dirt = opts.dirt ?? 0.0;
  const n = Math.trunc(2.0 * rate);
  const body = peakNorm(metallicCluster(1200.0, RIDE_RATIOS, n, rate, seed, 1800, 9000));
  const e850 = expDecay(n, 850, rate), e700 = expDecay(n, 700, rate);
  for (let k = 0; k < n; k++) {
    const t = k / rate;
    const ring = psin(2 * Math.PI * 1200 * t) * psin(2 * Math.PI * 1200 * 1.487 * t);
    body[k] = body[k]! * e850[k]! + 0.04 * ring * e700[k]!;
  }
  const wash = peakNorm(hatNoise(n, rate, seed + 21, 2000)), e1800 = expDecay(n, 1800, rate);
  for (let k = 0; k < n; k++) wash[k] = wash[k]! * e1800[k]!;
  const strike = peakNorm(onepoleHp(metallicCluster(2600.0, RIDE_RATIOS, n, rate, seed + 2, 4000, 11000), 4000, rate)), e90 = expDecay(n, 90, rate);
  for (let k = 0; k < n; k++) strike[k] = strike[k]! * e90[k]!;
  const sig = new Float64Array(n);
  for (let k = 0; k < n; k++) sig[k] = 0.15 * strike[k]! + 0.50 * body[k]! + 0.35 * wash[k]!;
  const hf = onepoleHp(sig, 7000, rate), e250 = expDecay(n, 250, rate), lo = onepoleLp(sig, 9000, rate);
  for (let k = 0; k < n; k++) sig[k] = ptanh((lo[k]! + hf[k]! * Math.max(e250[k]! - e850[k]!, 0)) * 1.2);
  const m = maxAbs(sig) || 1.0;
  const norm = new Float64Array(n);
  for (let k = 0; k < n; k++) norm[k] = sig[k]! / m * 0.9;
  return dirtStage(pcmGrain(norm, machinePcmBits(machine, opts.pcm_bits)), dirt);
}

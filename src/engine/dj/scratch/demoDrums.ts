/**
 * The Up Rough demo's drum voices that its beat-juggle breaks are built from (drummachine.py `kick808`,
 * `snare808`, `hat`, `snare909` with their VOICE_PARAMS defaults, the int8 tanh LUT `_soft_clip`, the one-pole
 * filters; synth_dsp.py `tape_sat`). Float64, the reference's own order of operations and generators (numpy
 * RandomState = MT19937), so `make_break` nulls against the demo (ledger PG-I, J3).
 */

import { NumpyRandomState, linspace } from '@/engine/turntable/turntableSim';
import { roundHalfEven } from './scratchGrit';
import { lfilter } from './refDsp';

export const DEMO_DRUM_RATE = 22050;

/** drummachine.VOICE_PARAMS for the voices the breaks use. */
export const DEMO_VOICE_PARAMS = {
  kick808: { tune: 8, pitch_start: 24, pitch_decay: 55, amp_decay: 300, click: 0.2, drive: 2.0, pitch_tail_ms: 330.0, pitch_tail_amt: 0.08, amp_punch: 1.5, amp_punch_ms: 10.0, body_h3: 0.08, click_ms: 4.0, click_len_ms: 8.0, click_hp: 600.0 },
  snare808: { tune: 29, noise_amt: 0.6, body_decay: 120, noise_decay: 95, drive: 0.1 },
  snare909: { tune: 31, noise_amt: 0.7, body_decay: 80, noise_decay: 140, drive: 0.25 },
  hat: { tune: 1.0 },
} as const;

/** `_semi_hz`: a drum 'tune' as semitones over C1. */
export const semiHz = (semi: number): number => 32.703 * (2.0 ** (semi / 12.0));

/** `_exp_decay(n, decay_ms)`. */
export function expDecay(n: number, decayMs: number, rate = DEMO_DRUM_RATE): Float64Array {
  const tau = Math.max(1.0, decayMs * 1e-3 * rate);
  const out = new Float64Array(n);
  for (let k = 0; k < n; k++) out[k] = Math.exp(-k / tau);
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
  const a = Math.exp(-2 * Math.PI * cutoffHz / rate);
  return lfilter({ b: [a, -a], a: [1.0, -a] }, x);
}

/** `_onepole_lp`: lfilter([1 - a], [1, -a]). */
export function onepoleLp(x: ArrayLike<number>, hz: number, rate = DEMO_DRUM_RATE): Float64Array {
  const a = Math.exp(-2 * Math.PI * hz / rate);
  return lfilter({ b: [1.0 - a], a: [1.0, -a] }, x);
}

/** softsynth.sat_lut('tanh', drive, size): round(tanh(d x) / tanh(d) x 115) over linspace(-1, 1, size). */
export function satLut(drive = 2.0, size = 512): Int16Array {
  const x = linspace(-1.0, 1.0, size);
  const d = Math.max(0.1, drive);
  const out = new Int16Array(size);
  for (let i = 0; i < size; i++) out[i] = roundHalfEven((Math.tanh(d * x[i]!) / Math.tanh(d)) * 115.0);
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
  for (let i = 0; i < x.length; i++) { const y = Math.tanh(drive * x[i]!); out[i] = y - 0.12 * y ** 3; }
  return out;
}

const cumsum = (x: ArrayLike<number>): Float64Array => {
  const out = new Float64Array(x.length);
  let s = 0;
  for (let i = 0; i < x.length; i++) { s += x[i]!; out[i] = s; }
  return out;
};

/** drummachine `kick808` (two-stage pitch, punch, body harmonics, the beater, the LUT clip). */
export function kick808(opts: { tune?: number; amp_decay?: number; click?: number } = {}, rate = DEMO_DRUM_RATE): Float64Array {
  const P = DEMO_VOICE_PARAMS.kick808;
  const tune = opts.tune ?? P.tune, ampDecay = opts.amp_decay ?? P.amp_decay, click = opts.click ?? P.click;
  const n = Math.trunc(ampDecay * 1e-3 * rate);
  // _pitch_env (two slopes)
  const fast = expDecay(n, P.pitch_decay, rate);
  const slow = expDecay(n, Math.max(P.pitch_decay, P.pitch_tail_ms), rate);
  const w = Math.min(1.0, Math.max(0.0, P.pitch_tail_amt));
  const pitch = new Float64Array(n);
  for (let i = 0; i < n; i++) pitch[i] = P.pitch_start * ((1.0 - w) * fast[i]! + w * slow[i]!);
  const base = semiHz(tune);
  // _osc_sweep: freq = base x 2^(p/12); phase = cumsum(2 pi freq / rate)
  const inc = new Float64Array(n), inc2 = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const pw = 2.0 ** (pitch[i]! / 12.0);
    inc[i] = 2 * Math.PI * (base * pw) / rate;
    inc2[i] = 2 * Math.PI * base * pw / rate;
  }
  const phase = cumsum(inc), ph = cumsum(inc2);
  const body = new Float64Array(n);
  for (let i = 0; i < n; i++) body[i] = Math.sin(phase[i]!) + P.body_h3 * Math.sin(3 * ph[i]!) + 0.4 * P.body_h3 * Math.sin(2 * ph[i]!);
  // _amp_env with punch
  const rel = expDecay(n, ampDecay, rate), pun = expDecay(n, Math.max(0.5, P.amp_punch_ms), rate);
  const sig = new Float64Array(n);
  for (let i = 0; i < n; i++) sig[i] = body[i]! * ((rel[i]! + P.amp_punch * pun[i]!) / (1.0 + P.amp_punch));
  if (click > 0) {
    const cn = Math.min(n, Math.trunc(P.click_len_ms * 1e-3 * rate));
    const nz = demoNoise(cn, 1), env = expDecay(cn, P.click_ms, rate);
    let beater: Float64Array = new Float64Array(cn);
    for (let i = 0; i < cn; i++) beater[i] = nz[i]! * env[i]!;
    if (P.click_hp > 0) beater = onepoleHp(beater, P.click_hp, rate);
    for (let i = 0; i < cn; i++) sig[i] = sig[i]! + click * beater[i]!;
  }
  return softClip(sig, P.drive);
}

/** drummachine `snare808` / `snare909`'s voice: the tuned pair with the attack blip, the band-passed rattle, the snap. */
export function snare808(opts: { tune?: number; noise_amt?: number; body_decay?: number; noise_decay?: number; drive?: number } = {}, rate = DEMO_DRUM_RATE, defaults: { tune: number; noise_amt: number; body_decay: number; noise_decay: number; drive: number } = DEMO_VOICE_PARAMS.snare808): Float64Array {
  const tune = opts.tune ?? defaults.tune, noiseAmt = opts.noise_amt ?? defaults.noise_amt;
  const bodyDecay = opts.body_decay ?? defaults.body_decay, noiseDecay = opts.noise_decay ?? defaults.noise_decay;
  const drive = opts.drive ?? defaults.drive;
  const n = Math.trunc(Math.max(bodyDecay, noiseDecay) * 1e-3 * rate);
  const f0 = semiHz(tune);
  const pblip = new Float64Array(n);
  for (let i = 0; i < n; i++) pblip[i] = 1.0 + 0.5 * Math.exp(-(i / rate) / 0.008);
  const cb = cumsum(pblip);
  const tone = (mult: number): Float64Array => {
    const out = new Float64Array(n);
    const k = 2 * Math.PI * f0 * mult;
    for (let i = 0; i < n; i++) { const p = k * cb[i]! / rate; out[i] = Math.sin(p) + 0.12 * Math.sin(3 * p); }
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

/** drummachine `snare909` (drive given): the 808 voice on the 909's defaults. */
export const snare909 = (opts: { drive?: number } = {}, rate = DEMO_DRUM_RATE): Float64Array => snare808(opts, rate, DEMO_VOICE_PARAMS.snare909);

const HAT_RATIOS = [1.000, 1.271, 1.593, 1.907, 2.318, 2.771, 3.146, 3.697] as const;
const HAT_PHASES = [0, 1.27, 2.46, 3.82, 5.01, 5.78, 0.63, 4.19] as const;

const maxAbs = (x: ArrayLike<number>): number => { let m = 0; for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]!)); return m; };

/** drummachine `hat(open_hat=False, machine='909')` at the default seed 4: the metallic cluster, the noise, the 6-bit grain. */
export function hat909(rate = DEMO_DRUM_RATE, seed = 4): Float64Array {
  const decay = 70;
  const n = Math.trunc((decay + 40) * 1e-3 * rate);
  const base = 1500.0 * DEMO_VOICE_PARAMS.hat.tune;
  const metLvl = 0.45, noiseLvl = 0.55 * 1.0;
  // _metallic_cluster
  const rng = new NumpyRandomState(seed >>> 0);
  let met: Float64Array = new Float64Array(n);
  HAT_RATIOS.forEach((r, i) => {
    const detune = 1.0 + (0.006 * (2 * (i % 3) - 1));
    const pw = 0.44 + 0.03 * (i % 4);
    const ph = HAT_PHASES[i % HAT_PHASES.length]!;
    const amp = 0.7 + 0.6 * rng.rand();
    for (let k = 0; k < n; k++) {
      const frac = (base * r * detune * (k / rate) + ph / (2 * Math.PI)) % 1.0;
      met[k] = met[k]! + amp * (frac < pw ? 1.0 : -1.0);
    }
  });
  met = onepoleLp(onepoleHp(met, 2800, rate), 8000, rate);
  const mm = maxAbs(met) || 1.0;
  for (let k = 0; k < n; k++) met[k] = met[k]! / mm;
  // _hat_noise
  const white = demoNoise(n, seed + 11);
  const pink = onepoleLp(white, 1800, rate);
  const pm = maxAbs(pink) || 1;
  const nmix = new Float64Array(n);
  for (let k = 0; k < n; k++) nmix[k] = 0.7 * pink[k]! / pm + 0.3 * white[k]!;
  const noise = onepoleHp(nmix, 3200, rate);
  const nm = maxAbs(noise) || 1.0;
  let sig: Float64Array = new Float64Array(n);
  for (let k = 0; k < n; k++) sig[k] = metLvl * met[k]! + noiseLvl * (noise[k]! / nm);
  const ac = Math.trunc(0.003 * rate);
  const grit = onepoleHp(demoNoise(ac, seed + 3), 6500, rate);
  for (let k = 0; k < ac; k++) sig[k] = sig[k]! + 0.22 * grit[k]!;
  const env = expDecay(n, decay, rate);
  const jr = new NumpyRandomState((seed + 5) >>> 0);
  const r1 = jr.rand(), r2 = jr.rand();
  for (let k = 0; k < n; k++) {
    const jit = 1.0 + 0.04 * Math.sin(2 * Math.PI * (30 + 40 * r1) * (k / rate) + r2 * 6);
    sig[k] = Math.tanh(sig[k]! * env[k]! * jit * 1.3);
  }
  sig = onepoleLp(sig, 8500, rate);
  const pk0 = maxAbs(sig) || 1.0;
  for (let k = 0; k < n; k++) sig[k] = sig[k]! / pk0 * 0.9;
  // pcm_grain(sig, 6): the 909's 6-bit sample against the voice's peak
  const pk = maxAbs(sig);
  if (pk > 0) for (let k = 0; k < n; k++) sig[k] = roundHalfEven(sig[k]! / pk * 32) / 32 * pk;
  return sig;
}

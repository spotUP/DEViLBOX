/**
 * The scratch room (owner requirement 2026-10-12 "the scratches sound too dry"; reference
 * `thoughts/shared/research/2026-10-12_demo-system-scratch-wet-chain.md`): the Up Rough Demo
 * System's wet scratch channel room - 0.6 x short plate + 0.4 x dark room - as an impulse
 * response, computed with the reference's own Schroeder reverb (synth_dsp.py `reverb`: four
 * damped feedback combs averaged, two allpasses) and its filters (sampler.py: the plate low-passed
 * at 6 kHz and high-passed at 350 Hz, the dark room low-passed at 2.4 kHz; 2-pole Butterworth).
 * The comb passes its input, so the response carries the direct sound too: the bus mixes it as
 * `(1 - room) x dry + room x (dry * IR)`, exactly the reference's crossfade.
 */

type Kind = 'room' | 'plate';

/** The reference renders at 22,050 Hz (scratch_dj.RATE): per-sample coefficients keep its time constants at any rate. */
export const SCRATCH_REFERENCE_RATE = 22050;

/** synth_dsp.py `_REVERBS` (room, plate): comb delay seconds and feedback, pre-delay, loop damping. */
const KINDS: Readonly<Record<Kind, { combs: ReadonlyArray<readonly [number, number]>; pre: number; damp: number }>> = {
  room: { combs: [[0.030, 0.72], [0.037, 0.70], [0.041, 0.68], [0.044, 0.66]], pre: 0.005, damp: 0.2 },
  plate: { combs: [[0.022, 0.80], [0.029, 0.78], [0.034, 0.77], [0.038, 0.75]], pre: 0.002, damp: 0.1 },
};

/** The two rooms of the wet scratch channel (sampler.py `short_plate`, `dark_room`) and their mix. */
export const SCRATCH_ROOM = {
  plate: { kind: 'plate' as Kind, decay: 0.7, lpHz: 6000, hpHz: 350, weight: 0.6 },
  dark: { kind: 'room' as Kind, decay: 0.8, lpHz: 2400, hpHz: 0, weight: 0.4 },
  seconds: 1.0,
} as const;

/** y[i] = x[i] + fb v[i]; v[i] = (1 - damp) y[i - d] + damp v[i - 1] (synth_dsp.py `comb`). */
function comb(x: Float64Array, d: number, fb: number, damp: number): Float64Array {
  const y = new Float64Array(x.length);
  let v = 0;
  for (let i = 0; i < x.length; i++) {
    const back = i >= d ? y[i - d]! : 0;
    v = damp > 0 ? (1 - damp) * back + damp * v : back;
    y[i] = x[i]! + fb * v;
  }
  return y;
}

/** out[i] = -g x[i] + x[i - d] + g out[i - d] (synth_dsp.py `_allpass`). */
function allpass(x: Float64Array, d: number, g: number): Float64Array {
  const y = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = -g * x[i]! + (i >= d ? x[i - d]! + g * y[i - d]! : 0);
  return y;
}

/** 2-pole Butterworth (scipy `butter(2, fc / nyquist)`, bilinear with prewarping) run as one biquad. */
function butter2(x: Float64Array, fc: number, rate: number, type: 'low' | 'high'): Float64Array {
  const k = Math.tan(Math.PI * fc / rate);
  const norm = 1 / (1 + Math.SQRT2 * k + k * k);
  const b = type === 'low' ? [k * k * norm, 2 * k * k * norm, k * k * norm] : [norm, -2 * norm, norm];
  const a1 = 2 * (k * k - 1) * norm, a2 = (1 - Math.SQRT2 * k + k * k) * norm;
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b[0]! * x[i]! + b[1]! * x1 + b[2]! * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]!; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

/** synth_dsp.py `reverb(x, rate, kind, mix=1.0, decay)`: the fully wet Schroeder response. */
function schroeder(x: Float64Array, rate: number, kind: Kind, decay: number): Float64Array {
  const cfg = KINDS[kind];
  const pre = Math.trunc(cfg.pre * rate);
  const xp = new Float64Array(x.length);
  for (let i = 0; i + pre < x.length; i++) xp[i + pre] = x[i]!;
  let wet: Float64Array = new Float64Array(x.length);
  for (const [sec, g] of cfg.combs) {
    // the loop damping is a one-pole per sample: the same time constant as at the reference rate
    const damp = cfg.damp > 0 ? Math.pow(cfg.damp, SCRATCH_REFERENCE_RATE / rate) : 0;
    const c = comb(xp, Math.max(1, Math.trunc(sec * rate)), Math.min(0.96, g * decay), damp);
    for (let i = 0; i < wet.length; i++) wet[i] += c[i]!;
  }
  for (let i = 0; i < wet.length; i++) wet[i] /= cfg.combs.length;
  wet = allpass(wet, Math.trunc(0.005 * rate), 0.7);
  return allpass(wet, Math.trunc(0.0017 * rate), 0.7);
}

/** The wet channel's room response at `rate`: 0.6 x short plate + 0.4 x dark room, `seconds` long. */
export function scratchRoomResponse(rate: number, seconds: number = SCRATCH_ROOM.seconds): Float64Array {
  const n = Math.max(1, Math.round(rate * seconds));
  const impulse = new Float64Array(n); impulse[0] = 1;
  const out = new Float64Array(n);
  for (const part of [SCRATCH_ROOM.plate, SCRATCH_ROOM.dark]) {
    let y = schroeder(impulse, rate, part.kind, part.decay);
    if (part.lpHz) y = butter2(y, part.lpHz, rate, 'low');
    if (part.hpHz) y = butter2(y, part.hpHz, rate, 'high');
    for (let i = 0; i < n; i++) out[i] += part.weight * y[i]!;
  }
  return out;
}

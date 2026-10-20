/**
 * The Up Rough Demo System's two-body turntable model, ported (owner decision O1, 2026-10-12;
 * scratch ledger SCR-PG-B1; `Up_Rough_Demo_System/tools/turntable.py` :31-245, :378-445).
 *
 * Two rotating bodies: the motor-driven, servo-regulated platter and the light record above it,
 * coupled only through the slipmat (static + dynamic friction). A virtual hand (spring-damper,
 * scaled by its grip) moves the record; the record's velocity is the playback rate. Decel,
 * turnaround, release and the motor catching the record back all come out of the integration -
 * nothing is a hand-written rate curve. It runs at the reference's offline control rate (3 kHz)
 * before a gesture plays (a 1 s gesture is 3000 Euler steps: microseconds), and its record
 * velocity becomes the rate curve the scratch ring or the deck plays.
 *
 * The random parts (servo ripple phase, slipmat stick-slip jitter, the motor-noise draw) use the
 * reference's own generator (numpy RandomState = MT19937, `init_genrand`, 53-bit doubles), so a
 * Python `simulate` fixture replays here to float precision.
 */

// ── profiles (turntable.py :31-86, numbers verbatim) ──────────────────────

export const TT_DECKS = {
  classic_sl1200: { Ip: 1.00, kp: 9.0, ki: 2.5, max_torque: 0.6, bearing: 0.02, overshoot: 0.02, ripple: 0.004 },
  tight_direct_drive: { Ip: 1.05, kp: 13.0, ki: 3.5, max_torque: 0.7, bearing: 0.015, overshoot: 0.005, ripple: 0.002 },
  worn_club_deck: { Ip: 0.92, kp: 6.0, ki: 1.8, max_torque: 0.5, bearing: 0.05, overshoot: 0.05, ripple: 0.012 },
  weak_motor: { Ip: 1.00, kp: 5.0, ki: 1.2, max_torque: 0.35, bearing: 0.03, overshoot: 0.03, ripple: 0.006 },
  modern_high_torque: { Ip: 1.10, kp: 16.0, ki: 4.0, max_torque: 0.9, bearing: 0.015, overshoot: 0.01, ripple: 0.002 },
} as const;

export const TT_SLIPMATS = {
  felt_standard: { static: 0.30, dyn: 0.14, visc: 0.05, stick: 0.03 },
  thin_battle: { static: 0.20, dyn: 0.09, visc: 0.03, stick: 0.02 },
  plastic_underlay: { static: 0.12, dyn: 0.05, visc: 0.02, stick: 0.01 },
  worn_felt: { static: 0.34, dyn: 0.16, visc: 0.06, stick: 0.10 },
  high_friction: { static: 0.5, dyn: 0.26, visc: 0.08, stick: 0.05 },
  low_friction: { static: 0.10, dyn: 0.04, visc: 0.015, stick: 0.01 },
} as const;

export const TT_RECORDS = {
  light_battle: { Ir: 0.06, radius: 1.0 },
  '12inch': { Ir: 0.10, radius: 1.0 },
  '10inch': { Ir: 0.08, radius: 0.85 },
  '7inch': { Ir: 0.05, radius: 0.7 },
  heavy_vinyl: { Ir: 0.14, radius: 1.0 },
  control: { Ir: 0.07, radius: 1.0 },
} as const;

export const TT_CARTRIDGES = {
  battle: { stylus_drag: 0.010, surface: 0.0015, bw: 9500 },
  hi_fi: { stylus_drag: 0.006, surface: 0.0008, bw: 10500 },
  worn_stylus: { stylus_drag: 0.020, surface: 0.004, bw: 6500 },
  heavy_tracking: { stylus_drag: 0.028, surface: 0.003, bw: 8000 },
} as const;

export const TT_PERFORMERS = {
  tight_battle: { stiffness: 80.0, damping: 9.0, strength: 1.0, radius: 0.9 },
  loose_old_school: { stiffness: 45.0, damping: 7.0, strength: 0.85, radius: 0.8 },
  heavy_hand: { stiffness: 95.0, damping: 8.0, strength: 1.2, radius: 1.0 },
  light_touch: { stiffness: 55.0, damping: 10.0, strength: 0.7, radius: 0.7 },
  electro_grid: { stiffness: 110.0, damping: 11.0, strength: 1.0, radius: 0.9 },
  lofi_drag: { stiffness: 35.0, damping: 12.0, strength: 0.7, radius: 0.75 },
} as const;

/**
 * `GRIP_STATES` (turntable.py :99, T8): the hand's grip per state. The demo defines the table and reads it nowhere
 * (a hand path carries its own grip per point); kept as the demo has it.
 */
export const TT_GRIP_STATES = { free: 0.0, touch: 0.35, grip: 1.0, drag: 0.6, release: 0.0 } as const;

export type TtDeck = keyof typeof TT_DECKS;
export type TtSlipmat = keyof typeof TT_SLIPMATS;
export type TtRecord = keyof typeof TT_RECORDS;
export type TtCartridge = keyof typeof TT_CARTRIDGES;
export type TtPerformer = keyof typeof TT_PERFORMERS;

/** The reference's normalised playback speed. */
export const TT_NOMINAL = 1.0;
/** The reference's sample rate: hand angles are in samples of record at this rate. */
export const TT_RATE = 22050;
/** Reference stroke unit A (scratch.py :130): 1500 samples at 22,050 Hz. */
export const TT_A = 1500;

export function controlRate(tier: 'a500' | 'a1200' | 'offline' = 'offline'): number {
  return tier === 'a500' ? 400 : tier === 'a1200' ? 900 : 3000;
}

import { crLog } from './crLog';

/**
 * Fused multiply-add a*b+c with one rounding, via Dekker's exact product and a two-sum (inputs here are O(1), so no
 * overflow or underflow). Differs from a true fma only when the residual sum itself rounds across a tie, which does
 * not occur for the 53-bit draws randn feeds it (verified against numpy on the fixture).
 */
function fma(a: number, b: number, c: number): number {
  const p = a * b;
  const SPLIT = 134217729; // 2^27 + 1
  let t = SPLIT * a; const ah = t - (t - a), al = a - ah;
  t = SPLIT * b; const bh = t - (t - b), bl = b - bh;
  const e = ((ah * bh - p) + ah * bl + al * bh) + al * bl;
  const s = p + c;
  const bb = s - p;
  const err = (p - (s - bb)) + (c - bb);
  return s + (err + e);
}

// ── numpy RandomState (MT19937) ────────────────────────────────────────────

/** numpy.random.RandomState(seed) for an integer seed: MT19937 `init_genrand`, `random_sample` 53-bit doubles. */
export class NumpyRandomState {
  private readonly mt = new Uint32Array(624);
  private mti = 625;
  /** legacy_gauss cache (numpy's has_gauss / gauss): survives interleaved rand() calls, as in numpy. */
  private hasGauss = false;
  private gauss = 0;

  constructor(seed: number) {
    const mt = this.mt;
    mt[0] = seed >>> 0;
    for (let i = 1; i < 624; i++) {
      const prev = mt[i - 1]! ^ (mt[i - 1]! >>> 30);
      // 1812433253 * prev + i, in 32-bit arithmetic
      mt[i] = (Math.imul(1812433253, prev) + i) >>> 0;
    }
    this.mti = 624;
  }

  private nextU32(): number {
    const mt = this.mt;
    if (this.mti >= 624) {
      for (let k = 0; k < 624; k++) {
        const y = (mt[k]! & 0x80000000) | (mt[(k + 1) % 624]! & 0x7fffffff);
        mt[k] = (mt[(k + 397) % 624]! ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0)) >>> 0;
      }
      this.mti = 0;
    }
    let y = mt[this.mti++]!;
    y ^= y >>> 11;
    y = (y ^ ((y << 7) & 0x9d2c5680)) >>> 0;
    y = (y ^ ((y << 15) & 0xefc60000)) >>> 0;
    y ^= y >>> 18;
    return y >>> 0;
  }

  /** `rand()` / `random_sample()`. */
  rand(): number {
    const a = this.nextU32() >>> 5, b = this.nextU32() >>> 6;
    return (a * 67108864 + b) / 9007199254740992;
  }

  /**
   * `randn()` (legacy_gauss): polar Box-Muller; returns f*x2 and caches f*x1 for the next call. `log` is correctly rounded
   * (crLog), which is what numpy's libm returns; `fma` mirrors numpy's contracted r2.
   */
  randn(): number {
    if (this.hasGauss) { this.hasGauss = false; return this.gauss; }
    let x1: number, x2: number, r2: number;
    do {
      x1 = 2.0 * this.rand() - 1.0;
      x2 = 2.0 * this.rand() - 1.0;
      r2 = fma(x1, x1, x2 * x2); // numpy's arm64 build contracts x1*x1 + x2*x2 into one fused multiply-add
    } while (r2 >= 1.0 || r2 === 0.0);
    const f = Math.sqrt((-2.0 * crLog(r2)) / r2);
    this.gauss = f * x1;
    this.hasGauss = true;
    return f * x2;
  }

  /** `randn(size)`: size draws in order (an odd size drops nothing here: the cache carries to the next call, as numpy). */
  randnArray(size: number): Float64Array {
    const out = new Float64Array(size);
    for (let i = 0; i < size; i++) out[i] = this.randn();
    return out;
  }

  /** `uniform(low, high)`. */
  uniform(low: number, high: number): number {
    return low + (high - low) * this.rand();
  }

  /** `uniform(low, high, size)`: size draws in order. */
  uniformArray(low: number, high: number, size: number): Float64Array {
    const out = new Float64Array(size);
    for (let i = 0; i < size; i++) out[i] = this.uniform(low, high);
    return out;
  }

  /** `randint(low, high, size)` (legacy RandomState, masked rejection on 32-bit draws; high - low <= 2^32). */
  randint(low: number, high: number, size: number): Int32Array {
    const rng = high - low - 1;
    const out = new Int32Array(size);
    if (rng <= 0) { out.fill(low); return out; }
    let mask = rng;
    mask |= mask >>> 1; mask |= mask >>> 2; mask |= mask >>> 4; mask |= mask >>> 8; mask |= mask >>> 16;
    mask >>>= 0;
    for (let i = 0; i < size; i++) {
      let v: number;
      do { v = (this.nextU32() & mask) >>> 0; } while (v > rng);
      out[i] = low + v;
    }
    return out;
  }
}

// ── numpy helpers ──────────────────────────────────────────────────────────

/** `np.linspace(a, b, n)`: i x step + a, the last point exactly b. */
export function linspace(a: number, b: number, n: number): Float64Array {
  const out = new Float64Array(n);
  if (n === 1) { out[0] = a; return out; }
  const step = (b - a) / (n - 1);
  for (let i = 0; i < n; i++) out[i] = i * step + a;
  out[n - 1] = b;
  return out;
}

/** `np.interp(x, xp, fp)`: xp increasing; clamps outside. */
export function interp(x: number, xp: ArrayLike<number>, fp: ArrayLike<number>): number {
  const n = xp.length;
  if (x <= xp[0]!) return fp[0]!;
  if (x >= xp[n - 1]!) return fp[n - 1]!;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xp[mid]! <= x) lo = mid; else hi = mid; }
  const x0 = xp[lo]!, x1 = xp[hi]!;
  if (x1 === x0) return fp[hi]!;
  // numpy's arr_interp: an exact knot returns its value, else slope x (x - x0) + y0
  if (x === x0) return fp[lo]!;
  const slope = (fp[hi]! - fp[lo]!) / (x1 - x0);
  return slope * (x - x0) + fp[lo]!;
}

/** `np.gradient(y)` with unit spacing: central differences, one-sided at the ends. */
function gradient(y: Float64Array): Float64Array {
  const n = y.length;
  const g = new Float64Array(n);
  if (n < 2) return g;
  g[0] = y[1]! - y[0]!;
  g[n - 1] = y[n - 1]! - y[n - 2]!;
  for (let i = 1; i < n - 1; i++) g[i] = (y[i + 1]! - y[i - 1]!) / 2;
  return g;
}

// ── the simulation (turntable.py :102-197) ─────────────────────────────────

/** A hand control point: fraction of the gesture, target angle in record samples (at `rate`) from the anchor, grip 0..1. */
export type TtHandPoint = readonly [t: number, angle: number, grip: number];

export interface TtSimOptions {
  deck?: TtDeck; slipmat?: TtSlipmat; record?: TtRecord; performer?: TtPerformer; cartridge?: TtCartridge;
  tier?: 'a500' | 'a1200' | 'offline';
  platterTarget?: number; warp?: number; eccentricity?: number; quartz?: boolean;
  grooveDrag?: number; motorNoise?: number; seed?: number;
  /** Needle skip (T10, turntable.py :164-175): a hand over-acceleration (|alpha_r| > 8) may jump a groove for 6 ms,
   *  with probability skip x 0.02 per control step. 0 = never (the demo's renders never set it). */
  skip?: number;
  /** The record's starting velocity (the reference starts it locked to the platter: `platter_target`). */
  recordStart?: number;
}

/** Control-rate tracks of one gesture: `t` (0..1 of the gesture), the record and platter velocities (playback ratio), the slip, the record angle (samples). */
export interface TtSimResult {
  t: Float64Array;
  recordVel: Float64Array;
  platterVel: Float64Array;
  slipVel: Float64Array;
  recordAngle: Float64Array;
  surface: number;
  bw: number;
  durSec: number;
  controlRate: number;
}

/** Reachability sentinel: simulations run. */
export const turntableSimStats = { runs: 0, cartridgeResponses: 0 };

export function simulate(handPath: readonly TtHandPoint[], durSec: number, rate: number = TT_RATE, opts: TtSimOptions = {}): TtSimResult {
  turntableSimStats.runs++;
  const dk = TT_DECKS[opts.deck ?? 'classic_sl1200'];
  const sm = TT_SLIPMATS[opts.slipmat ?? 'thin_battle'];
  const rc = TT_RECORDS[opts.record ?? 'light_battle'];
  const pf = TT_PERFORMERS[opts.performer ?? 'tight_battle'];
  const ct = TT_CARTRIDGES[opts.cartridge ?? 'battle'];
  const platterTarget = opts.platterTarget ?? TT_NOMINAL;
  const warp = opts.warp ?? 0, eccentricity = opts.eccentricity ?? 0, quartz = !!opts.quartz;
  const grooveDrag = opts.grooveDrag ?? 0, motorNoise = opts.motorNoise ?? 0, skip = opts.skip ?? 0;
  const cr = controlRate(opts.tier);
  const nCtrl = Math.max(4, Math.trunc(durSec * cr));
  const dt = 1.0 / cr;
  const Ip = dk.Ip, Ir = rc.Ir;
  const ts = handPath.map((p) => p[0]), ang = handPath.map((p) => p[1]), grip = handPath.map((p) => p[2]);
  const tc = linspace(0, 1, nCtrl);
  const tgtAngle = new Float64Array(nCtrl);
  const gripC = new Float64Array(nCtrl);
  for (let k = 0; k < nCtrl; k++) { tgtAngle[k] = interp(tc[k]!, ts, ang); gripC[k] = interp(tc[k]!, ts, grip); }
  const tgtVel = gradient(tgtAngle).map((g) => g / (dt * rate));
  const rng = new NumpyRandomState((opts.seed ?? 0) >>> 0);
  const ripplePhase = rng.rand() * 6.28;
  const ripple = new Float64Array(nCtrl), warpMod = new Float64Array(nCtrl);
  for (let k = 0; k < nCtrl; k++) {
    ripple[k] = dk.ripple * Math.sin(2 * Math.PI * 5.0 * tc[k]! * durSec + ripplePhase);
    warpMod[k] = 1.0 + warp * 0.01 * Math.sin(2 * Math.PI * tc[k]! * durSec * 0.55)
      + eccentricity * 0.008 * Math.sin(2 * Math.PI * tc[k]! * durSec * 0.55 + 1.0);
  }
  let pv = platterTarget;
  let rv = opts.recordStart ?? platterTarget;
  let ra = 0.0;
  let servoI = 0.0;
  const maxHt = 1.6 * pf.strength;
  const recV = new Float64Array(nCtrl), plaV = new Float64Array(nCtrl), slipV = new Float64Array(nCtrl), recA = new Float64Array(nCtrl);
  const kp = dk.kp * (quartz ? 2.2 : 1.0);
  const ki = dk.ki * (quartz ? 1.8 : 1.0);
  // motor / bearing noise: drawn whatever its amount (the reference consumes the generator here)
  const mnoise = new Float64Array(nCtrl);
  for (let k = 0; k < nCtrl; k++) mnoise[k] = rng.uniform(-1, 1);
  for (let k = 0; k < nCtrl; k++) mnoise[k] = motorNoise * (0.004 * mnoise[k]! + 0.003 * Math.sin(2 * Math.PI * 8.0 * tc[k]! * durSec));
  const clip = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
  let skipLeft = 0;
  let alphaRPrev = 0;
  for (let k = 0; k < nCtrl; k++) {
    // motor servo
    const err = platterTarget * warpMod[k]! - pv;
    servoI = clip(servoI + err * dt, -2.0, 2.0);
    let motor = clip(kp * err + ki * servoI, -dk.max_torque, dk.max_torque);
    motor += ripple[k]! + mnoise[k]!;
    // slipmat friction
    const slip = pv - rv;
    const stick = sm.stick ? 1.0 + sm.stick * (rng.rand() - 0.5) : 1.0;
    const fric = (sm.static * Math.tanh(slip / 0.03) + sm.visc * slip) * stick;
    // the hand: spring-damper scaled by grip
    const g = gripC[k]! * pf.radius;
    const hand = clip(g * (pf.stiffness * (tgtAngle[k]! - ra) / rate + pf.damping * (tgtVel[k]! - rv)), -maxHt, maxHt);
    // stylus drag
    const stylus = ct.stylus_drag * Math.tanh(rv / 0.05) * (1.0 + grooveDrag * Math.abs(rv));
    // the needle skip (opt-in): the generator is drawn only when the earlier terms hold (Python's `and`)
    if (skip > 0 && skipLeft === 0 && Math.abs(k ? alphaRPrev : 0.0) > 8.0 && rng.rand() < skip * 0.02) {
      skipLeft = Math.trunc(0.006 * cr);
    }
    // integrate record + platter
    const alphaR = (hand + fric - stylus) / Ir;
    const alphaP = (motor - dk.bearing * pv - fric) / Ip;
    alphaRPrev = alphaR;
    rv += alphaR * dt;
    if (skipLeft > 0) {
      // jump the groove briefly: np.sign(rv or 1)
      ra += 0.02 * rate * dt * (rv === 0 ? 1 : Math.sign(rv));
      skipLeft -= 1;
    }
    pv += alphaP * dt;
    ra += rv * rate * dt;
    recV[k] = rv; plaV[k] = pv; slipV[k] = pv - rv; recA[k] = ra;
  }
  return { t: tc, recordVel: recV, platterVel: plaV, slipVel: slipV, recordAngle: recA, surface: ct.surface, bw: ct.bw, durSec, controlRate: cr };
}

/** turntable.py `_lp`: a one-pole low-pass, cutoff capped at 0.45 x the rate. */
export function cartridgeLp(x: ArrayLike<number>, fc: number, rate: number): Float64Array {
  const a = Math.exp(-2 * Math.PI * Math.min(fc, rate * 0.45) / rate);
  const y = new Float64Array(x.length);
  let acc = 0.0;
  for (let i = 0; i < x.length; i++) { acc = a * acc + (1 - a) * x[i]!; y[i] = acc; }
  return y;
}

/**
 * turntable.py `cartridge_response` (T6): band-limit to the cartridge's bandwidth; a worn or heavy-tracking stylus
 * adds tracking distortion and a darker top. The demo never calls it in a render (owner decision 2026-10-12, T6:
 * ported as an available function, applied nowhere).
 */
export function cartridgeResponse(x: ArrayLike<number>, rate: number, cartridge: TtCartridge = 'battle'): Float64Array {
  turntableSimStats.cartridgeResponses++;
  const ct = TT_CARTRIDGES[cartridge];
  let y = cartridgeLp(x, ct.bw, rate);
  if (cartridge === 'worn_stylus' || cartridge === 'heavy_tracking') {
    for (let i = 0; i < y.length; i++) y[i] = Math.tanh(y[i]! * 1.3) / 1.3;
    y = cartridgeLp(y, ct.bw * 0.8, rate);
  }
  return y;
}

/** A track at audio-rate index `i` of `n` (the reference's `np.interp(linspace(0, 1, n), tc, track)`). */
export function audioRateSample(sim: TtSimResult, track: Float64Array, i: number, n: number): number {
  return interp(n > 1 ? i / (n - 1) : 0, sim.t, track);
}

/** A track at a time in the gesture, seconds. */
export function trackAt(sim: TtSimResult, track: Float64Array, sec: number): number {
  return interp(sim.durSec > 0 ? sec / sim.durSec : 0, sim.t, track);
}

// ── validation + repair (turntable.py :425-445) ────────────────────────────

/** Unphysical motion (reference `validate_motion`). */
export function validateMotion(sim: Pick<TtSimResult, 'platterVel' | 'recordVel'>): string[] {
  const issues: string[] = [];
  let minP = Infinity, maxR = 0, maxD = 0;
  for (let i = 0; i < sim.platterVel.length; i++) minP = Math.min(minP, sim.platterVel[i]!);
  for (let i = 0; i < sim.recordVel.length; i++) {
    maxR = Math.max(maxR, Math.abs(sim.recordVel[i]!));
    if (i > 0) maxD = Math.max(maxD, Math.abs(sim.recordVel[i]! - sim.recordVel[i - 1]!));
  }
  if (minP < -0.2) issues.push('platter reversed during scratch (coupling too strong / inertia low)');
  if (maxR > 6.0) issues.push('record speed exceeds safe interpolation limit');
  if (maxD > 3.0) issues.push('release/acceleration discontinuous');
  return issues;
}

/** Reference `repair_params`: the parameter set that fixes the flagged motion. */
export function repairParams(sim: Pick<TtSimResult, 'platterVel' | 'recordVel'>, base: TtSimOptions): TtSimOptions {
  const p: TtSimOptions = { ...base };
  for (const i of validateMotion(sim)) {
    if (i.includes('platter reversed')) p.record = 'heavy_vinyl';
    if (i.includes('discontinuous')) p.slipmat = 'felt_standard';
    if (i.includes('exceeds safe')) p.performer = 'light_touch';
  }
  return p;
}

/** Simulate, and when the motion is unphysical simulate once more with the repaired parameters (physics s.57/58). */
export function simulateRepaired(handPath: readonly TtHandPoint[], durSec: number, rate: number = TT_RATE, opts: TtSimOptions = {}): TtSimResult & { repaired: boolean } {
  const sim = simulate(handPath, durSec, rate, opts);
  if (!validateMotion(sim).length) return { ...sim, repaired: false };
  return { ...simulate(handPath, durSec, rate, repairParams(sim, opts)), repaired: true };
}

// ── surface noise, needle drop / lift (turntable.py :363-402) ─────────────

/** The surface-noise bed (reference `surface_noise`: RandomState(seed + 99).uniform(-1, 1, n)). */
export function surfaceBed(lengthSamples: number, seed = 0): Float32Array {
  const rng = new NumpyRandomState((seed + 99) >>> 0);
  const bed = new Float32Array(Math.max(1, Math.trunc(lengthSamples)));
  for (let i = 0; i < bed.length; i++) bed[i] = rng.uniform(-1, 1);
  return bed;
}

/** A needle drop (physics s.48): a click, the cartridge settling at 90 Hz, the surface coming in; 120 ms. */
export function needleDrop(rate: number, cartridge: TtCartridge = 'battle', seed = 0): Float32Array {
  const n = Math.trunc(0.12 * rate);
  const rng = new NumpyRandomState(seed >>> 0);
  const click = new Float64Array(n), surfRand = new Float64Array(n);
  for (let t = 0; t < n; t++) click[t] = rng.uniform(-1, 1);
  for (let t = 0; t < n; t++) surfRand[t] = rng.uniform(-1, 1);
  const out = new Float32Array(n);
  const surface = TT_CARTRIDGES[cartridge].surface;
  for (let t = 0; t < n; t++) {
    const c = click[t]! * Math.exp(-t / (0.002 * rate));
    const settle = Math.sin(2 * Math.PI * 90 * t / rate) * Math.exp(-t / (0.03 * rate)) * 0.4;
    const surf = surface * surfRand[t]! * (1 - Math.exp(-t / (0.02 * rate)));
    out[t] = 0.6 * c + settle + surf;
  }
  return out;
}

/** A needle lift (physics s.48): a small click, then silence; 40 ms. */
export function needleLift(rate: number, seed = 0): Float32Array {
  const n = Math.trunc(0.04 * rate);
  const rng = new NumpyRandomState((seed + 1) >>> 0);
  const out = new Float32Array(n);
  for (let t = 0; t < n; t++) out[t] = 0.5 * rng.uniform(-1, 1) * Math.exp(-t / (0.0015 * rate));
  return out;
}

// ── deck actions (turntable.py :344-361) ──────────────────────────────────

/** Platter-only speed effect: start ramps up, stop / brake ramp down, power-off coasts. Value at fraction t of the action. */
export function deckMotionAt(action: 'start' | 'stop' | 'brake' | 'power_off', t: number, opts: { deck?: TtDeck; brake?: 'fast_stop' | 'classic_stop' | 'loose_stop' | 'power_down_coast'; startSpeed?: number } = {}): number {
  const startSpeed = opts.startSpeed ?? TT_NOMINAL;
  const dk = TT_DECKS[opts.deck ?? 'classic_sl1200'];
  const strength = { fast_stop: 6.0, classic_stop: 3.0, loose_stop: 1.5, power_down_coast: 0.8 }[opts.brake ?? 'classic_stop'];
  if (action === 'start') return startSpeed * (1 - Math.exp(-t * 5.0 * dk.kp / 9.0));
  if (action === 'stop' || action === 'brake') return startSpeed * Math.exp(-t * strength);
  return startSpeed * Math.exp(-t * (dk.bearing * 20 + 0.5));
}

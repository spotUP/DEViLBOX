/**
 * The Up Rough hat path of tools/hiphop.py render_drum_bar (plan 2026-10-19 O6d): ProbabilityMemory round robin,
 * pick_hat_index, draw_hat_vary, apply_hat_vary (+ _zone_eq), render_open_hat_choke and build_hat_pool, bit-exact.
 *
 * float32: the host holds hats as numpy float32. Every float32 array operation rounds once, so each binary op here is
 * Math.fround'ed on its own (a float64 intermediate carried across two ops would differ in the last bit). A python
 * float scalar meeting a float32 array is rounded to float32 first (NEP 50), hence `fround(g)` before the multiply.
 *
 * Seeds: the pool seed is the SONG seed when `_render_song` builds the pool once (hiphop.py 6041); when render_drum_bar
 * runs standalone and builds its own pool, it is the BAR seed. The caller chooses; buildHatPool takes whichever it is
 * given. The hat PyRandom (barHatRng) is FRESH every bar (seed ^ 0x4A77, seed = song seed + bar index); the
 * ProbabilityMemory persists across the bars of one song. Sub-hits draw from the CLOSED pool even for `oh`.
 * `choke_at_ms` arrives as event data (phrase_engine.apply_chokes is upstream).
 */
import { linspaceAt, resampleRatio } from './humanize';
import { HAT_CHAR, type HipHopStyle } from './drumBank';
import { PyRandom } from './pyRandom';
import { NumpyRandomState } from '@/engine/turntable/turntableSim';
import { hat, onepoleLp } from '@/engine/dj/scratch/demoDrums';
import { pexp2 } from '@/engine/dj/scratch/portableMath';

const f32 = Math.fround;

/** phrase_engine.ProbabilityMemory: round robin that never repeats at once and recovers slowly. */
export class ProbabilityMemory {
  readonly w: number[];
  last = -1;
  readonly decay: number;
  constructor(nChoices: number, decay = 0.7) {
    this.decay = decay;
    this.w = new Array<number>(nChoices).fill(1.0);
  }

  pick(rng: PyRandom, weights?: readonly number[]): number {
    const w = weights && weights.length ? [...weights] : [...this.w];
    if (this.last >= 0 && this.last < w.length) w[this.last] = 0.0; // never an immediate repeat
    let sum = 0;
    for (const x of w) sum += x;
    const tot = sum || 1.0;
    const r = rng.random() * tot;
    let acc = 0.0;
    for (let i = 0; i < w.length; i++) {
      acc += w[i]!;
      if (r <= acc) return i;
    }
    return w.length - 1;
  }

  note(choice: number): void {
    for (let i = 0; i < this.w.length; i++) this.w[i] = Math.min(1.0, this.w[i]! / this.decay);
    // python `self.decay ** 2`: pow(x, 2) is correctly rounded x*x
    this.w[choice] = this.w[choice]! * (this.decay * this.decay);
    this.last = choice;
  }
}

/** hiphop.pick_hat_index: pick, then note. */
export function pickHatIndex(pm: ProbabilityMemory, rng: PyRandom): number {
  const idx = pm.pick(rng);
  pm.note(idx);
  return idx;
}

/** The per-bar hat stream: `random.Random(seed ^ 0x4A77)` with Python int semantics (BigInt, never int32 XOR). */
export function barHatRng(seed: number | bigint): PyRandom {
  return new PyRandom(BigInt(seed) ^ 0x4A77n);
}

export type HatZone = 'edge' | 'middle' | 'tip' | 'bell' | string;
export interface HatVary {
  off: number; cents: number; atk: number; decay: number; lp: number; gain: number; zone: HatZone; noise_seed: number;
}

const ZONES: readonly (readonly [string, number])[] = [['edge', 0.25], ['middle', 0.45], ['tip', 0.27], ['bell', 0.03]];

/** hiphop.draw_hat_vary: nine draws in the host's order (a forced `zone` skips its draw). */
export function drawHatVary(rng: PyRandom, zoneIn: HatZone | null = null): HatVary {
  const off = rng.uniform(0.0, 0.005);
  const mag = rng.uniform(2.0, 5.0);
  const cents = mag * (rng.random() < 0.5 ? 1 : -1);
  const atk = rng.uniform(0.0, 0.001);
  const decay = 1.0 + rng.uniform(-0.05, 0.05);
  const lp = 12000.0 * (1.0 + rng.uniform(-0.03, 0.03));
  const gain = 1.0 + rng.uniform(-0.05, 0.05);
  let zone: HatZone;
  if (zoneIn === null) {
    const rv = rng.random();
    zone = 'middle';
    let acc = 0.0;
    for (const [zn, w] of ZONES) {
      acc += w;
      if (rv <= acc) { zone = zn; break; }
    }
  } else zone = zoneIn;
  const noise_seed = rng.randrange(1 << 30);
  return { off, cents, atk, decay, lp, gain, zone, noise_seed };
}

/** _one_pole_lp: synth_dsp.lp1 in float64, rounded to float32. */
function onePoleLp(x: ArrayLike<number>, fc: number, rate: number): Float64Array {
  const y = onepoleLp(Float64Array.from(x), fc, rate);
  for (let i = 0; i < y.length; i++) y[i] = f32(y[i]!);
  return y;
}

/** _scale_decay: band-limited resample by 1 / factor. */
function scaleDecay(x: ArrayLike<number>, factor: number): Float64Array {
  return resampleRatio(x, 1.0 / factor);
}

/*
 * _ZONE_EQ_PARAMS gains are python `10 ** (dB / 20.0)` (platform pow): the host's doubles, hardcoded. The test checks
 * them against the fixture.
 */
export const ZONE_EQ_PARAMS: Readonly<Record<string, readonly [number | null, number, 'hi' | 'broad' | 'bp']>> = {
  edge: [8000.0, 1.2589254117941673, 'hi'],   // +2 dB @ 8 kHz
  middle: [6000.0, 0.8912509381337456, 'hi'], // -1 dB @ 6 kHz high shelf
  tip: [null, 0.8413951416451951, 'broad'],   // -1.5 dB broadband
  bell: [3200.0, 1.4125375446227544, 'bp'],   // +3 dB @ 3.2 kHz bandpass
};

/** hiphop._zone_eq, every float32 op rounded on its own. */
export function zoneEq(x: Float64Array, zone: HatZone, rate = 44100): Float64Array {
  const [fc, g, kind] = ZONE_EQ_PARAMS[zone] ?? ZONE_EQ_PARAMS.middle!;
  const n = x.length;
  const out = new Float64Array(n);
  if (kind === 'broad') {
    const gf = f32(g);
    for (let i = 0; i < n; i++) out[i] = f32(x[i]! * gf);
    return out;
  }
  if (kind === 'hi') {
    const lpd = onePoleLp(x, fc!, rate);
    const hi = new Float64Array(n);
    for (let i = 0; i < n; i++) hi[i] = f32(x[i]! - lpd[i]!);
    if (g > 1.0) { // boost highs
      const k = f32(g - 1.0);
      for (let i = 0; i < n; i++) out[i] = f32(x[i]! + f32(k * hi[i]!));
    } else { // cut highs
      const k = f32(g);
      for (let i = 0; i < n; i++) out[i] = f32(lpd[i]! + f32(k * hi[i]!));
    }
    return out;
  }
  // bp
  const lo = onePoleLp(x, fc! * 2.0, rate);
  const bp = new Float64Array(n);
  for (let i = 0; i < n; i++) bp[i] = f32(f32(x[i]! - lo[i]!) * 1.0);
  const lo2 = onePoleLp(bp, fc! * 0.5, rate);
  for (let i = 0; i < n; i++) bp[i] = f32(bp[i]! - lo2[i]!);
  const k = f32(g - 1.0);
  for (let i = 0; i < n; i++) out[i] = f32(x[i]! + f32(k * bp[i]!));
  return out;
}

/** hiphop.apply_hat_vary with aging = 0 (the render path never ages): one hat hit from draw_hat_vary's data. */
export function applyHatVary(smp: ArrayLike<number>, v: HatVary, rate = 44100): Float64Array {
  let out: Float64Array = Float64Array.from(smp, f32);
  const off = Math.trunc(v.off * rate);
  if (off && off < Math.floor(out.length / 4)) out = out.slice(off);
  out = resampleRatio(out, pexp2(v.cents / 1200.0));
  const atk = Math.trunc(v.atk * rate);
  if (atk && atk <= out.length) {
    for (let i = 0; i < atk; i++) out[i] = f32(out[i]! * linspaceAt(0.0, 1.0, atk, i));
  }
  out = scaleDecay(out, v.decay);
  out = onePoleLp(out, v.lp, rate);
  const gf = f32(v.gain);
  for (let i = 0; i < out.length; i++) out[i] = f32(out[i]! * gf);
  out = zoneEq(out, v.zone, rate);
  // analog noise floor: RandomState(noise_seed).randn(n).astype(float32) * 3e-4
  const noise = new NumpyRandomState(v.noise_seed).randnArray(out.length);
  const scale = f32(3e-4);
  for (let i = 0; i < out.length; i++) out[i] = f32(out[i]! + f32(f32(noise[i]!) * scale));
  return out;
}

/** hiphop.render_open_hat_choke: full = hard truncate (8 ms fade), partial = ring-out (80 ms fade). */
export function renderOpenHatChoke(smp: ArrayLike<number>, chokeAtMs: number, partial: boolean, rate: number): Float64Array {
  const out = Float64Array.from(smp, f32);
  const cut = Math.trunc(chokeAtMs / 1000.0 * rate);
  if (cut >= out.length) return out;
  const fade = Math.min(out.length - cut, Math.trunc((partial ? 0.080 : 0.008) * rate));
  out.fill(0.0, cut + fade);
  for (let i = 0; i < fade; i++) out[cut + i] = f32(out[cut + i]! * linspaceAt(1.0, 0.0, fade, i));
  return out;
}

/** hiphop.build_hat_pool: 6..12 closed-hat variants; `seed` is the song seed (song render) or the bar seed (standalone). */
export function buildHatPool(style: HipHopStyle | string, rate: number, seed: number | bigint, nIn = 8): Float64Array[] {
  const n = Math.max(6, Math.min(12, nIn));
  const [bright, lp, nscale] = HAT_CHAR[style as HipHopStyle] ?? HAT_CHAR.golden_era;
  const pool: Float64Array[] = [];
  for (let i = 0; i < n; i++) {
    const r = new PyRandom((BigInt(seed) << 4n) ^ BigInt(i));
    const tune = bright * (1.0 + r.uniform(-0.04, 0.04));
    const cut = lp * (1.0 + r.uniform(-0.08, 0.08));
    const noi = nscale * (1.0 + r.uniform(-0.10, 0.10));
    let h: Float64Array = hat({ open_hat: false, tune, machine: '909', seed: 4 + i, noise: noi }, rate);
    for (let k = 0; k < h.length; k++) h[k] = f32(h[k]!);
    h = onePoleLp(h, cut, rate);
    h = scaleDecay(h, [0.85, 1.0, 1.25][i % 3]!);
    const tLen = Math.min(h.length, Math.trunc(0.004 * rate));
    h = h.slice();
    if (tLen > 0) { // the transient draw happens only here
      const m = f32(1.0 + r.uniform(-0.15, 0.15));
      for (let k = 0; k < tLen; k++) h[k] = f32(h[k]! * m);
    }
    pool.push(h);
  }
  return pool;
}

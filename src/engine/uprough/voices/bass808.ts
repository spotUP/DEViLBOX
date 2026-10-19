/**
 * The Up Rough 808 bass voice: tools/trap808.py `render_808_note` (sample-exact, same op order, same
 * generators) plus its helpers (`_seeded_noise`, the velocity/accent drive gate, the parallel layer, the sub
 * reinforcement). Float64 whole array at SOFTSYNTH_RATE. numpy's tanh / sin / arcsin are libm and V8's are
 * not bit-identical, so the match is ~1e-12, not bit-exact (see the reference test).
 */

import type { ParameterDef } from '@/engine/registry/SynthDescriptor';
import { SOFTSYNTH_RATE, type SoftsynthNote, type SoftsynthVoice } from '../softsynthVoice';
import { expDecay, semiHz, tapeSat } from '@/engine/dj/scratch/demoDrums';
import { lp as dspLp, hp as dspHp } from '@/engine/dj/scratch/refDsp';
import { pcos, pexp, psin, ptanh } from '@/engine/dj/scratch/portableMath';

/** zlib.crc32 over bytes. */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(bytes: ArrayLike<number>): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const ascii = (s: string): number[] => Array.from(s, (ch) => ch.charCodeAt(0));

export const C1_SEMI = 0;
export const C3_SEMI = 24;
/** The tracker note that is the reference's `semi` 0 (C1). */
export const BASS808_C1_MIDI = 24;

/** trap808.DEFAULT_PROFILE (the s.53 Strong Default 808); string modes as indices. */
export const DRIVE_KINDS = ['asym', 'tube', 'tape', 'soft'] as const;
export const PHASE_MODES = ['PHASE_RESET', 'FREE_PHASE', 'SAFE_RANDOM_PHASE'] as const;

export interface Profile808 {
  sine_mix: number; tri_mix: number; click_amt: number; click_ms: number;
  pitch_start_semi: number; pitch_drop_ms: number; attack_ms: number; release_ms: number;
  decay_low_ms: number; decay_high_ms: number;
  drive_kind: (typeof DRIVE_KINDS)[number]; drive_amt: number; cleanup_lp_hz: number;
  phase_mode: (typeof PHASE_MODES)[number];
  parallel_hp_hz: number; parallel_lp_hz: number; parallel_wet: number; parallel_auto: boolean;
  sub_wet: number; sub_lp_hz: number;
}

export const DEFAULT_PROFILE_808: Profile808 = {
  sine_mix: 0.9, tri_mix: 0.1, click_amt: 0.08, click_ms: 4.0,
  pitch_start_semi: 12.0, pitch_drop_ms: 45.0, attack_ms: 5.0, release_ms: 55.0,
  decay_low_ms: 2500.0, decay_high_ms: 900.0,
  drive_kind: 'asym', drive_amt: 0.14, cleanup_lp_hz: 3200.0,
  phase_mode: 'PHASE_RESET',
  parallel_hp_hz: 130.0, parallel_lp_hz: 2800.0, parallel_wet: 0.18, parallel_auto: false,
  sub_wet: 0.0, sub_lp_hz: 70.0,
};

/** `_seeded_noise(n, seed)`: xorshift32 seeded from crc32(b"trap808") ^ seed, in [-1, 1). */
export function seededNoise(n: number, seed: number): Float64Array {
  let state = ((crc32(ascii('trap808')) ^ (seed >>> 0)) >>> 0);
  if (state === 0) state = 0x1d872b41;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    state = (state ^ ((state << 13) >>> 0)) >>> 0;
    state = (state ^ (state >>> 17)) >>> 0;
    state = (state ^ ((state << 5) >>> 0)) >>> 0;
    out[i] = (state / 0xffffffff) * 2.0 - 1.0;
  }
  return out;
}

/** `_lin_ramp_up`: np.linspace(0, 1, a, endpoint=False) over the first `a` samples. */
function linRampUp(n: number, ms: number, rate: number): Float64Array {
  let a = Math.trunc(Math.max(0, ms) * 1e-3 * rate);
  const env = new Float64Array(n).fill(1);
  if (a > 0) {
    a = Math.min(a, n);
    const step = 1 / a;
    for (let i = 0; i < a; i++) env[i] = i * step;
  }
  return env;
}

/** `_release_tail`: np.linspace(1, 0, r) over the last `r` samples. */
function releaseTail(n: number, ms: number, rate: number): Float64Array {
  let r = Math.trunc(Math.max(0, ms) * 1e-3 * rate);
  const env = new Float64Array(n).fill(1);
  if (r > 0) {
    r = Math.min(r, n);
    const step = r > 1 ? -1 / (r - 1) : 0;
    for (let i = 0; i < r; i++) env[n - r + i] = i * step + 1;
    if (r > 1) env[n - 1] = 0;
  }
  return env;
}

export function noteDecayMs(semi: number, p: Pick<Profile808, 'decay_low_ms' | 'decay_high_ms'>): number {
  const lo = p.decay_low_ms, hi = p.decay_high_ms;
  const frac = Math.min(1.0, Math.max(0.0, (semi - C1_SEMI) / (C3_SEMI - C1_SEMI)));
  return lo + (hi - lo) * frac;
}

function phase0(mode: Profile808['phase_mode'], seed: number): number {
  if (mode === 'SAFE_RANDOM_PHASE') return (crc32([...ascii('phase'), ...ascii(String(seed))]) & 0xffff) / 65535.0;
  return 0.0;
}

export const velocityLengthFactor = (v: number): number => 1.0 + 0.15 * (v - 1.0);
export const velocityBrightFactor = (v: number): number => 1.0 + 0.2 * (v - 1.0);
const ACCENT_VELOCITY_THRESHOLD = 1.05;
const DRIVE_VELOCITY_PULLBACK = 0.5;
const DRIVE_ACCENT_LIFT = 0.6;
export const isAccentVelocity = (v: number, accent = false): boolean => accent || v >= ACCENT_VELOCITY_THRESHOLD;

export function gatedDriveAmt(baseAmt: number, velocity: number, accent: boolean): number {
  const base = baseAmt;
  if (base <= 0.0) return base;
  const v = velocity;
  if (isAccentVelocity(v, accent)) {
    const over = Math.min(1.0, Math.max(0.0, v - 1.0));
    let lift = DRIVE_ACCENT_LIFT * over;
    if (accent && over <= 0.0) lift = DRIVE_ACCENT_LIFT * 0.5;
    return base * (1.0 + lift);
  }
  const below = Math.min(1.0, Math.max(0.0, 1.0 - v));
  return base * (1.0 - DRIVE_VELOCITY_PULLBACK * below);
}

/** `_apply_drive`: synth_dsp asym / tube / tape_sat / soft_clip (true tanh, not the int8 LUT). */
export function applyDrive(x: Float64Array, kind: Profile808['drive_kind'], amt: number): Float64Array {
  if (amt <= 0) return x;
  const drive = 1.0 + 4.0 * amt;
  if (kind === 'tape') return tapeSat(x, drive);
  const out = new Float64Array(x.length);
  if (kind === 'asym') {
    for (let i = 0; i < x.length; i++) out[i] = x[i]! >= 0 ? ptanh(drive * x[i]!) : ptanh(0.6 * drive * x[i]!);
  } else if (kind === 'tube') {
    const off = ptanh(drive * 0.2);
    for (let i = 0; i < x.length; i++) out[i] = ptanh(drive * (x[i]! + 0.2)) - off;
  } else {
    for (let i = 0; i < x.length; i++) out[i] = ptanh(drive * x[i]!);
  }
  return out;
}

function applyParallelLayer(dry: Float64Array, p: Profile808, rate: number, velocity: number, accent: boolean): Float64Array {
  let wet = p.parallel_wet;
  if (wet <= 0.0) return dry;
  wet = Math.min(0.30, Math.max(0.0, wet * velocityBrightFactor(velocity)));
  const hpSig = dspHp(dry, p.parallel_hp_hz, rate, 4);
  const layerAmt = Math.min(0.6, gatedDriveAmt(p.drive_amt, velocity, accent) * 1.6 + 0.10);
  const sat = dspLp(applyDrive(hpSig, p.drive_kind, layerAmt), p.parallel_lp_hz, rate);
  const out = new Float64Array(dry.length);
  for (let i = 0; i < dry.length; i++) out[i] = dry[i]! + wet * sat[i]!;
  return out;
}

export interface Render808Options {
  profile?: Partial<Profile808>;
  velocity?: number;
  seed?: number;
  /** ms; undefined = derive from the note (note_decay_ms). */
  decayMs?: number;
  /** Per-sample (array) or scalar additive semitone glide on the base pitch. */
  extraSemi?: number | ArrayLike<number>;
  noAttack?: boolean;
  /** Per-sample multiplicative gain (accent-slide lift). */
  gainEnv?: number | ArrayLike<number>;
  accent?: boolean;
  parallel?: boolean;
}

function fitTo(g: number | ArrayLike<number>, n: number): Float64Array {
  if (typeof g === 'number') return new Float64Array(n).fill(g);
  const out = new Float64Array(n);
  const last = g.length ? g[g.length - 1]! : 0;
  for (let i = 0; i < n; i++) out[i] = i < g.length ? g[i]! : last;
  return out;
}

/** trap808.render_808_note. `semi` is the offset from C1 (semi_hz convention). */
export function render808Note(semi: number, durSec: number, rate = SOFTSYNTH_RATE, opts: Render808Options = {}): Float64Array {
  const p: Profile808 = { ...DEFAULT_PROFILE_808, ...opts.profile };
  const velocity = opts.velocity ?? 1.0;
  const seed = opts.seed ?? 0;
  const accent = opts.accent ?? false;
  const baseHz = semiHz(semi);

  let decMs = opts.decayMs === undefined ? noteDecayMs(semi, p) : opts.decayMs;
  decMs = decMs * velocityLengthFactor(velocity);
  const tailMs = Math.max(decMs, p.release_ms);
  let n = Math.trunc((durSec + tailMs * 1e-3) * rate) + 1;
  if (n < 2) n = 2;

  // pitch-drop envelope: drummachine._pitch_env single exponential (tail_amt 0)
  let penv: Float64Array;
  if (opts.noAttack) penv = new Float64Array(n);
  else {
    const fast = expDecay(n, p.pitch_drop_ms, rate);
    penv = new Float64Array(n);
    for (let i = 0; i < n; i++) penv[i] = p.pitch_start_semi * fast[i]!;
  }
  if (opts.extraSemi !== undefined) {
    const glide = fitTo(opts.extraSemi, n);
    for (let i = 0; i < n; i++) penv[i] = penv[i]! + glide[i]!;
  }

  const ph0 = phase0(p.phase_mode, seed);
  const body = new Float64Array(n);
  let acc = 0;
  const off = 2.0 * Math.PI * ph0;
  for (let i = 0; i < n; i++) {
    const freq = baseHz * 2.0 ** (penv[i]! / 12.0);
    acc += 2 * Math.PI * freq / rate;
    const ph = acc + off;
    const s = psin(ph);
    body[i] = p.sine_mix * s + p.tri_mix * (2.0 / Math.PI * Math.asin(psin(ph)));
  }

  const tau = Math.max(1.0, decMs * 1e-3 * rate);
  const ramp = linRampUp(n, p.attack_ms, rate);
  const rel = releaseTail(n, p.release_ms, rate);
  const gain = opts.gainEnv === undefined ? null : fitTo(opts.gainEnv, n);
  let sig: Float64Array = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let a = pexp(-k / tau);
    a *= ramp[k]!;
    a *= rel[k]!;
    if (gain) a = a * gain[k]!;
    sig[k] = body[k]! * a;
  }

  let clickAmt = p.click_amt * (0.4 + 0.6 * velocity);
  if (opts.noAttack) clickAmt = 0.0;
  if (clickAmt > 0) {
    let cn = Math.trunc(Math.max(1.0, p.click_ms) * 1e-3 * rate);
    cn = Math.min(cn, n);
    const noise = seededNoise(cn, (seed ^ 0x51c) >>> 0);
    const dec = expDecay(cn, 2.0, rate);
    for (let i = 0; i < cn; i++) sig[i] = sig[i]! + clickAmt * noise[i]! * dec[i]!;
  }

  sig = applyDrive(sig, p.drive_kind, gatedDriveAmt(p.drive_amt, velocity, accent));
  sig = dspLp(sig, p.cleanup_lp_hz * velocityBrightFactor(velocity), rate);

  if ((opts.parallel || p.parallel_auto) && p.parallel_wet > 0.0) sig = applyParallelLayer(sig, p, rate, velocity, accent);

  if (p.sub_wet > 0.0) {
    const sub = dspLp(sig, p.sub_lp_hz, rate);
    const mixed = new Float64Array(n);
    for (let i = 0; i < n; i++) mixed[i] = sig[i]! + p.sub_wet * sub[i]!;
    sig = mixed;
  }
  return sig;
}

const K = (key: string, label: string, min: number, max: number, def: number, group: string): ParameterDef =>
  ({ key, label, group, type: 'knob', min, max, default: def });

export const BASS808_PARAMS: readonly ParameterDef[] = [
  K('sine_mix', 'Sine Level', 0, 1, 0.9, 'Source'),
  K('tri_mix', 'Triangle Level', 0, 1, 0.1, 'Source'),
  K('click_amt', 'Click Amount', 0, 0.5, 0.08, 'Source'),
  K('click_ms', 'Click Length (ms)', 1, 20, 4.0, 'Source'),
  K('pitch_start_semi', 'Pitch Drop (semitones)', 0, 36, 12.0, 'Pitch'),
  K('pitch_drop_ms', 'Pitch Drop Time (ms)', 1, 300, 45.0, 'Pitch'),
  K('attack_ms', 'Attack (ms)', 0, 50, 5.0, 'Envelope'),
  K('release_ms', 'Release (ms)', 0, 500, 55.0, 'Envelope'),
  K('decay_low_ms', 'Decay Low Note (ms)', 100, 6000, 2500.0, 'Envelope'),
  K('decay_high_ms', 'Decay High Note (ms)', 100, 4000, 900.0, 'Envelope'),
  K('decay_ms', 'Decay Override (ms, 0 = automatic)', 0, 6000, 0, 'Envelope'),
  { key: 'drive_kind', label: 'Drive Type', group: 'Drive', type: 'select', default: 0,
    options: DRIVE_KINDS.map((_k, value) => ({ value, label: ['Asymmetric', 'Tube', 'Tape', 'Soft Clip'][value]! })) },
  K('drive_amt', 'Drive Amount', 0, 1, 0.14, 'Drive'),
  K('cleanup_lp_hz', 'Low Pass (Hz)', 200, 10000, 3200.0, 'Drive'),
  { key: 'phase_mode', label: 'Phase Mode', group: 'Source', type: 'select', default: 0,
    options: [{ value: 0, label: 'Phase Reset' }, { value: 1, label: 'Free Phase' }, { value: 2, label: 'Safe Random Phase' }] },
  { key: 'accent', label: 'Accent', group: 'Drive', type: 'toggle', default: 0 },
  { key: 'parallel', label: 'Parallel Harmonic Layer', group: 'Parallel', type: 'toggle', default: 0 },
  K('parallel_hp_hz', 'Parallel High Pass (Hz)', 40, 400, 130.0, 'Parallel'),
  K('parallel_lp_hz', 'Parallel Low Pass (Hz)', 500, 8000, 2800.0, 'Parallel'),
  K('parallel_wet', 'Parallel Mix', 0, 0.3, 0.18, 'Parallel'),
  K('sub_wet', 'Sub Reinforcement', 0, 2, 0.0, 'Sub'),
  K('sub_lp_hz', 'Sub Low Pass (Hz)', 30, 200, 70.0, 'Sub'),
];

/** The registry params as a Profile808 (+ the render-call flags). */
export function profileFromParams(params: Readonly<Record<string, number>>): { profile: Profile808; decayMs: number | undefined; accent: boolean; parallel: boolean } {
  const g = (k: string): number => params[k] ?? (BASS808_PARAMS.find((d) => d.key === k)!.default);
  const profile: Profile808 = {
    sine_mix: g('sine_mix'), tri_mix: g('tri_mix'), click_amt: g('click_amt'), click_ms: g('click_ms'),
    pitch_start_semi: g('pitch_start_semi'), pitch_drop_ms: g('pitch_drop_ms'),
    attack_ms: g('attack_ms'), release_ms: g('release_ms'),
    decay_low_ms: g('decay_low_ms'), decay_high_ms: g('decay_high_ms'),
    drive_kind: DRIVE_KINDS[Math.round(g('drive_kind'))] ?? 'asym', drive_amt: g('drive_amt'),
    cleanup_lp_hz: g('cleanup_lp_hz'), phase_mode: PHASE_MODES[Math.round(g('phase_mode'))] ?? 'PHASE_RESET',
    parallel_hp_hz: g('parallel_hp_hz'), parallel_lp_hz: g('parallel_lp_hz'), parallel_wet: g('parallel_wet'),
    parallel_auto: false, sub_wet: g('sub_wet'), sub_lp_hz: g('sub_lp_hz'),
  };
  const d = g('decay_ms');
  return { profile, decayMs: d > 0 ? d : undefined, accent: g('accent') >= 0.5, parallel: g('parallel') >= 0.5 };
}

export const bass808Voice: SoftsynthVoice = {
  id: 'bass808',
  label: 'Up Rough 808 Bass',
  params: BASS808_PARAMS,
  render(params: Readonly<Record<string, number>>, note: SoftsynthNote, rate: number, seed: number): Float64Array {
    const { profile, decayMs, accent, parallel } = profileFromParams(params);
    return render808Note(note.midi - BASS808_C1_MIDI, note.durSec, rate, {
      profile, decayMs, accent, parallel, velocity: note.velocity, seed,
    });
  },
};

// ---------------------------------------------------------------------------
// render_mono_sequence: the monophonic law (s.15), choke (s.14) and slides (s.16-21).
// kick_plan alignment is not ported (the mono-sequence entry used by the device passes none).
// ---------------------------------------------------------------------------

export interface Event808 { startS: number; durS: number; semi: number; slide?: boolean }

type SlideCurve = 'LINEAR' | 'EXPONENTIAL' | 'EASE_IN' | 'EASE_OUT' | 'S_CURVE';
type SlideType = 'LEGATO_SLIDE' | 'ACCENT_SLIDE' | 'FAST_SCOOP' | 'LONG_GLIDE' | 'OCTAVE_JUMP' | 'END_FALL';
const BANDS: Record<string, readonly [number, number]> = { fast: [20, 60], medium: [60, 160], long: [160, 350], drill: [80, 250] };
const SLIDE_TYPES: Record<SlideType, { band: string; curve: SlideCurve; gainLift: number }> = {
  LEGATO_SLIDE: { band: 'medium', curve: 'LINEAR', gainLift: 0 },
  ACCENT_SLIDE: { band: 'medium', curve: 'EASE_IN', gainLift: 0.30 },
  FAST_SCOOP: { band: 'fast', curve: 'EASE_IN', gainLift: 0 },
  LONG_GLIDE: { band: 'long', curve: 'S_CURVE', gainLift: 0 },
  OCTAVE_JUMP: { band: 'long', curve: 'EXPONENTIAL', gainLift: 0 },
  END_FALL: { band: 'long', curve: 'EASE_OUT', gainLift: 0 },
};
const MONO_CUT_GUARD_MS = 1.0;
const NOTE_CUT_FADE_MS = 5.0;

/** Python round(): half to even. */
function pyRound(x: number): number {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

function linspace01(num: number): Float64Array {
  const out = new Float64Array(num);
  if (num === 1) { out[0] = 0; return out; }
  const step = 1.0 / (num - 1);
  for (let i = 0; i < num; i++) out[i] = i * step;
  out[num - 1] = 1.0;
  return out;
}

function curveShape(name: SlideCurve, t: number): number {
  t = Math.min(1, Math.max(0, t));
  switch (name) {
    case 'LINEAR': return t;
    case 'EXPONENTIAL': return (pexp(4.0 * t) - 1.0) / (pexp(4.0) - 1.0);
    case 'EASE_IN': return t * t;
    case 'EASE_OUT': return 1.0 - (1.0 - t) * (1.0 - t);
    case 'S_CURVE': return t * t * (3.0 - 2.0 * t);
  }
}

function defaultSlideType(src: number, dst: number, phraseEnd = false): SlideType {
  const interval = pyRound(dst - src);
  if (phraseEnd && interval < 0) return 'END_FALL';
  if (Math.abs(interval) === 12) return 'OCTAVE_JUMP';
  return 'LEGATO_SLIDE';
}

function glideParams(ev: Event808, nxt: Event808): { type: SlideType; durMs: number } {
  const gapMs = Math.max(1.0, (nxt.startS - ev.startS) * 1000.0);
  const type = defaultSlideType(ev.semi, nxt.semi);
  const [lo, hi] = BANDS[SLIDE_TYPES[type].band]!;
  return { type, durMs: Math.min(0.5 * (lo + hi), gapMs) };
}

function chokeTail(sig: Float64Array, cutAtS: number, rate: number): Float64Array {
  const out = Float64Array.from(sig);
  const n = out.length;
  const cut = Math.trunc(Math.max(0.0, cutAtS) * rate);
  if (cut >= n) return out;
  let f = Math.trunc(NOTE_CUT_FADE_MS * 1e-3 * rate);
  f = Math.max(1, Math.min(f, n - cut));
  // numpy linspace(1, 0, f): i * step + 1 with step = -1/(f-1), the last point exactly 0
  const step = f > 1 ? (0.0 - 1.0) / (f - 1) : 0;
  for (let i = 0; i < f; i++) out[cut + i] = out[cut + i]! * (i === f - 1 && f > 1 ? 0.0 : i * step + 1.0);
  for (let i = cut + f; i < n; i++) out[i] = 0.0;
  return out;
}

/** apply_slide with default type/curve: one note struck at prevSemi that glides to targetSemi, no second attack. */
function applySlide(prevSemi: number, targetSemi: number, type: SlideType, durMs: number, durS: number,
  rate: number, profile: Profile808, seed: number): Float64Array {
  const spec = SLIDE_TYPES[type];
  const decMs = noteDecayMs(targetSemi, profile);
  const tailMs = Math.max(decMs, profile.release_ms);
  const nTotal = Math.max(2, Math.trunc((durS + tailMs * 1e-3) * rate) + 1);
  const glideN = Math.max(1, Math.min(Math.trunc(Math.max(1.0, durMs) * 1e-3 * rate), nTotal));
  const t = linspace01(glideN);
  const extra = new Float64Array(nTotal);
  for (let i = 0; i < nTotal; i++) {
    const traj = i < glideN ? prevSemi + (targetSemi - prevSemi) * curveShape(spec.curve, t[i]!) : targetSemi;
    extra[i] = traj - prevSemi;
  }
  let gainEnv: Float64Array | undefined;
  if (spec.gainLift > 0) {
    gainEnv = new Float64Array(nTotal).fill(1.0);
    for (let i = 0; i < glideN; i++) gainEnv[i] = 1.0 + spec.gainLift * (0.5 * (1.0 - pcos(2 * Math.PI * i / glideN)));
  }
  return render808Note(prevSemi, durS, rate, { profile, seed, decayMs: decMs, extraSemi: extra, gainEnv, accent: spec.gainLift > 0 });
}

/** trap808.render_mono_sequence (no kick_plan): mono law + choke + slides, summed into one buffer. */
export function render808Sequence(events: readonly Event808[], profile: Partial<Profile808> = {}, rate = SOFTSYNTH_RATE, seed = 0): Float64Array {
  const p: Profile808 = { ...DEFAULT_PROFILE_808, ...profile };
  const norm = events.map((e) => ({ startS: e.startS, durS: e.durS, semi: e.semi, slide: !!e.slide }))
    .sort((a, b) => a.startS - b.startS);
  if (!norm.length) return new Float64Array(1);
  const guardS = Math.max(0.0, MONO_CUT_GUARD_MS) * 1e-3;
  const planned = norm.map((ev, i) => {
    let cutAtS: number | null = null;
    let slideTo: number | null = null;
    const nxt = norm[i + 1];
    if (nxt) {
      if (nxt.slide) slideTo = nxt.semi;
      else cutAtS = Math.max(ev.startS, nxt.startS - guardS);
    }
    return { ...ev, cutAtS, slideTo };
  });

  const rendered: { start: number; sig: Float64Array }[] = [];
  let total = 1;
  const consumed = new Set<number>();
  planned.forEach((ev, i) => {
    if (consumed.has(i)) return;
    const start = Math.trunc(ev.startS * rate);
    const noteSeed = (seed ^ crc32(ascii(`mono${i}`))) >>> 0;
    const nxt = planned[i + 1];
    // slide_allowed: destination flagged, source not cut, destination not a fresh hit (never set here)
    const allowed = nxt !== undefined && nxt.slide && ev.cutAtS === null;
    if (ev.slideTo !== null && nxt !== undefined && allowed) {
      const { type, durMs } = glideParams(ev, nxt);
      const totalDurS = Math.max(ev.durS, (nxt.startS - ev.startS) + nxt.durS);
      let sig = applySlide(ev.semi, nxt.semi, type, durMs, totalDurS, rate, p, noteSeed);
      if (nxt.cutAtS !== null) sig = chokeTail(sig, Math.max(0.0, nxt.cutAtS - ev.startS), rate);
      consumed.add(i + 1);
      rendered.push({ start, sig });
      total = Math.max(total, start + sig.length);
      return;
    }
    let sig = render808Note(ev.semi, ev.durS, rate, { profile: p, seed: noteSeed });
    if (ev.cutAtS !== null) sig = chokeTail(sig, Math.max(0.0, ev.cutAtS - ev.startS), rate);
    rendered.push({ start, sig });
    total = Math.max(total, start + sig.length);
  });
  const out = new Float64Array(total);
  for (const { start, sig } of rendered) for (let k = 0; k < sig.length; k++) out[start + k] = out[start + k]! + sig[k]!;
  return out;
}

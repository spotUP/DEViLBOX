/**
 * The demo's stroke, ported to the sample (scratch null test, owner 2026-10-12 "make them 1:1"):
 * Up Rough `tools/scratch.py render_gesture` with its gesture table, step lengths and velocity
 * response, and the `turntable.py` stages it calls - the two-body simulation (`turntableSim.ts`),
 * `render_from_motion` (Catmull-Rom reader, clamped to the safe range), `surface_noise`,
 * `fader_from_pattern` / `cut_pattern` / `fader_curve` and `deck_motion`.
 *
 * A stroke is rendered whole, as the demo renders it, at the demo's 22,050 Hz from the record as
 * the demo reads it (`scratchRecordPcm`); the Deck C channel worklet sums it into the scratch bus at
 * its start sample. Float64 throughout: the residual against the Python render is rounding only.
 */
import { simulate, linspace, interp, NumpyRandomState, TT_DECKS, type TtHandPoint, type TtDeck, type TtSlipmat, type TtRecord, type TtCartridge, type TtPerformer } from '@/engine/turntable/turntableSim';
import { lp, hp, tapeDelay, reverb } from './refDsp';
import { REFERENCE_GESTURE_IDS } from './scratchGestureCatalog';
import type { ScratchGestureId } from './scratchTypes';

/** The demo's render rate. */
export const DEMO_RATE = 22050;

/** scratch.py `A`: the base stroke displacement in record samples. */
const A = 1500.0;

type FaderSpec = string | ReadonlyArray<readonly [number, number]>;
export interface DemoGesture {
  hand?: ReadonlyArray<readonly [number, number, number]>;
  glide?: number;
  grip?: number;
  fader?: FaderSpec;
  cuts?: number;
  off?: number;
  curve?: 'smooth' | 'sharp' | 'battle';
  hamster?: boolean;
  fx?: { hp?: number; lp?: number; drive?: number; delay_mix?: number; delay_s?: number; reverb_mix?: number };
  deck?: 'brake' | 'start' | 'stop' | 'power_off';
  play?: boolean;
}

/** scratch.py `GESTURES`, verbatim. */
export const DEMO_GESTURES: Readonly<Record<string, DemoGesture>> = {
  baby: { hand: [[0, 0, 1], [0.25, A, 1], [0.5, 0, 1], [0.75, -A, 1], [1, 0, 1]], fader: 'open' },
  baby_slow: { hand: [[0, 0, 1], [0.25, 0.6 * A, 1], [0.5, 0, 1], [0.75, -0.6 * A, 1], [1, 0, 1]], fader: 'open' },
  forward_stab: { hand: [[0, 0, 1], [0.42, 1.3 * A, 1], [1, 0, 1]], fader: [[0.0, 0.42]] },
  backward_stab: { hand: [[0, 0, 1], [0.4, 1.2 * A, 1], [1, -0.2 * A, 1]], fader: [[0.45, 1.0]] },
  chirp: { hand: [[0, 0, 1], [0.5, 1.2 * A, 1], [1, -1.2 * A, 1]], fader: [[0.06, 0.44], [0.56, 0.94]], off: -2.0 },
  chirp_double: { hand: [[0, 0, 1], [0.25, A, 1], [0.5, -A, 1], [0.75, A, 1], [1, -A, 1]], fader: [[0.03, 0.22], [0.28, 0.47], [0.53, 0.72], [0.78, 0.97]], off: -2.0 },
  transformer4: { glide: 1.0, grip: 0.7, fader: 'transform', cuts: 4 },
  transformer8: { glide: 1.0, grip: 0.7, fader: 'transform', cuts: 8 },
  tear_fwd: { hand: [[0, 0, 1], [0.34, 0.9 * A, 1], [0.5, 1.0 * A, 1], [0.67, 1.7 * A, 1], [1, 2.0 * A, 1]], fader: 'open' },
  tear_rev: { hand: [[0, 0, 1], [0.34, -0.5 * A, 1], [0.5, -0.6 * A, 1], [0.67, -1.4 * A, 1], [1, -2.0 * A, 1]], fader: 'open' },
  flare1: { hand: [[0, 0, 1], [1, 1.6 * A, 1]], fader: 'flare1' },
  flare2: { hand: [[0, 0, 1], [1, 1.8 * A, 1]], fader: 'flare2' },
  orbit: { hand: [[0, 0, 1], [0.5, 1.4 * A, 1], [1, -1.4 * A, 1]], fader: [[0.0, 0.22], [0.28, 0.47], [0.53, 0.72], [0.78, 1.0]] },
  scribble: { hand: [[0, 0, 1], [0.2, 0.4 * A, 1], [0.4, -0.4 * A, 1], [0.6, 0.4 * A, 1], [0.8, -0.4 * A, 1], [1, 0, 1]], fader: 'open' },
  drag: { hand: [[0, 0, 1], [1, 0.7 * A, 1]], fader: 'open' },
  cut: { hand: [[0, 0, 1], [0.5, 1.5 * A, 1], [1, 0, 1]], fader: [[0.0, 0.42]] },
  crab: { glide: 1.0, grip: 0.7, fader: 'crab' },
  hydroplane: { glide: 0.7, grip: 0.6, fader: 'transform', cuts: 12 },
  echo: { hand: [[0, 0, 1], [0.42, 1.3 * A, 1], [1, 0, 1]], fader: [[0.0, 0.4]], fx: { delay_mix: 0.35, delay_s: 0.16, reverb_mix: 0.05 } },
  brake: { deck: 'brake' },
  spinup: { deck: 'start' },
  drop: { play: true },
  drop_phrase: { play: true },
};

/** scratch.py `_GESTURE_STEPS`: a gesture's length in 16th steps (unknown: 2). */
export const DEMO_GESTURE_STEPS: Readonly<Record<string, number>> = {
  baby: 2, baby_slow: 3, forward_stab: 1, backward_stab: 1, chirp: 2, chirp_double: 2, transformer4: 2, transformer8: 4,
  tear_fwd: 2, tear_rev: 2, flare1: 2, flare2: 2, orbit: 3, scribble: 2, drag: 4, cut: 1, crab: 2, hydroplane: 3, echo: 2,
  brake: 4, spinup: 4, drop: 4, drop_phrase: 16,
};
export const demoGestureSteps = (name: string) => DEMO_GESTURE_STEPS[name] ?? 2;

const DEMO_NAME: Partial<Record<ScratchGestureId, string>> = Object.fromEntries(Object.entries(REFERENCE_GESTURE_IDS).map(([demo, id]) => [id, demo]));
/** The demo's name for a catalogue gesture (`tearForward` -> `tear_fwd`); undefined when the demo has none. */
export const demoGestureName = (id: ScratchGestureId): string | undefined => DEMO_NAME[id];

/** scratch.py `VEL`: the velocity response. */
export const DEMO_VEL = { amp_base: 0.55, amp_span: 0.70, gain_base: 0.70, gain_span: 0.50, lp_thresh: 0.50, lp_base: 2500.0, lp_span: 6000.0, hp_thresh: 0.85, hp_freq: 3000.0, hp_mix: 0.15 } as const;

export interface DemoDeckProfile { deck: TtDeck; slipmat: TtSlipmat; record: TtRecord; performer: TtPerformer; cartridge: TtCartridge }
/** scratch.py `PROFILES[...]['deck']` (render_gesture's default is the battle setup). */
export const DEMO_DECK_PROFILES = {
  default: { deck: 'classic_sl1200', slipmat: 'thin_battle', record: 'light_battle', performer: 'tight_battle', cartridge: 'battle' },
  old_school: { deck: 'worn_club_deck', slipmat: 'felt_standard', record: 'light_battle', performer: 'loose_old_school', cartridge: 'battle' },
  boombap: { deck: 'classic_sl1200', slipmat: 'thin_battle', record: 'light_battle', performer: 'tight_battle', cartridge: 'battle' },
  west_coast: { deck: 'classic_sl1200', slipmat: 'felt_standard', record: 'light_battle', performer: 'light_touch', cartridge: 'battle' },
  electro: { deck: 'tight_direct_drive', slipmat: 'thin_battle', record: 'light_battle', performer: 'electro_grid', cartridge: 'battle' },
} as const satisfies Record<string, DemoDeckProfile>;

/** A record as the demo's cue source: the signal, the anchor (sample) and the safe range (samples). */
export interface DemoSource { sig: Float64Array; anchor: number; safe: readonly [number, number] }

// ── turntable.py stages ───────────────────────────────────────────────────

/** turntable.py `render_from_motion` (offline tier: Catmull-Rom; no loop): read the record at the record position. */
export function renderFromMotion(src: Float64Array, anchor: number, safe: readonly [number, number], recordVel: ArrayLike<number>): Float64Array {
  const n = recordVel.length;
  const out = new Float64Array(n);
  const smin = safe[0];
  const smax = Math.min(safe[1], src.length - 3);
  let pos = Math.min(Math.max(anchor, smin), smax);
  for (let i = 0; i < n; i++) {
    const i0 = Math.trunc(pos);
    const fr = pos - i0;
    if (1 <= i0 && i0 < src.length - 2) {
      const a = src[i0 - 1]!, b = src[i0]!, c = src[i0 + 1]!, d = src[i0 + 2]!;
      out[i] = b + 0.5 * fr * (c - a + fr * (2 * a - 5 * b + 4 * c - d + fr * (3 * (b - c) + d - a)));
    } else {
      out[i] = src[i0]! * (1.0 - fr) + src[i0 + 1]! * fr;
    }
    pos += recordVel[i]! * 1.0;
    if (pos < smin) pos = smin;
    else if (pos > smax) pos = smax;
  }
  return out;
}

/** turntable.py `surface_noise`: a static noise bed read at the record angle. */
export function surfaceNoise(recordAngle: ArrayLike<number>, level: number, rate: number, seed = 0): Float64Array {
  const n = recordAngle.length;
  if (level <= 0) return new Float64Array(n);
  let m = 0;
  for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(recordAngle[i]!));
  const bedLen = Math.trunc(Math.max(m + rate, rate));
  const rng = new NumpyRandomState((seed + 99) >>> 0);
  const bed = new Float64Array(bedLen);
  for (let i = 0; i < bedLen; i++) bed[i] = rng.uniform(-1, 1);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const idx = Math.min(Math.max(Math.trunc(Math.abs(recordAngle[i]!)), 0), bedLen - 1);
    out[i] = level * bed[idx]!;
  }
  return out;
}

const FADER_CURVES = { smooth: 2.0, sharp: 6.0, battle: 12.0 } as const;

/** turntable.py `cut_pattern`: named open windows over the gesture. */
export function cutPattern(name: string, cuts = 4): Array<[number, number]> {
  switch (name) {
    case 'open': return [[0.0, 1.0]];
    case 'click': return [[0.0, 0.42], [0.5, 1.0]];
    case 'double_click': return [[0.0, 0.22], [0.28, 0.5], [0.56, 0.78], [0.84, 1.0]];
    case 'triple_click': return [0, 1, 2].map((i) => [i / 3 + 0.02, i / 3 + 0.28]);
    case 'transform': return Array.from({ length: cuts }, (_, i) => [i / cuts, i / cuts + 0.5 / cuts]);
    case 'flare1': return [[0.0, 0.45], [0.55, 1.0]];
    case 'flare2': return [[0.0, 0.3], [0.37, 0.63], [0.7, 1.0]];
    case 'crab': {
      const e = [0.0, 0.12, 0.19, 0.34, 0.4, 0.58, 0.63, 0.8, 0.85, 1.0];
      const w: Array<[number, number]> = [];
      for (let i = 0; i < e.length - 1; i += 2) w.push([e[i]!, e[i + 1]!]);
      return w;
    }
    default: return [[0.0, 1.0]];
  }
}

/** turntable.py `fader_from_pattern` (no contact bounce, no lag, right deck) through `fader_curve`. */
export function faderFromPattern(pattern: ReadonlyArray<readonly [number, number]>, n: number, rate: number, opts: { curve?: keyof typeof FADER_CURVES; hamster?: boolean; rampMs?: number; offsetMs?: number } = {}): Float64Array {
  const g = new Float64Array(n);
  const off = Math.trunc((opts.offsetMs ?? 0) * 1e-3 * rate);
  const r = Math.max(1, Math.trunc((opts.rampMs ?? 1.0) * 1e-3 * rate));
  let windows: ReadonlyArray<readonly [number, number]> = pattern;
  if (opts.hamster) {
    const comp: Array<[number, number]> = [];
    let cur = 0.0;
    for (const [a, b] of [...pattern].sort((p, q) => p[0] - q[0] || p[1] - q[1])) {
      if (a > cur) comp.push([cur, a]);
      cur = Math.max(cur, b);
    }
    if (cur < 1.0) comp.push([cur, 1.0]);
    windows = comp;
  }
  const clip01 = (v: number) => Math.min(Math.max(v, 0), 1);
  for (const [a, b] of windows) {
    let s = Math.trunc(clip01(a) * n) + off;
    let e = Math.trunc(clip01(b) * n) + off;
    s = Math.max(0, Math.min(n, s)); e = Math.max(0, Math.min(n, e));
    if (e <= s) continue;
    for (let i = s; i < e; i++) g[i] = 1.0;
    const rr = Math.min(r, Math.floor((e - s) / 2)) || 1;
    const up = linspace(0, 1, rr), down = linspace(1, 0, rr);
    for (let i = 0; i < rr; i++) g[s + i] = up[i]!;
    for (let i = 0; i < rr; i++) g[e - rr + i] = down[i]!;
  }
  // fader_curve(g, curve, cut_in = 0): 1 - (1 - clip(p, 0, 1)) ** exp
  const exp = FADER_CURVES[opts.curve ?? 'battle'];
  for (let i = 0; i < n; i++) g[i] = 1.0 - (1.0 - clip01(g[i]! / Math.max(1e-6, 1.0))) ** exp;
  return g;
}

/** turntable.py `deck_motion`: a platter-only speed curve (start / stop / brake / power off). */
export function deckMotion(action: string, durSec: number, rate: number, deck: TtDeck = 'classic_sl1200', brake = 'classic_stop', startSpeed = 1.0): Float64Array {
  const n = Math.max(1, Math.trunc(durSec * rate));
  const t = linspace(0, 1, n);
  const strength = ({ fast_stop: 6.0, classic_stop: 3.0, loose_stop: 1.5, power_down_coast: 0.8 } as Record<string, number>)[brake] ?? 3.0;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (action === 'start') out[i] = startSpeed * (1 - Math.exp(-t[i]! * 5.0 * TT_DECKS[deck].kp / 9.0));
    else if (action === 'stop' || action === 'brake') out[i] = startSpeed * Math.exp(-t[i]! * strength);
    else if (action === 'power_off') out[i] = startSpeed * Math.exp(-t[i]! * (TT_DECKS[deck].bearing * 20 + 0.5));
    else out[i] = startSpeed;
  }
  return out;
}

/** scratch.py `apply_fx` (a gesture's own effect: the echo scratch). */
function applyFx(x: Float64Array, rate: number, fx: NonNullable<DemoGesture['fx']>): Float64Array {
  let y = x;
  if (fx.hp) y = hp(y, fx.hp, rate);
  if (fx.lp) y = lp(y, fx.lp, rate);
  if (fx.drive) { const k = 1.0 + fx.drive * 4.0; y = y.map((v) => Math.tanh(k * v)); }
  if (fx.delay_mix) y = tapeDelay(y, rate, fx.delay_s ?? 0.18, 0.25, fx.delay_mix, 0.4);
  if (fx.reverb_mix) y = reverb(y, rate, 'room', fx.reverb_mix, 0.5);
  return y;
}

/** Reachability sentinel: strokes rendered by the demo's renderer. */
export const scratchRenderStats = { gestures: 0 };

/** One stroke's stages (the null test's taps). */
export interface RenderedGesture { out: Float64Array; recordVel?: Float64Array; fade?: Float64Array }

/**
 * scratch.py `render_gesture` (offline tier, the `VEL` defaults): one gesture through the turntable
 * physics and the crossfader, `durSec` long, at `rate`.
 */
export function renderGesture(source: DemoSource, name: string, durSec: number, rate: number, opts: { velocity?: number; profile?: DemoDeckProfile; seed?: number } = {}): RenderedGesture {
  scratchRenderStats.gestures++;
  const velocity = opts.velocity ?? 1.0;
  const vc = DEMO_VEL;
  const g = DEMO_GESTURES[name] ?? DEMO_GESTURES.baby!;
  const prof = opts.profile ?? DEMO_DECK_PROFILES.default;
  const seed = opts.seed ?? 0;
  const n = Math.max(8, Math.trunc(durSec * rate));
  if (g.deck) {
    const vel = deckMotion(g.deck, durSec, rate, prof.deck);
    const out = renderFromMotion(source.sig, source.anchor, source.safe, vel);
    const k = 0.7 + 0.4 * velocity;
    for (let i = 0; i < out.length; i++) out[i] = out[i]! * k;
    return { out, recordVel: vel };
  }
  const amp = vc.amp_base + vc.amp_span * velocity;
  if (g.play) {
    // the clean throw: forward at natural speed from the anchor, fader open, at least 0.5 s of the word
    const src = source.sig;
    const anchor = Math.trunc(source.anchor);
    const avail = Math.max(1, src.length - anchor);
    const npl = Math.min(avail, Math.max(n, Math.trunc(0.5 * rate)));
    const vel = new Float64Array(npl).fill(1);
    const out = renderFromMotion(src, anchor, source.safe, vel);
    const fade = new Float64Array(out.length).fill(1);
    const k = Math.max(1, Math.trunc(0.01 * rate));
    const up = linspace(0, 1, k), down = linspace(1, 0, k);
    for (let i = 0; i < k && i < fade.length; i++) fade[i] = up[i]!;
    for (let i = 0; i < k && fade.length - k + i >= 0; i++) fade[fade.length - k + i] = down[i]!;
    const gain = 0.8 + 0.4 * velocity;
    for (let i = 0; i < out.length; i++) out[i] = out[i]! * fade[i]! * gain;
    return { out, recordVel: vel, fade };
  }
  let hand: TtHandPoint[];
  if (g.glide) {
    const dist = g.glide * durSec * rate;
    const grip = g.grip ?? 0.7;
    hand = [[0.0, 0.0, grip], [0.5, 0.32 * dist, grip], [1.0, 1.35 * dist, grip]];
  } else {
    hand = g.hand!.map(([t, ang, grip]) => [t, ang * amp, grip] as const);
  }
  const sim = simulate(hand, durSec, rate, { deck: prof.deck, slipmat: prof.slipmat, record: prof.record, performer: prof.performer, cartridge: prof.cartridge, tier: 'offline', seed, warp: 0.4, eccentricity: 0.3 });
  // the control-rate tracks at audio rate (np.interp over linspace(0, 1, n))
  const nAud = Math.max(1, Math.trunc(durSec * rate));
  const ta = linspace(0, 1, nAud);
  const recordVel = new Float64Array(nAud), recordAngle = new Float64Array(nAud);
  for (let i = 0; i < nAud; i++) { recordVel[i] = interp(ta[i]!, sim.t, sim.recordVel); recordAngle[i] = interp(ta[i]!, sim.t, sim.recordAngle); }
  const plat = renderFromMotion(source.sig, source.anchor, source.safe, recordVel);
  const noise = surfaceNoise(recordAngle, sim.surface * velocity, rate, seed);
  for (let i = 0; i < plat.length; i++) plat[i] = plat[i]! + noise[i]!;
  const fw = typeof g.fader === 'string' || g.fader === undefined ? cutPattern(g.fader ?? 'open', g.cuts ?? 4) : g.fader;
  const sharp = 1.0 + 2.0 * (1.0 - velocity);
  const fade = faderFromPattern(fw, plat.length, rate, { curve: g.curve ?? 'battle', hamster: g.hamster ?? false, rampMs: sharp, offsetMs: g.off ?? 0.0 });
  const gain = vc.gain_base + vc.gain_span * velocity;
  let out: Float64Array = new Float64Array(plat.length);
  for (let i = 0; i < out.length; i++) out[i] = plat[i]! * fade[i]! * gain;
  if (velocity < vc.lp_thresh) out = lp(out, vc.lp_base + vc.lp_span * velocity, rate);
  if (velocity > vc.hp_thresh) {
    const h = hp(out, vc.hp_freq, rate);
    for (let i = 0; i < out.length; i++) out[i] = out[i]! + vc.hp_mix * h[i]!;
  }
  if (g.fx) out = applyFx(out, rate, g.fx);
  return { out, recordVel, fade };
}

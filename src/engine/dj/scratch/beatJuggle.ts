/**
 * The Up Rough demo's beat-juggle engine (beat_juggle.py) and the three-deck routine's own A/B layer
 * (three_deck.py `_perf_events`, `build_juggle_events`, `build_juggle_bus`), ported line for line (ledger PG-I:
 * J1-J10). Two copies of one break - or two records - on decks A and B, one audible while the other rewinds:
 *
 *   J1  the pattern grammar (8 patterns, JUGGLE_ROLES, MG_VEL, SR_VEL)
 *   J2  the reset planner (rewind_time, plan_resets, MAX_REWIND_SPEED)
 *   J3  the breaks (BREAK_VARIANTS, make_break on the demo's drum voices) and the records (the amen, the hip-hop
 *       records - shipped as the demo rendered them, owner decision 2026-10-12)
 *   J4  the juggle macro language
 *   J5  classify_break
 *   J6  break loading and fitting (_decode_wav, _detect_cues, load_break, _fit_one_bar, fit_break, _grid_cues)
 *   J7  the hit renderer and the tight tiling (RENDER_TUNE, the a500 linear looped read, the device's LFSR timing)
 *   J8  the named routines
 *   J9  validate / repair, three_deck validate_budget / validate
 *   J10 the three-deck A/B layer (JUGGLE_PATTERN_BY_LEVEL, JUGGLE_ROTATION, play + fade every 2-bar phrase,
 *       SECTION_BREAK, SECTION_DECK_PAIR)
 *
 * Pure: float64, the reference's order of operations; audio at 22,050 Hz.
 */

import { linspace } from '@/engine/turntable/turntableSim';
import { lp, bp } from './refDsp';
import { boxSame, pyRound } from './scratchBankAnalysis';
import { demoResample } from './scratchGrit';
import { kick808, snare808, hat909, tapeSat } from './demoDrums';
import { THREE_DECK_ARC, THREE_DECK_BUDGET, THREE_DECK_JUGGLE_JL_MIN, scratchPermissionFor, sectionJuggles } from './scratchDemoRoutines';

export const JUGGLE_RATE = 22050;

/** Reachability sentinels. */
export const beatJuggleStats = { breaks: 0, juggles: 0, buses: 0 };

// ── sources (J3, J6) ────────────────────────────────────────────────────

export type JuggleCueName = 'BAR_START' | 'KICK_1' | 'SNARE_1' | 'KICK_2' | 'SNARE_2' | 'HALF_BAR' | 'GHOST' | 'FILL' | 'PHRASE_END' | 'LOOP_END';
export type JuggleCues = Record<JuggleCueName, number>;

/** A juggle record: one bar of audio with its cue points (the demo's BeatJuggleSource dict). */
export interface JuggleSource { sig: Float64Array; rate: number; bpm: number; bars: number; step: number; cues: JuggleCues; variant: string }

interface KitVoice { tune: number; amp_decay?: number; click?: number; noise_amt?: number; body_decay?: number; drive?: number }
export interface BreakVariant { kicks: readonly number[]; snares: readonly number[]; hats: readonly number[]; kick: KitVoice; snare: KitVoice; swing: number }

/** `BREAK_VARIANTS`: five grooves with their own kit voicing. */
export const BREAK_VARIANTS: Readonly<Record<'boombap' | 'funk' | 'halftime' | 'uptempo' | 'amen', BreakVariant>> = {
  boombap: { kicks: [0, 10], snares: [4, 12], hats: [2, 6, 8, 14], kick: { tune: 6, amp_decay: 420, click: 0.14 }, snare: { tune: 27, noise_amt: 0.7, body_decay: 130, drive: 0.16 }, swing: 0.0 },
  funk: { kicks: [0, 3, 7, 10], snares: [4, 12], hats: [2, 6, 10, 14], kick: { tune: 8, amp_decay: 300, click: 0.2 }, snare: { tune: 30, noise_amt: 0.6, body_decay: 110, drive: 0.2 }, swing: 0.12 },
  halftime: { kicks: [0], snares: [8], hats: [4, 12], kick: { tune: 3, amp_decay: 540, click: 0.1 }, snare: { tune: 22, noise_amt: 0.75, body_decay: 180, drive: 0.24 }, swing: 0.0 },
  uptempo: { kicks: [0, 6, 8, 14], snares: [4, 12], hats: [1, 3, 5, 7, 9, 11, 13, 15], kick: { tune: 9, amp_decay: 220, click: 0.28 }, snare: { tune: 33, noise_amt: 0.55, body_decay: 90, drive: 0.14 }, swing: 0.0 },
  amen: { kicks: [0, 10], snares: [4, 7, 12], hats: [2, 6, 14], kick: { tune: 7, amp_decay: 380, click: 0.16 }, snare: { tune: 28, noise_amt: 0.85, body_decay: 120, drive: 0.22 }, swing: 0.06 },
};
export type BreakVariantName = keyof typeof BREAK_VARIANTS;

export const juggleStep = (bpm: number, rate = JUGGLE_RATE): number => Math.trunc(rate * 60.0 / (bpm * 4));

const maxAbs = (x: ArrayLike<number>): number => { let m = 0; for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]!)); return m; };
const normalized = (x: Float64Array): Float64Array => { const m = maxAbs(x) + 1e-9; const o = new Float64Array(x.length); for (let i = 0; i < x.length; i++) o[i] = x[i]! / m; return o; };

/** `make_break(style, bpm, rate, seed, variant)`: a synthesized one-bar break with known cue points. */
export function makeBreak(opts: { style?: string; bpm?: number; rate?: number; variant?: string } = {}): JuggleSource {
  beatJuggleStats.breaks++;
  const bpm = opts.bpm ?? 92, rate = opts.rate ?? JUGGLE_RATE, style = opts.style ?? 'boombap';
  const step = juggleStep(bpm, rate);
  const bar = step * 16;
  const buf = new Float64Array(bar + Math.trunc(0.5 * rate));
  const key = opts.variant ?? (style !== 'electro' ? 'boombap' : 'uptempo');
  const v = BREAK_VARIANTS[key as BreakVariantName] ?? BREAK_VARIANTS.boombap;
  const kick = kick808({ tune: v.kick.tune, amp_decay: v.kick.amp_decay, click: v.kick.click }, rate);
  const snare = tapeSat(snare808({ tune: v.snare.tune, noise_amt: v.snare.noise_amt, body_decay: v.snare.body_decay, drive: v.snare.drive }, rate), 1.3);
  const ch = lp(hat909(rate), 11000, rate);
  const put = (sig: Float64Array, st: number, g = 1.0, sw = 0.0): void => {
    const o = Math.trunc((st + (st % 2 ? sw : 0.0)) * step);
    const e = Math.min(buf.length, o + sig.length);
    for (let i = o; i < e; i++) buf[i] = buf[i]! + g * sig[i - o]!;
  };
  for (const s of v.kicks) put(kick, s);
  v.snares.forEach((s, i) => put(snare, s, 0 < i && i < v.snares.length - 1 ? 0.7 : 0.9));
  for (const s of v.hats) put(ch, s, 0.3, v.swing);
  const cut = buf.subarray(0, bar);
  const cues: JuggleCues = {
    BAR_START: 0, KICK_1: v.kicks[0]! * step, SNARE_1: v.snares[0]! * step,
    KICK_2: (v.kicks.length > 1 ? v.kicks[1]! : v.kicks[0]!) * step,
    SNARE_2: (v.snares.length > 1 ? v.snares[v.snares.length - 1]! : v.snares[0]!) * step,
    HALF_BAR: 8 * step, GHOST: 6 * step, FILL: 14 * step, PHRASE_END: 15 * step, LOOP_END: bar,
  };
  return { sig: normalized(Float64Array.from(cut)), rate, bpm, bars: 1, step, cues, variant: opts.variant ?? 'boombap' };
}

/** `_decode_wav(path, rate)`: a WAV to mono float at `rate` (16 / 24 / 8 bit, channels averaged, resample_rate), peak 1. */
export function decodeWav(bytes: ArrayBuffer, rate = JUGGLE_RATE): Float64Array {
  const v = new DataView(bytes);
  let off = 12, fmt: { ch: number; sr: number; bits: number } | null = null, data: [number, number] | null = null;
  while (off + 8 <= v.byteLength) {
    const id = String.fromCharCode(v.getUint8(off), v.getUint8(off + 1), v.getUint8(off + 2), v.getUint8(off + 3));
    const size = v.getUint32(off + 4, true);
    if (id === 'fmt ') fmt = { ch: v.getUint16(off + 10, true), sr: v.getUint32(off + 12, true), bits: v.getUint16(off + 22, true) };
    else if (id === 'data') data = [off + 8, Math.min(size, v.byteLength - off - 8)];
    off += 8 + size + (size & 1);
  }
  if (!fmt || !data) throw new Error('decodeWav: not a PCM WAV');
  const sw = fmt.bits / 8, frames = Math.floor(data[1] / (sw * fmt.ch));
  const mono = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let c = 0; c < fmt.ch; c++) {
      const p = data[0] + (f * fmt.ch + c) * sw;
      let x: number;
      if (sw === 2) x = v.getInt16(p, true) / 32768.0;
      else if (sw === 3) { const u = v.getUint8(p) | (v.getUint8(p + 1) << 8) | (v.getUint8(p + 2) << 16); x = (u >= 0x800000 ? u - 0x1000000 : u) / 8388608.0; }
      else x = (v.getUint8(p) - 128) / 128.0;
      sum += x;
    }
    mono[f] = fmt.ch > 1 ? sum / fmt.ch : sum;
  }
  const d = fmt.sr !== rate ? Float64Array.from(demoResample(mono, fmt.sr, rate)) : mono;
  return normalized(d);
}

/** `_detect_cues(d, step, bar)`: kick / snare transients, low vs mid (the demo reads at its module RATE). */
export function detectCues(d: Float64Array, step: number, bar: number): JuggleCues {
  const R = JUGGLE_RATE;
  const lo = lp(d, 150, R), mid = bp(d, 1500, 6000, R);
  const w2 = Math.max(1, Math.trunc(0.005 * R));
  const absOf = (x: Float64Array) => { const o = new Float64Array(x.length); for (let i = 0; i < x.length; i++) o[i] = Math.abs(x[i]!); return o; };
  const envL = boxSame(absOf(lo), w2), envM = boxSame(absOf(mid), w2);
  const thrL = maxAbs(envL) * 0.35, thrM = maxAbs(envM) * 0.35;
  const kicks: number[] = [], snares: number[] = [];
  let last = -1;
  const gap = Math.trunc(0.05 * R);
  for (let i = 0; i < Math.min(d.length, bar * 2); i++) {
    if ((envL[i]! > thrL || envM[i]! > thrM) && (last < 0 || i - last > gap)) {
      (envL[i]! >= envM[i]! ? kicks : snares).push(i);
      last = i;
    }
  }
  return {
    BAR_START: 0, KICK_1: kicks.length ? kicks[0]! : 0,
    SNARE_1: snares.length ? snares[0]! : step * 4,
    KICK_2: kicks.length > 1 ? kicks[1]! : step * 10,
    SNARE_2: snares.length > 1 ? snares[1]! : step * 12,
    HALF_BAR: step * 8, GHOST: step * 6, FILL: step * 14, PHRASE_END: step * 15, LOOP_END: Math.min(bar, d.length),
  };
}

/** `load_break(path, bpm, rate)`: a real break with auto-detected cues on a `bpm` grid. */
export function loadBreak(bytes: ArrayBuffer, bpm: number, rate = JUGGLE_RATE): JuggleSource {
  const d = decodeWav(bytes, rate);
  const step = juggleStep(bpm, rate), bar = step * 16;
  return { sig: d, rate, bpm, bars: Math.max(1, Math.floor(d.length / bar)), step, cues: detectCues(d, step, bar), variant: 'loaded' };
}

/** `_fit_one_bar(audio, src_bpm, dst_bpm, rate, use_bar)`: one source bar linearly resampled to one destination bar, peak 1. */
export function fitOneBar(audio: Float64Array, srcBpm: number, dstBpm: number, rate = JUGGLE_RATE, useBar = 0): { fit: Float64Array; step: number; bar: number } {
  const srcBar = juggleStep(srcBpm, rate) * 16;
  let seg = audio.subarray(useBar * srcBar, Math.min(audio.length, (useBar + 1) * srcBar));
  if (seg.length < srcBar) seg = audio.subarray(0, Math.min(audio.length, srcBar));
  const dstStep = juggleStep(dstBpm, rate), dstBar = dstStep * 16;
  const idx = linspace(0, seg.length - 1, dstBar);
  const fit = new Float64Array(dstBar);
  for (let i = 0; i < dstBar; i++) {
    const lo = Math.trunc(idx[i]!), frac = idx[i]! - lo, hi = Math.min(lo + 1, seg.length - 1);
    fit[i] = seg[lo]! * (1 - frac) + seg[hi]! * frac;
  }
  return { fit: normalized(fit), step: dstStep, bar: dstBar };
}

/** `fit_break(path, src_bpm, dst_bpm, rate, use_bar)`: a real break's bar fitted to the routine's tempo. */
export function fitBreak(bytes: ArrayBuffer, srcBpm: number, dstBpm: number, rate = JUGGLE_RATE, useBar = 0): JuggleSource {
  const { fit, step, bar } = fitOneBar(decodeWav(bytes, rate), srcBpm, dstBpm, rate, useBar);
  return { sig: fit, rate, bpm: dstBpm, bars: 1, step, cues: detectCues(fit, step, bar), variant: 'amen_real' };
}

/** `_grid_cues(step, bar)`: on-grid cues for a quantized record. */
export const gridCues = (step: number, bar: number): JuggleCues => ({
  BAR_START: 0, KICK_1: 0, SNARE_1: 4 * step, KICK_2: 8 * step, SNARE_2: 12 * step, HALF_BAR: 8 * step,
  GHOST: 6 * step, FILL: 14 * step, PHRASE_END: 15 * step, LOOP_END: bar,
});

/**
 * `make_hiphop_record(style, key, bpm, seed, use_bar=1)` from the record as the demo rendered it (hiphop.render_track,
 * clean, at its own tempo; shipped - owner J3): its bar fitted to the routine's tempo, grid cues.
 */
export function hiphopRecord(audio: Float64Array, style: string, srcBpm: number, dstBpm: number, rate = JUGGLE_RATE, useBar = 1): JuggleSource {
  const { fit, step, bar } = fitOneBar(audio, srcBpm, dstBpm, rate, useBar);
  return { sig: fit, rate, bpm: dstBpm, bars: 1, step, cues: gridCues(step, bar), variant: `hh_${style}` };
}

/** A shipped juggle record's bar: a 32-bit float mono WAV (format 3) as the demo rendered it. */
export function readFloatWav(bytes: ArrayBuffer): { rate: number; pcm: Float64Array } {
  const v = new DataView(bytes);
  let off = 12, rate = 0, fmtCode = 0, bits = 0, ch = 1, data: [number, number] | null = null;
  while (off + 8 <= v.byteLength) {
    const id = String.fromCharCode(v.getUint8(off), v.getUint8(off + 1), v.getUint8(off + 2), v.getUint8(off + 3));
    const size = v.getUint32(off + 4, true);
    if (id === 'fmt ') { fmtCode = v.getUint16(off + 8, true); ch = v.getUint16(off + 10, true); rate = v.getUint32(off + 12, true); bits = v.getUint16(off + 22, true); }
    else if (id === 'data') data = [off + 8, Math.min(size, v.byteLength - off - 8)];
    off += 8 + size + (size & 1);
  }
  if (fmtCode !== 3 || bits !== 32 || ch !== 1 || !data) throw new Error('readFloatWav: not a mono 32-bit float WAV');
  const n = Math.floor(data[1] / 4), pcm = new Float64Array(n);
  for (let i = 0; i < n; i++) pcm[i] = v.getFloat32(data[0] + 4 * i, true);
  return { rate, pcm };
}

/** `classify_break(src)`: transient clarity + cue count -> JUGGLE_READY (> 0.6) / JUGGLE_LIMITED (> 0.35) / NOT_RECOMMENDED. */
export function classifyBreak(src: Pick<JuggleSource, 'sig' | 'rate' | 'cues'>): [string, number] {
  const lo = lp(src.sig, 150, src.rate);
  let mx = 0, sum = 0;
  for (let i = 0; i < lo.length; i++) { const a = Math.abs(lo[i]!); mx = Math.max(mx, a); sum += a; }
  const crest = mx / (sum / lo.length + 1e-9);
  const clarity = Math.min(1.0, crest / 8.0);
  const ncues = (['KICK_1', 'SNARE_1', 'KICK_2', 'SNARE_2'] as const).filter((k) => !!src.cues[k]).length;
  const score = 0.6 * clarity + 0.4 * (ncues / 4.0);
  const label = score > 0.6 ? 'JUGGLE_READY' : score > 0.35 ? 'JUGGLE_LIMITED' : 'NOT_RECOMMENDED';
  return [label, pyRound(score, 2)];
}

// ── decks and the hit (J2, J7) ──────────────────────────────────────────

export type JuggleDeck = 'A' | 'B';
export const DECK_A: JuggleDeck = 'A';
export const DECK_B: JuggleDeck = 'B';
/** `MAX_REWIND_SPEED`: a fast backward pull, x. */
export const MAX_REWIND_SPEED = 3.0;

/** `RENDER_TUNE`: the catch, the click-safe edges, the micro-timing and the gain. */
export const RENDER_TUNE = { catch_s: 0.003, catch_vel0: 0.8, attack_s: 0.002, release_s: 0.003, micro_timing_s: 0.001, gain: 0.95 } as const;
export type RenderTune = { [K in keyof typeof RENDER_TUNE]: number };

/** Python's float `%` (the result takes the divisor's sign). */
const pyMod = (a: number, b: number): number => { const m = a % b; return m !== 0 && (m < 0) !== (b < 0) ? m + b : m; };

/**
 * turntable.py `render_from_motion(..., tier='a500', loop=L)`: the record read linearly at the record position, the
 * position wrapping round a loop of L samples from the safe start (a record comes round again).
 */
export function renderFromMotionLoop(src: Float64Array, anchor: number, safeLo: number, recordVel: ArrayLike<number>, loop: number): Float64Array {
  const n = recordVel.length;
  const out = new Float64Array(n);
  const smin = Math.trunc(safeLo);
  const L = Math.max(1, Math.min(Math.trunc(loop), src.length - smin));
  let pos = smin + pyMod(anchor - smin, L);
  for (let i = 0; i < n; i++) {
    const i0 = Math.trunc(pos);
    const fr = pos - i0;
    const j = i0 - smin;
    const b = src[smin + j]!, c = src[smin + ((j + 1) % L)]!;
    out[i] = b * (1.0 - fr) + c * fr;
    pos = smin + pyMod(pos + recordVel[i]! * 1.0 - smin, L);
  }
  return out;
}

const cueOf = (src: Pick<JuggleSource, 'cues'>, cue: string | number): number => (typeof cue === 'string' ? (src.cues as Record<string, number>)[cue] ?? 0 : Math.trunc(cue));

/** `render_hit(src, cue, dur_s, rate, tune, loop)`: the break forward from a cue - the slipmat catch, then 1.0x, the attack. */
export function renderHit(src: JuggleSource, cue: string | number, durSec: number, rate: number, tune: RenderTune = RENDER_TUNE, loop?: number): Float64Array {
  const n = Math.max(1, Math.trunc(durSec * rate));
  const c = cueOf(src, cue);
  const katch = Math.min(n, Math.trunc(tune.catch_s * rate));
  const vel = new Float64Array(n).fill(1);
  const ramp = linspace(tune.catch_vel0, 1.0, katch);
  for (let i = 0; i < katch; i++) vel[i] = ramp[i]!;
  const hit = renderFromMotionLoop(src.sig, c, 0, vel, loop || src.sig.length);
  const a = Math.min(n, Math.trunc(tune.attack_s * rate));
  if (a > 1) { const up = linspace(0, 1, a); for (let i = 0; i < a; i++) hit[i] = hit[i]! * up[i]!; }
  return hit;
}

/** `rewind_time(src, from, to, rate)`: distance / the max rewind speed + 20 ms of grip. */
export function rewindTime(src: Pick<JuggleSource, 'cues'>, from: string | number, to: string | number, rate: number): number {
  return Math.abs(cueOf(src, from) - cueOf(src, to)) / (MAX_REWIND_SPEED * rate) + 0.02;
}

// ── the pattern grammar (J1) ────────────────────────────────────────────

export type JuggleRole = 'REPEAT' | 'EXTEND' | 'STUTTER' | 'REORDER' | 'ACCENT' | 'FILL' | 'BREAKDOWN' | 'RETURN';
/** One juggle event: (bar, step, deck, cue, audible steps, role, velocity). */
export type JuggleEvent = readonly [bar: number, step: number, deck: JuggleDeck, cue: string, audibleSteps: number, role: JuggleRole, velocity: number];

export const JUGGLE_ROLES: readonly JuggleRole[] = ['REPEAT', 'EXTEND', 'STUTTER', 'REORDER', 'ACCENT', 'FILL', 'BREAKDOWN', 'RETURN'];
export const MG_VEL = { base: 0.85, step: 0.02 } as const;
export const SR_VEL = { base: 0.8, step: 0.03 } as const;

export const alt = (deck: JuggleDeck): JuggleDeck => (deck === DECK_A ? DECK_B : DECK_A);

export const patOriginal = (bar: number): JuggleEvent[] => [[bar, 0, DECK_A, 'BAR_START', 16, 'RETURN', 0.9]];

export const patDoubleKick = (bar: number): JuggleEvent[] => [
  [bar, 0, DECK_A, 'KICK_1', 2, 'REPEAT', 0.95], [bar, 2, DECK_B, 'KICK_1', 2, 'REPEAT', 0.9],
  [bar, 4, DECK_A, 'SNARE_1', 4, 'EXTEND', 0.9], [bar, 8, DECK_B, 'KICK_2', 4, 'EXTEND', 0.88],
  [bar, 12, DECK_A, 'SNARE_2', 4, 'EXTEND', 0.9],
];

export function patKickStutter(bar: number): JuggleEvent[] {
  const ev: JuggleEvent[] = [];
  let deck = DECK_A;
  for (const s of [0, 2, 4, 6]) { ev.push([bar, s, deck, 'KICK_1', 2, 'STUTTER', 0.9]); deck = alt(deck); }
  ev.push([bar, 8, DECK_A, 'SNARE_1', 4, 'EXTEND', 0.9]);
  ev.push([bar, 12, DECK_B, 'SNARE_2', 4, 'EXTEND', 0.9]);
  return ev;
}

export const patSnareRepeat = (bar: number): JuggleEvent[] => [
  [bar, 0, DECK_A, 'KICK_1', 4, 'RETURN', 0.9], [bar, 8, DECK_A, 'SNARE_1', 2, 'STUTTER', 0.9],
  [bar, 10, DECK_B, 'SNARE_1', 2, 'STUTTER', 0.92], [bar, 12, DECK_A, 'SNARE_2', 2, 'STUTTER', 0.94],
  [bar, 14, DECK_B, 'SNARE_2', 2, 'FILL', 0.9],
];

export const patReorder = (bar: number): JuggleEvent[] => [
  [bar, 0, DECK_A, 'KICK_1', 4, 'REORDER', 0.95], [bar, 4, DECK_B, 'SNARE_1', 4, 'REORDER', 0.9],
  [bar, 8, DECK_A, 'KICK_2', 4, 'REORDER', 0.92], [bar, 12, DECK_B, 'SNARE_2', 4, 'REORDER', 0.9],
];

export const patHalfBar = (bar: number, deck0: JuggleDeck = DECK_A): JuggleEvent[] => [
  [bar, 0, deck0, 'BAR_START', 8, 'REPEAT', 0.9], [bar, 8, alt(deck0), 'BAR_START', 8, 'REPEAT', 0.9],
];

export function patMachineGun(bar: number): JuggleEvent[] {
  const ev: JuggleEvent[] = [];
  let deck = DECK_A;
  for (let s = 0; s < 8; s++) { ev.push([bar, s, deck, 'KICK_1', 1, 'STUTTER', MG_VEL.base + MG_VEL.step * s]); deck = alt(deck); }
  ev.push([bar, 8, DECK_A, 'SNARE_1', 2, 'EXTEND', 0.95]);
  ev.push([bar, 10, DECK_B, 'KICK_2', 2, 'REORDER', 0.9]);
  ev.push([bar, 12, DECK_A, 'SNARE_2', 2, 'STUTTER', 0.95]);
  ev.push([bar, 14, DECK_B, 'SNARE_2', 2, 'FILL', 0.92]);
  return ev;
}

export function patSnareRoll(bar: number): JuggleEvent[] {
  const ev: JuggleEvent[] = [[bar, 0, DECK_A, 'BAR_START', 8, 'RETURN', 0.9]];
  let deck = DECK_A;
  for (const s of [8, 10, 12, 13, 14, 15]) { ev.push([bar, s, deck, 'SNARE_1', 1, 'STUTTER', SR_VEL.base + SR_VEL.step * (s - 8)]); deck = alt(deck); }
  return ev;
}

export type JugglePatternName = 'original' | 'double_kick' | 'kick_stutter' | 'snare_repeat' | 'reorder' | 'half_bar' | 'machine_gun' | 'snare_roll';
export const JUGGLE_PATTERNS: Readonly<Record<JugglePatternName, (bar: number, deck0?: JuggleDeck) => JuggleEvent[]>> = {
  original: patOriginal, double_kick: patDoubleKick, kick_stutter: patKickStutter, snare_repeat: patSnareRepeat,
  reorder: patReorder, half_bar: patHalfBar, machine_gun: patMachineGun, snare_roll: patSnareRoll,
};

const byBarStep = (a: JuggleEvent, b: JuggleEvent): number => a[0] - b[0] || a[1] - b[1];

/** `plan_resets(events, src, bpm, rate)`: the entries whose hidden deck cannot rewind to their cue in time. */
export function planResets(events: readonly JuggleEvent[], src: Pick<JuggleSource, 'cues' | 'step'>, bpm: number, rate: number): Array<[number, number, JuggleDeck]> {
  const stepS = 60.0 / (bpm * 4);
  const byDeck = new Map<JuggleDeck, JuggleEvent[]>();
  for (const e of [...events].sort(byBarStep)) { const l = byDeck.get(e[2]) ?? []; l.push(e); byDeck.set(e[2], l); }
  const bad: Array<[number, number, JuggleDeck]> = [];
  for (const [deck, evs] of byDeck) {
    for (let i = 1; i < evs.length; i++) {
      const prev = evs[i - 1]!, cur = evs[i]!;
      const gap = ((cur[0] - prev[0]) * 16 + (cur[1] - prev[1])) * stepS;
      const pcue = cueOf(src, prev[3]), ncue = cueOf(src, cur[3]);
      const loop = src.cues.LOOP_END || src.step * 16;
      const prevEnd = pyMod(pcue + prev[4] * src.step, loop);
      if (ncue < prevEnd - 1e-3) {
        const need = (prevEnd - ncue) / (MAX_REWIND_SPEED * rate) + 0.02;
        if (gap < need - 1e-3) bad.push([cur[0], cur[1], deck]);
      }
    }
  }
  return bad;
}

/** `_lfsr16(seed)`: the juggle bus's 16-bit Galois LFSR (device_juggle_bus), values 0..65535. */
export function* lfsr16(seed: number): Generator<number, never> {
  let s = (Math.trunc(seed) & 0xffff) || 0xace1;
  for (;;) {
    const lsb = s & 1;
    s >>= 1;
    if (lsb) s ^= 0xb400;
    yield s;
  }
}

/**
 * `render_juggle(events, src, bpm, rate, seed, gain, src_b, tune, tight=True)`: each event plays its deck's record
 * from its cue until the next event (one bar at most), the click-safe release edge, the device's micro-timing.
 */
export function renderJuggle(events: readonly JuggleEvent[], src: JuggleSource, bpm: number, rate: number, opts: { seed?: number; gain?: number; srcB?: JuggleSource | null; tune?: RenderTune } = {}): Float64Array {
  beatJuggleStats.juggles++;
  const t = opts.tune ?? RENDER_TUNE;
  const gain = opts.gain ?? t.gain;
  const step = juggleStep(bpm, rate), barlen = step * 16;
  const nbars = events.length ? Math.max(...events.map((e) => e[0])) + 1 : 1;
  const N = nbars * barlen + Math.trunc(0.3 * rate);
  const out = new Float64Array(N);
  const evs = [...events].sort(byBarStep);
  const onset = evs.map((e) => e[0] * barlen + e[1] * step);
  const lfsr = lfsr16((Math.trunc(opts.seed ?? 0) & 0xffff) || 1);
  const micro = Math.trunc(t.micro_timing_s * rate);
  evs.forEach(([, , deck, cue, durSteps, , vel], i) => {
    const rec = opts.srcB && deck === DECK_B ? opts.srcB : src;
    const rbar = Math.max(1, Math.trunc(rec.step ?? step) * 16);
    let o = onset[i]!;
    const nxt = i + 1 < evs.length ? onset[i + 1]! : o + Math.max(1, durSteps) * step;
    const seglen = Math.max(1, Math.min(nxt - o, barlen));
    const hit = renderHit(rec, cue, seglen / rate, rate, t, rbar);
    const g = gain * vel;
    const seg = new Float64Array(Math.min(seglen, hit.length));
    for (let k = 0; k < seg.length; k++) seg[k] = hit[k]! * g;
    const r = Math.min(seg.length, Math.trunc(t.release_s * rate));
    if (r > 1) { const down = linspace(1, 0, r); for (let k = 0; k < r; k++) seg[seg.length - r + k] = seg[seg.length - r + k]! * down[k]!; }
    const off = micro > 0 ? Math.floor(((lfsr.next().value - 32768) * micro) / 32768) : 0;
    o = Math.max(0, o + off);
    const e = Math.min(N, o + seg.length);
    for (let k = o; k < e; k++) out[k] = out[k]! + seg[k - o]!;
  });
  return out;
}

// ── validation, repair (J9) ─────────────────────────────────────────────

/** `validate(events, src, bpm, rate)`: impossible rewinds, the original groove lost, both decks audible at once. */
export function validateJuggle(events: readonly JuggleEvent[], src: Pick<JuggleSource, 'cues' | 'step'>, bpm: number, rate: number): string[] {
  const issues: string[] = [];
  if (planResets(events, src, bpm, rate).length) issues.push('rewind cannot complete in time (s.21/41)');
  const roles = events.map((e) => e[5]);
  const anchors = roles.filter((r) => r === 'RETURN').length + roles.filter((r) => r === 'REPEAT').length;
  if (roles.length && anchors < 0.15 * roles.length) issues.push('original groove lost -- no RETURN/REPEAT anchor (s.41)');
  const seen = new Map<string, JuggleDeck>();
  for (const [bar, st, deck] of events) {
    const k = `${bar}:${st}`;
    if (seen.has(k) && seen.get(k) !== deck) { issues.push('both decks audible at once -> doubling/comb (s.25/41)'); break; }
    seen.set(k, deck);
  }
  return issues;
}

/** `repair(events, src, bpm, rate)`: drop impossible rewinds (up to 6 passes); a chaotic routine gets an original bar. */
export function repairJuggle(events: readonly JuggleEvent[], src: Pick<JuggleSource, 'cues' | 'step'>, bpm: number, rate: number): JuggleEvent[] {
  let out = [...events];
  for (let pass = 0; pass < 6; pass++) {
    const bad = new Set(planResets(out, src, bpm, rate).map(([b, s, d]) => `${b}:${s}:${d}`));
    if (!bad.size) break;
    out = out.filter((e) => !bad.has(`${e[0]}:${e[1]}:${e[2]}`));
  }
  const roles = out.map((e) => e[5]);
  const anchors = roles.filter((r) => r === 'RETURN').length + roles.filter((r) => r === 'REPEAT').length;
  if (!roles.length || anchors < 0.15 * roles.length) {
    const maxbar = out.length ? Math.max(...out.map((e) => e[0])) : 0;
    out = [...out.filter((e) => e[0] !== maxbar + 1), ...patOriginal(maxbar + 1)];
  }
  return out;
}

// ── routines and macros (J8, J4) ────────────────────────────────────────

export type JuggleRoutineName = 'kick_double' | 'technical' | 'machine_gun' | 'snare_roll';

/** The four factory routines' event lists before repair (beat_juggle `routine_*`). */
export function juggleRoutineEvents(name: JuggleRoutineName): JuggleEvent[] {
  const P = JUGGLE_PATTERNS;
  switch (name) {
    case 'kick_double': return [...P.original(0), ...P.original(1), ...P.double_kick(2), ...P.double_kick(3), ...P.half_bar(4), ...P.half_bar(5), ...P.snare_repeat(6), ...P.original(7)];
    case 'technical': return [...P.original(0), ...P.original(1), ...P.double_kick(2), ...P.double_kick(3), ...P.reorder(4), ...P.reorder(5), ...P.half_bar(6), ...P.half_bar(7),
      ...P.snare_repeat(8), ...P.kick_stutter(9), ...P.reorder(10), ...P.reorder(11), ...P.kick_stutter(12), ...P.snare_repeat(13), ...P.original(14), ...P.original(15)];
    case 'machine_gun': return [...P.original(0), ...P.machine_gun(1), ...P.machine_gun(2), ...P.original(3)];
    case 'snare_roll': return [...P.original(0), ...P.snare_roll(1), ...P.snare_roll(2), ...P.original(3)];
  }
}

/** `routine_kick_double` / `routine_technical` / `routine_machine_gun` / `routine_snare_roll`: repaired, rendered. */
export function renderJuggleRoutine(name: JuggleRoutineName, src: JuggleSource, bpm: number, rate: number, seed = 0, srcB: JuggleSource | null = null): { sig: Float64Array; events: JuggleEvent[] } {
  const events = repairJuggle(juggleRoutineEvents(name), src, bpm, rate);
  return { sig: renderJuggle(events, src, bpm, rate, { seed, srcB }), events };
}

/** `routine_events_16(src)`: the 16-bar development event list. */
export function routineEvents16(): JuggleEvent[] {
  const P = JUGGLE_PATTERNS;
  return [...P.original(0), ...P.original(1), ...P.double_kick(2), ...P.double_kick(3), ...P.half_bar(4), ...P.half_bar(5), ...P.snare_repeat(6), ...P.reorder(7),
    ...P.reorder(8), ...P.kick_stutter(9), ...P.half_bar(10), ...P.half_bar(11), ...P.kick_stutter(12), ...P.snare_repeat(13), ...P.original(14), ...P.original(15)];
}

/** beat_juggle `render_macro(src, text, bpm, rate, seed)`: one macro per bar (DOUBLE_HIT, TRIPLE_HIT, REPEAT_HALF_BAR, REORDER_KICK_SNARE, STUTTER cue n, RETURN_ORIGINAL). */
export function juggleMacroEvents(text: string): JuggleEvent[] {
  const ev: JuggleEvent[] = [];
  let bar = 0;
  for (const line of text.trim().split(/\r\n|\r|\n/)) {
    const p = line.split(/\s+/).filter(Boolean);
    if (!p.length) continue;
    const op = p[0]!.toUpperCase();
    if (op === 'DOUBLE_HIT') {
      const cue = p.length > 1 ? p[1]! : 'KICK_1';
      ev.push([bar, 0, DECK_A, cue, 2, 'REPEAT', 0.95], [bar, 2, DECK_B, cue, 2, 'REPEAT', 0.9], [bar, 4, DECK_A, 'SNARE_1', 12, 'EXTEND', 0.9]);
    } else if (op === 'TRIPLE_HIT') {
      const cue = p.length > 1 ? p[1]! : 'KICK_1';
      [0, 2, 4].forEach((s, i) => ev.push([bar, s, i % 2 === 0 ? DECK_A : DECK_B, cue, 2, 'STUTTER', 0.9]));
      ev.push([bar, 6, DECK_A, 'SNARE_1', 10, 'EXTEND', 0.9]);
    } else if (op === 'REPEAT_HALF_BAR') ev.push(...patHalfBar(bar));
    else if (op === 'REORDER_KICK_SNARE') ev.push(...patReorder(bar));
    else if (op === 'STUTTER' && p.length > 2) {
      const cue = p[1]!, cnt = pyInt(p[2]!);
      let deck = DECK_A;
      for (let i = 0; i < cnt; i++) { ev.push([bar, i * Math.floor(16 / cnt), deck, cue, Math.floor(16 / cnt), 'STUTTER', 0.9]); deck = alt(deck); }
    } else if (op === 'RETURN_ORIGINAL') ev.push(...patOriginal(bar));
    bar++;
  }
  return ev;
}

/** Python `int(token)`: decimal digits with an optional sign and underscores between digits; else a ValueError. */
function pyInt(tok: string): number {
  if (!/^[+-]?\d+(_\d+)*$/.test(tok)) throw new Error(`invalid literal for int() with base 10: '${tok}'`);
  return Number.parseInt(tok.replace(/_/g, ''), 10);
}

export function renderJuggleMacro(src: JuggleSource, text: string, bpm: number, rate: number, seed = 0): { sig: Float64Array; events: JuggleEvent[] } {
  const events = juggleMacroEvents(text);
  return { sig: renderJuggle(events, src, bpm, rate, { seed }), events };
}

// ── the three-deck routine's A/B layer (J10, J9) ────────────────────────

export const JUGGLE_PATTERN_BY_LEVEL: Readonly<Record<0 | 1 | 2 | 3 | 4, JugglePatternName>> = { 0: 'original', 1: 'double_kick', 2: 'half_bar', 3: 'reorder', 4: 'kick_stutter' };
export const JUGGLE_ROTATION: Readonly<Record<0 | 1 | 2 | 3 | 4, readonly JugglePatternName[]>> = {
  0: ['original', 'original', 'original', 'double_kick'],
  1: ['double_kick', 'original', 'snare_repeat', 'double_kick'],
  2: ['half_bar', 'double_kick', 'reorder', 'snare_repeat'],
  3: ['reorder', 'machine_gun', 'snare_roll', 'kick_stutter'],
  4: ['machine_gun', 'kick_stutter', 'snare_roll', 'reorder'],
};
/** `SECTION_BREAK`: the synth break (or the real amen) per arc section. */
export const SECTION_BREAK: readonly string[] = ['boombap', 'funk', 'boombap', 'halftime', 'boombap', 'amen', 'funk', 'amen', 'boombap'];
/** `THREE_DECK_RECORDS`: the hip-hop records the A/B decks juggle (style, key). */
export const THREE_DECK_RECORDS: ReadonlyArray<readonly [string, string]> = [['golden_era', 'Am'], ['east_coast', 'Cm'], ['g_funk', 'Gm'], ['lofi', 'Dm'], ['memphis', 'Em']];
/** `SECTION_DECK_PAIR`: the (deck A, deck B) record per arc section. */
export const SECTION_DECK_PAIR: ReadonlyArray<readonly [number, number]> = [[0, 1], [2, 0], [1, 3], [0, 2], [3, 1], [4, 0], [1, 4], [2, 3], [0, 1]];
/** `REAL_BREAKS`: the amen at 175 BPM, its second bar. */
export const REAL_BREAKS = { amen: { srcBpm: 175, useBar: 1 } } as const;

/**
 * `_perf_events(jl, b0, bars, scratch_out)`: the rapid hand-juggle rotation only at JUGGLE_JL_MIN with Deck C out (two
 * hands); otherwise the records just play, the deck swapping every 2-bar phrase.
 */
export function perfEvents(jl: number, b0: number, bars: number, scratchOut: boolean): JuggleEvent[] {
  const ev: JuggleEvent[] = [];
  if (jl >= THREE_DECK_JUGGLE_JL_MIN && scratchOut) {
    const rot = JUGGLE_ROTATION[Math.min(jl, 4) as 0 | 1 | 2 | 3 | 4];
    for (let b = 0; b < bars; b++) {
      const pat = rot[b % rot.length]!;
      ev.push(...(pat === 'half_bar' ? patHalfBar(b0 + b, b % 2 === 0 ? DECK_A : DECK_B) : JUGGLE_PATTERNS[pat](b0 + b)));
    }
  } else {
    for (let b = 0; b < bars; b++) ev.push([b0 + b, 0, Math.floor(b / 2) % 2 === 0 ? DECK_A : DECK_B, 'BAR_START', 16, 'RETURN', 0.85]);
  }
  return ev;
}

/** `build_juggle_events(src, seed, budget)`: the 32-bar arc's A/B events, repaired. */
export function buildJuggleEvents(src: JuggleSource): JuggleEvent[] {
  const ev: JuggleEvent[] = [];
  for (const [, b0, bars, jl, , role] of THREE_DECK_ARC) ev.push(...perfEvents(jl, b0, bars, role === 'silent'));
  return repairJuggle(ev, src, src.bpm, src.rate);
}

/** `_section_juggle_events(jl, bars, role)`: one section's events, bars local. */
export const sectionJuggleEvents = (jl: number, bars: number, role = 'silent'): JuggleEvent[] => perfEvents(jl, 0, bars, role === 'silent');

/** The records a juggle bus reads: the synth breaks, the amen bytes and the hip-hop records (as the demo rendered them). */
export interface JuggleBusSources {
  /** `swap_breaks` with no records: the section's synth break or the real amen (its WAV bytes). */
  amenWav?: ArrayBuffer;
  /** `records`: the hip-hop records (THREE_DECK_RECORDS order), already fitted (`hiphopRecord`). */
  records?: readonly JuggleSource[];
  /** Neither: one break throughout (`swap_breaks=False`). */
  src?: JuggleSource;
}

/**
 * `build_juggle_bus(src, bpm, rate, seed, budget, swap_breaks, records)`: the routine's own A/B audio - per arc section
 * its events (repaired against its record) rendered at the section's bar, the seed + section index.
 */
export function buildJuggleBus(bpm: number, rate: number, seed: number, sources: JuggleBusSources): Float64Array {
  beatJuggleStats.buses++;
  const step = juggleStep(bpm, rate), barLen = step * 16;
  const total = 32 * barLen;
  const out = new Float64Array(total + Math.trunc(0.4 * rate));
  const cache = new Map<string, JuggleSource>();
  THREE_DECK_ARC.forEach(([, b0, bars, jl, , role], si) => {
    let bsrc: JuggleSource, bsrcB: JuggleSource | null = null;
    if (sources.records) {
      const [ai, bi] = SECTION_DECK_PAIR[si]!;
      bsrc = sources.records[ai % sources.records.length]!;
      bsrcB = sources.records[bi % sources.records.length]!;
    } else if (!sources.src) {
      const v = SECTION_BREAK[si]!;
      if (!cache.has(v)) {
        if (v === 'amen') {
          if (!sources.amenWav) throw new Error('buildJuggleBus: the amen break is not loaded');
          cache.set(v, fitBreak(sources.amenWav, REAL_BREAKS.amen.srcBpm, bpm, rate, REAL_BREAKS.amen.useBar));
        } else cache.set(v, makeBreak({ bpm, rate, variant: v }));
      }
      bsrc = cache.get(v)!;
    } else bsrc = sources.src;
    const ev = repairJuggle(sectionJuggleEvents(jl, bars, role), bsrc, bpm, rate);
    const seg = renderJuggle(ev, bsrc, bpm, rate, { seed: seed + si, srcB: bsrcB });
    const o = b0 * barLen, e = Math.min(out.length, o + seg.length);
    for (let i = o; i < e; i++) out[i] = out[i]! + seg[i - o]!;
  });
  return out;
}

/** three_deck `validate_budget(budget)`: sections whose juggle + permitted scratch level exceed two hands. */
export function validateBudget(budget = THREE_DECK_BUDGET): Array<[string, number, number]> {
  const bad: Array<[string, number, number]> = [];
  for (const [name, , , jl, sl] of THREE_DECK_ARC) {
    const eff = Math.min(sl, scratchPermissionFor(jl, budget));
    if (jl + eff > budget) bad.push([name, jl, eff]);
  }
  return bad;
}

/** three_deck `validate(src, seed, budget)`: the budget and the A/B layer. */
export function validateThreeDeck(src: JuggleSource, budget = THREE_DECK_BUDGET): string[] {
  const issues: string[] = [];
  if (validateBudget(budget).length) issues.push('budget exceeded -- impossible two-hand performance (s.34)');
  if (validateJuggle(buildJuggleEvents(src), src, src.bpm, src.rate).length) issues.push('beat-juggle layer invalid (s.34)');
  return issues;
}

/** `_section_juggles` re-exported for the A/B layer's readers. */
export { sectionJuggles };

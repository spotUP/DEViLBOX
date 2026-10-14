/**
 * The demo's performance-stream quantizer (dj_viz.py, ledger D1 / D3 / D4 / D6), ported exactly: raw performance
 * arrays (the platter angles, the Deck C fader and slip at 22,050 Hz) and the event timelines (scratch events,
 * juggle events, the arc sections) -> one byte per 50 Hz tick per stream. Pure and deterministic: the same render
 * gives the same streams, byte for byte the demo's (`threeDeckShowcase.test.ts`, fixture
 * `tools/scratch-fixtures/gen_three_deck_showcase.py`).
 *
 * Python rounding is kept where it decides a byte: `round()` / `np.round` round half to even, `astype(uint8)` of a
 * clipped float truncates, `int64 & 0xFF` is the non-negative low byte.
 */

/** dj_viz `FPS`: the 50 Hz sync grid. */
export const DJ_VIZ_FPS = 50;
/** dj_viz `PLATTER_RPM`: 33 1/3, one byte = one revolution. */
export const DJ_VIZ_PLATTER_RPM = 33.3333;
/** dj_viz `SLIP_REF`: |slip_vel| at full scale. */
export const DJ_VIZ_SLIP_REF = 3.0;

/** dj_viz `_GESTURE_ORDER`: the stable gesture enum (0 = none; drop_phrase appended). */
export const DJ_VIZ_GESTURE_ORDER: readonly string[] = [
  'none',
  'baby', 'baby_slow', 'backward_stab', 'brake', 'chirp', 'chirp_double',
  'crab', 'cut', 'drag', 'drop', 'echo', 'flare1', 'flare2', 'forward_stab',
  'hydroplane', 'needle_drop', 'needle_lift', 'orbit', 'scribble', 'spinup',
  'tear_fwd', 'tear_rev', 'transformer4', 'transformer8',
  'drop_phrase',
];
/** dj_viz `GESTURE_IDS`. */
export const DJ_VIZ_GESTURE_IDS: Readonly<Record<string, number>> = Object.fromEntries(DJ_VIZ_GESTURE_ORDER.map((n, i) => [n, i]));
/** dj_viz `_GESTURE_STEPS` (unknown: 2). */
export const DJ_VIZ_GESTURE_STEPS: Readonly<Record<string, number>> = {
  baby: 2, baby_slow: 3, forward_stab: 1, backward_stab: 1, chirp: 2,
  chirp_double: 2, transformer4: 2, transformer8: 4, tear_fwd: 2,
  tear_rev: 2, flare1: 2, flare2: 2, orbit: 3, scribble: 2, drag: 4,
  cut: 1, crab: 2, hydroplane: 3, echo: 2, brake: 4, spinup: 4,
  drop: 4, needle_drop: 2, needle_lift: 1, drop_phrase: 16,
};

/** dj_viz `UPFADER_REST` / `UPFADER_SLEW` (D3). */
export const UPFADER_REST = 30;
export const UPFADER_SLEW = 20;
/** dj_viz `CUE_GROOVE` / `TONEARM_SLEW` (D4): Deck C's pickup on the groove of the cue being scratched. */
export const CUE_GROOVE: Readonly<Record<string, number>> = { HOME: 40, SECONDARY: 100, ACCENT: 160, FX: 215 };
export const TONEARM_SLEW = 28;
/** dj_viz `CROSSFADER_EASE` / `CROSSFADER_SLEW`. */
export const CROSSFADER_EASE = 0.05;
export const CROSSFADER_SLEW = 6;

/** dj_viz `STREAM_NAMES` (slot order). */
export const DJ_VIZ_STREAM_NAMES = [
  'platter_a', 'platter_b', 'platter_c',
  'crossfader', 'upfader_a', 'upfader_b', 'upfader_c',
  'deck_active', 'gesture_id', 'scratch_intensity',
  'tonearm_a', 'tonearm_b', 'tonearm_c',
  'energy', 'beat_env_a', 'beat_env_b',
  'juggle_level',
] as const;
export type DjVizStreamName = typeof DJ_VIZ_STREAM_NAMES[number];
export type DjVizStreams = Record<DjVizStreamName, Uint8Array>;

/** dj_viz `schema()`: stream name -> slot. */
export const djVizSchema = (): Record<DjVizStreamName, number> => Object.fromEntries(DJ_VIZ_STREAM_NAMES.map((n, i) => [n, i])) as Record<DjVizStreamName, number>;

/** Python's round(): half to even. */
export function roundHalfEven(x: number): number {
  const f = Math.floor(x), d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

const clip = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** `_tick_sample_index`: the audio sample at the start of each tick. */
export function tickSampleIndex(nTicks: number, rate: number): Float64Array {
  const out = new Float64Array(nTicks), r = rate / DJ_VIZ_FPS;
  for (let t = 0; t < nTicks; t++) out[t] = Math.trunc(t * r);
  return out;
}

/** `_sample_at_ticks`: an audio-rate array read once per tick (clamped). */
export function sampleAtTicks(arr: ArrayLike<number>, nTicks: number, rate: number): Float64Array {
  const out = new Float64Array(nTicks);
  if (arr.length === 0) return out;
  const idx = tickSampleIndex(nTicks, rate);
  for (let t = 0; t < nTicks; t++) out[t] = arr[clip(idx[t]!, 0, arr.length - 1)]!;
  return out;
}

/** `_angle_to_bytes`: the cumulative record angle (source samples) -> one byte per revolution. */
export function angleToBytes(angle: ArrayLike<number>, nTicks: number, rate: number): Uint8Array {
  const rev = rate * 60.0 / DJ_VIZ_PLATTER_RPM;
  const a = sampleAtTicks(angle, nTicks, rate), out = new Uint8Array(nTicks);
  for (let t = 0; t < nTicks; t++) out[t] = ((Math.floor(a[t]! / rev * 256.0) % 256) + 256) % 256;
  return out;
}

/** `_fader_to_bytes`: 0..1 -> 0..255 per tick. */
export function faderToBytes(fader: ArrayLike<number>, nTicks: number, rate: number): Uint8Array {
  const f = sampleAtTicks(fader, nTicks, rate), out = new Uint8Array(nTicks);
  for (let t = 0; t < nTicks; t++) out[t] = clip(roundHalfEven(f[t]! * 255.0), 0, 255);
  return out;
}

/** `_position_to_bytes`: the absolute play position over its range, 0..255 (the tonearm of a beat deck). */
export function positionToBytes(angle: ArrayLike<number>, nTicks: number, rate: number): Uint8Array {
  const a = sampleAtTicks(angle, nTicks, rate), out = new Uint8Array(nTicks);
  let lo = Infinity, hi = -Infinity;
  for (let t = 0; t < nTicks; t++) { lo = Math.min(lo, a[t]!); hi = Math.max(hi, a[t]!); }
  if (hi - lo < 1e-6) return out;
  for (let t = 0; t < nTicks; t++) out[t] = Math.trunc(clip((a[t]! - lo) / (hi - lo) * 255.0, 0, 255));
  return out;
}

/** `_step_samples`. */
export const vizStepSamples = (bpm: number, rate: number): number => Math.trunc(rate * 60.0 / (bpm * 4));
/** `_sample_to_tick`. */
export const sampleToTick = (sample: number, rate: number): number => Math.trunc(sample * DJ_VIZ_FPS / rate);

/** `_slew`: at most `maxStep` per tick toward the target. */
export function slew(arr: ArrayLike<number>, maxStep: number): Uint8Array {
  const out = new Uint8Array(arr.length);
  let cur = arr.length ? arr[0]! : 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i]! - cur;
    if (d > maxStep) cur += maxStep;
    else if (d < -maxStep) cur -= maxStep;
    else cur = arr[i]!;
    out[i] = roundHalfEven(cur);
  }
  return out;
}

/** `_ease`: one-pole low-pass. */
export function ease(arr: ArrayLike<number>, alpha: number): Uint8Array {
  const out = new Uint8Array(arr.length);
  let y = arr.length ? arr[0]! : 0;
  for (let i = 0; i < arr.length; i++) { y += alpha * (arr[i]! - y); out[i] = roundHalfEven(y); }
  return out;
}

/** `_smooth`: moving average (odd window), edge padded. */
export function smooth(arr: ArrayLike<number>, win: number): Uint8Array {
  const n = arr.length;
  if (win < 2 || n < 2) return Uint8Array.from(arr, (v) => ((Math.trunc(v) % 256) + 256) % 256);
  const pad = Math.floor(win / 2);
  const ap = new Float64Array(n + 2 * pad);
  for (let i = 0; i < ap.length; i++) ap[i] = arr[clip(i - pad, 0, n - 1)]!;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < win; k++) s += ap[i + k]! * (1 / win);
    out[i] = clip(roundHalfEven(s), 0, 255);
  }
  return out;
}

/** A juggle event as dj_viz reads it: (bar, step, deck, cue, audible steps, ...). */
export type VizJuggleEvent = readonly [number, number, string, string | number, number, ...unknown[]];
/** A scratch event: (bar, step, cue role, demo gesture name, velocity). */
export type VizScratchEvent = readonly [number, number, string, string, number];

/** `_upfaders_from_juggle` (D3): each deck's channel fader up for its hits, UPFADER_REST between, slewed. */
export function upfadersFromJuggle(events: readonly VizJuggleEvent[], bpm: number, rate: number, nTicks: number): [Uint8Array, Uint8Array] {
  const up: Record<string, Uint8Array> = { A: new Uint8Array(nTicks).fill(UPFADER_REST), B: new Uint8Array(nTicks).fill(UPFADER_REST) };
  const step = vizStepSamples(bpm, rate), bar = step * 16;
  for (const ev of events) {
    const [b, st, deck] = ev;
    const u = up[deck];
    if (!u) continue;
    const length = ev.length > 4 ? ev[4] : 2;
    const start = sampleToTick(b * bar + st * step, rate);
    const end = Math.max(sampleToTick(b * bar + (st + length) * step, rate), start + 1);
    u.fill(255, Math.max(0, start), Math.max(Math.max(0, start), Math.min(nTicks, end)));
  }
  return [slew(up.A!, UPFADER_SLEW), slew(up.B!, UPFADER_SLEW)];
}

/** `_tonearm_c_from_cues` (D4): Deck C's pickup forward-filled to each event's cue groove, slewed. */
export function tonearmCFromCues(events: readonly VizScratchEvent[], bpm: number, rate: number, nTicks: number): Uint8Array {
  const out = new Uint8Array(nTicks).fill(CUE_GROOVE.HOME!);
  const step = vizStepSamples(bpm, rate), bar = step * 16;
  const sorted = events.map((e, i) => [e, i] as const).sort((x, y) => x[0][0] - y[0][0] || x[0][1] - y[0][1] || x[1] - y[1]).map(([e]) => e);
  for (const [b, st, role] of sorted) {
    const groove = CUE_GROOVE[role] ?? CUE_GROOVE.HOME!;
    const start = sampleToTick(b * bar + st * step, rate);
    if (Math.max(0, start) < nTicks) out.fill(groove, Math.max(0, start), nTicks);
  }
  return slew(out, TONEARM_SLEW);
}

/** `_upfader_c_from_active` (D3): Deck C's channel up while bit 2 of the active mask is set. */
export function upfaderCFromActive(deckActive: ArrayLike<number>): Uint8Array {
  return slew(Uint8Array.from(deckActive, (m) => ((m & 0b100) !== 0 ? 255 : UPFADER_REST)), UPFADER_SLEW);
}

/** `_gesture_id_stream` (D1): the Deck C gesture sounding at each tick (0 = none). */
export function gestureIdStream(events: readonly VizScratchEvent[], bpm: number, rate: number, nTicks: number, fold = 1): Uint8Array {
  const out = new Uint8Array(nTicks);
  const step = vizStepSamples(bpm, rate), bar = step * 16;
  for (const [b, st, , gesture] of events) {
    const gid = DJ_VIZ_GESTURE_IDS[gesture] ?? 0;
    if (gid === 0) continue;
    const start = sampleToTick(b * bar + st * step, rate);
    // a gesture over a fast set lasts twice its 16ths (scratch_fold: scratch.routine_tempo_fold)
    const dur = (DJ_VIZ_GESTURE_STEPS[gesture] ?? 2) * fold;
    const end = Math.max(sampleToTick(b * bar + (st + dur) * step, rate), start + 1);
    const s0 = Math.max(0, start), s1 = Math.min(nTicks, end);
    if (s1 > s0) out.fill(gid, s0, s1);
  }
  return out;
}

/** `_deck_active_stream` (D1): sections [(start bar, end bar, mask)] -> the per-tick A/B/C mask. */
export function deckActiveStream(sections: ReadonlyArray<readonly [number, number, number]>, bpm: number, rate: number, nTicks: number): Uint8Array {
  const out = new Uint8Array(nTicks);
  const bar = vizStepSamples(bpm, rate) * 16;
  for (const [b0, b1, mask] of sections) {
    const s0 = Math.max(0, sampleToTick(b0 * bar, rate)), s1 = Math.min(nTicks, sampleToTick(b1 * bar, rate));
    if (s1 > s0) out.fill(mask & 0xff, s0, s1);
  }
  return out;
}

/** `_intensity_stream` (D6): the peak |slip| over each tick's window, 0..255. */
export function intensityStream(slip: ArrayLike<number>, nTicks: number, rate: number): Uint8Array {
  const out = new Uint8Array(nTicks);
  if (slip.length === 0) return out;
  const idx = tickSampleIndex(nTicks, rate);
  const win = Math.max(1, Math.trunc(rate / DJ_VIZ_FPS));
  for (let t = 0; t < nTicks; t++) {
    const a = idx[t]!, b = Math.min(slip.length, a + win);
    let peak = 0;
    for (let i = a; i < b; i++) peak = Math.max(peak, Math.abs(slip[i]!));
    out[t] = Math.trunc(clip(peak / DJ_VIZ_SLIP_REF * 255.0, 0, 255));
  }
  return out;
}

/** `_energy_stream` (D6): the 32-bar arc [(start bar, bars, value)] per tick, one-pole smoothed. */
export function energyStream(arc: ReadonlyArray<readonly [number, number, number]> | null | undefined, bpm: number, nTicks: number): Uint8Array {
  const out = new Uint8Array(nTicks);
  if (!arc || !arc.length) return out;
  const ticksPerBar = DJ_VIZ_FPS * 4.0 * 60.0 / bpm;
  let sm = 0.0;
  for (let t = 0; t < nTicks; t++) {
    const bar = t / ticksPerBar;
    let e = arc[0]![2];
    for (const [sb, nb, en] of arc) {
      if (sb <= bar && bar < sb + nb) { e = en; break; }
      if (bar >= sb) e = en;
    }
    sm += 0.06 * (e - sm);
    out[t] = Math.trunc(Math.max(0.0, Math.min(1.0, sm)) * 255.0);
  }
  return out;
}

/** `_beat_env_stream` (D6): the beat bus's per-tick peak, 0..255. */
export function beatEnvStream(beat: ArrayLike<number> | null | undefined, rate: number, nTicks: number): Uint8Array {
  const out = new Uint8Array(nTicks);
  if (!beat || beat.length < 2) return out;
  const spp = Math.max(1, roundHalfEven(rate / DJ_VIZ_FPS));
  let peak = 0;
  for (let i = 0; i < beat.length; i++) peak = Math.max(peak, Math.abs(beat[i]!));
  peak += 1e-9;
  for (let t = 0; t < nTicks; t++) {
    const o = t * spp, e = Math.min(beat.length, o + spp);
    let v = 0;
    for (let i = o; i < e; i++) v = Math.max(v, Math.abs(beat[i]!));
    out[t] = Math.trunc(Math.min(1.0, v / peak) * 255.0);
  }
  return out;
}

export interface DjVizInput {
  platterAngles: Partial<Record<'a' | 'b' | 'c', ArrayLike<number>>>;
  faderC: ArrayLike<number>;
  slipC: ArrayLike<number>;
  scratchEvents: readonly VizScratchEvent[];
  juggleEvents: readonly VizJuggleEvent[];
  deckActiveSections: ReadonlyArray<readonly [number, number, number]>;
  bpm: number;
  rate: number;
  nTicks: number;
  beatmix?: ArrayLike<number> | null;
  arcEnergy?: ReadonlyArray<readonly [number, number, number]> | null;
  juggleArc?: ReadonlyArray<readonly [number, number, number]> | null;
  /** The set's 16ths per routine 16th (`scratch_fold`, scratchTempoFold). Omitted: 1. */
  scratchFold?: number;
}

/** Reachability sentinel: performances quantized. */
export const djVizStats = { quantized: 0 };

/** `quantize`: the raw performance -> every stream, one byte per tick. */
export function quantize(i: DjVizInput): DjVizStreams {
  djVizStats.quantized++;
  const { bpm, rate, nTicks } = i;
  const zero = new Float64Array(1);
  const s: Partial<DjVizStreams> = {};
  s.platter_a = angleToBytes(i.platterAngles.a ?? zero, nTicks, rate);
  s.platter_b = angleToBytes(i.platterAngles.b ?? zero, nTicks, rate);
  s.platter_c = angleToBytes(i.platterAngles.c ?? zero, nTicks, rate);
  s.crossfader = slew(ease(faderToBytes(i.faderC, nTicks, rate), CROSSFADER_EASE), CROSSFADER_SLEW);
  [s.upfader_a, s.upfader_b] = upfadersFromJuggle(i.juggleEvents, bpm, rate, nTicks);
  s.deck_active = deckActiveStream(i.deckActiveSections, bpm, rate, nTicks);
  s.upfader_c = upfaderCFromActive(s.deck_active);
  s.gesture_id = gestureIdStream(i.scratchEvents, bpm, rate, nTicks, i.scratchFold ?? 1);
  s.scratch_intensity = intensityStream(i.slipC, nTicks, rate);
  s.tonearm_a = positionToBytes(i.platterAngles.a ?? zero, nTicks, rate);
  s.tonearm_b = positionToBytes(i.platterAngles.b ?? zero, nTicks, rate);
  s.tonearm_c = tonearmCFromCues(i.scratchEvents, bpm, rate, nTicks);
  s.energy = energyStream(i.arcEnergy, bpm, nTicks);
  const be = beatEnvStream(i.beatmix, rate, nTicks);
  s.beat_env_a = Uint8Array.from(be, (v, t) => clip(Math.floor(v * s.upfader_a![t]! / 255), 0, 255));
  s.beat_env_b = Uint8Array.from(be, (v, t) => clip(Math.floor(v * s.upfader_b![t]! / 255), 0, 255));
  s.juggle_level = energyStream(i.juggleArc, bpm, nTicks);
  return s as DjVizStreams;
}

/** A stream's gesture byte as the demo's name ('none' for 0). */
export const gestureNameForId = (id: number): string => DJ_VIZ_GESTURE_ORDER[id] ?? 'none';

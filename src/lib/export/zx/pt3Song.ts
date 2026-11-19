/**
 * Furnace AY song -> ProTracker 3 module bytes (Vortex Tracker II format) for the standard PT3 player
 * (public/zx/pt3player.asm, S.V.Bulba's universal PT2/PT3 player) on a ZX Spectrum 128. Replaces the register-stream
 * capture route (zxAyStream) once tools/zx-pt3-check.ts passes. Layout follows the player's INIT/PTDECOD:
 * header (201 bytes), position list, pattern table, samples, ornaments, then the three channel streams per pattern.
 *
 * Mapping: Furnace instrument -> PT3 sample (volume, waveform and noise macros) plus a PT3 ornament (arpeggio macro),
 * both resampled from the Furnace tick rate to the player's fixed 50 Hz frame; order -> position; pattern rows -> one
 * skip-counted PT3 line each, with per-row delays from the accumulated Furnace tick time (groove included).
 * Pitch slides (01/02, E1/E2; linear or period slides) become PT3 glissando (command 1) fitted per row. Pitch macros and other
 * slide effects are not converted and are reported lossy.
 */

import type { FurnaceModule } from '../../import/formats/FurnaceSongParser';
import type { FurnaceMacro } from '../../import/formats/furnace/FurnaceInstrumentParser';
import type { FurnacePatternCell } from '../../import/formats/furnace/FurnacePatternParser';
import { convertFurnaceNoteValue } from '../../import/formats/furnace/FurnacePatternParser';
import { tapBlock, header, codeBlocks, basicLoader } from './zxTap';

export interface Pt3Song { module: Uint8Array; lossy: string[]; channelsWithNotes: boolean[]; frames: number }

class Lossy {
  private counts = new Map<string, number>();
  add(item: string, n = 1): void { this.counts.set(item, (this.counts.get(item) ?? 0) + n); }
  list(): string[] { return [...this.counts].map(([k, n]) => `${k}: ${n}`); }
}

const AY8910 = 0x80, AY8930 = 0x9a; // Furnace file system ids (FurnaceSongParser.ts)
const CHANNELS = 3;
const MACRO_VOL = 0, MACRO_ARP = 1, MACRO_NOISE = 2, MACRO_WAVE = 3, MACRO_PITCH = 4, MACRO_PHASE_RESET = 14;
/** Furnace AY envelope macros (ay.cpp): ex2 = shape (R13), ex3/alg = auto-envelope numerator/denominator, ex5 = period. */
const MACRO_ENV_SHAPE = 6, MACRO_AUTO_NUM = 7, MACRO_AUTO_DEN = 8, MACRO_ENV_PERIOD = 16;
const ENV_MACROS = [MACRO_ENV_SHAPE, MACRO_AUTO_NUM, MACRO_AUTO_DEN, MACRO_ENV_PERIOD];
const MAX_SAMPLES = 31, MAX_ORNAMENTS = 15, MAX_TICKS = 64;
/** Furnace channel volume (playback.cpp): volume << 8 plus a fraction; the AY's volMax is (15 << 8) | 0xff. */
const VOL_TOP = (15 << 8) | 0xff;
/** Furnace channel volume (<< 8) after each tick from the note on (0A slides, later cell volumes); the last value holds. */
type VolSlide = number[];
/** Furnace 0Axy speed per tick (playback.cpp): y slides down, else x up; 0A00 stops. */
const volSlideSpeed = (v: number): number => (v <= 0 ? 0 : (v & 15) ? -(v & 15) * 64 : (v >> 4) * 64);
const FRAME_HZ = 50;
/** A running glissando is kept for the next row while its worst frame stays this close (the checker allows 35). */
const GLISS_REUSE_CENTS = 30;
const ZX_CLOCK = 1773400;
/** Furnace's default AY clock (clockSel 0). Notes below its 12-bit period floor play at period 4095 in Furnace too.
 * shortcut: clockSel flags are not read, upgrade when a song sets another AY clock. */
const FURNACE_AY_CLOCK = 1789773;

/** Octave-1 tone periods (PT3 notes 0..11) the player depacks, by header table number; table 2 differs between
 * versions 3.0..3.4r (old, header version 3) and 3.4x+ (new, version 6). From MM-PTxPlay.asm T_PACK/NT_DATA; the
 * player's +-1 corrections are left out. Each further octave halves the period. */
const TONE_TABLES: Array<{ version: number; table: number; periods: number[] }> = [
  { version: 6, table: 0, periods: [0xC22, 0xB73, 0xACF, 0xA33, 0x9A1, 0x917, 0x894, 0x819, 0x7A4, 0x737, 0x6CF, 0x66D] },
  { version: 6, table: 1, periods: [0xEF8, 0xE10, 0xD60, 0xC80, 0xBD8, 0xB28, 0xA88, 0x9F0, 0x960, 0x8E0, 0x858, 0x7E0] },
  { version: 3, table: 2, periods: [0xD3E, 0xC80, 0xBCC, 0xB22, 0xA82, 0x9EC, 0x95C, 0x8D6, 0x858, 0x7E0, 0x76E, 0x704] },
  { version: 6, table: 2, periods: [0xD10, 0xC55, 0xBA4, 0xAFC, 0xA5F, 0x9CA, 0x93D, 0x8B8, 0x83B, 0x7C5, 0x755, 0x6EC] },
  { version: 6, table: 3, periods: [0xCDA, 0xC22, 0xB73, 0xACF, 0xA33, 0x9A1, 0x917, 0x894, 0x819, 0x7A4, 0x737, 0x6CF] },
];
interface Tuning { version: number; table: number; periods: number[]; noteOffset: number; cents: number }
/** clock scales the table the way the Vectrex exporter retunes it (pt3Tables.ts): periods x clock / ZX_CLOCK. */
const pt3Period = (t: Tuning, n: number, clock = ZX_CLOCK): number => t.periods[n % 12] * (clock / ZX_CLOCK) / 2 ** Math.floor(n / 12);
/** Hz Furnace plays for note nv (C-0 = 0, A-4 = 57), period floor of the 12-bit AY counter included. */
const furnaceHz = (tuningHz: number, nv: number): number => Math.max(FURNACE_AY_CLOCK / (16 * 4095), tuningHz * 2 ** ((nv - 57) / 12));
/** Table, version and note offset with the smallest worst-case pitch error over the notes the song uses. The residual
 * is a PT3 limit: the player has four fixed tone tables and no fine tune. */
function pickTuning(tuningHz: number, notes: number[], clock = ZX_CLOCK): Tuning {
  const hz = tuningHz > 0 ? tuningHz : 440;
  const used = notes.length ? notes : [48, 57, 60];
  let best: Tuning | undefined;
  for (const t of TONE_TABLES) for (let k = 0; k <= 30; k++) {
    const cand = { ...t, noteOffset: k, cents: 0 };
    let worst = 0;
    for (const nv of used) {
      const n = nv - k;
      if (n < 0 || n > 95) continue;
      worst = Math.max(worst, Math.abs(1200 * Math.log2(clock / (16 * pt3Period(cand, n, clock)) / furnaceHz(hz, nv))));
    }
    cand.cents = worst;
    if (!best || worst < best.cents - 1e-9) best = cand;
  }
  return best!;
}
/** BASIC PRINT lines: the S.V. Bulba player is shipped with credit. */
const PT3_CREDIT = ['PT3 player (c) 2004-2007', 'S.V.Bulba, Vortex Tracker II'];
const MODULE_BASE = 0xC000,MODULE_CAP = 0x4000;

/** Macro value per tick; the last value holds, or the loop restarts. */
function expand(mac: FurnaceMacro | undefined, ticks: number, fallback: number): number[] {
  if (!mac) return new Array<number>(ticks).fill(fallback);
  const raw: number[] = [];
  const speed = Math.max(1, mac.speed || 1);
  for (let i = 0; i < Math.max(0, mac.delay || 0); i++) raw.push(mac.data[0]);
  for (const v of mac.data.slice(0, mac.length)) for (let i = 0; i < speed; i++) raw.push(v);
  const loop = mac.loop >= 0 && mac.loop < mac.length ? (mac.delay || 0) + mac.loop * speed : -1;
  return Array.from({ length: ticks }, (_, t) => (t < raw.length ? raw[t] : loop >= 0 ? raw[loop + ((t - raw.length) % (raw.length - loop))] : raw[raw.length - 1]));
}
/** Furnace macro up to its release point (macroInt.cpp: past rel the macro holds, or loops when loop < rel, until the
 * note is released). PT3 has no note release, so the post-release tail is not played; the sustain lasts the whole note. */
function sustain(mac: FurnaceMacro, lossy: Lossy): FurnaceMacro {
  const rel = mac.release;
  if (!(rel >= 0 && rel < mac.length)) return mac;
  if (rel < mac.length - 1) lossy.add('macro release tail (PT3 has no note release; the sustain step holds)');
  return { ...mac, length: rel + 1, loop: mac.loop >= 0 && mac.loop < rel ? mac.loop : -1 };
}
/** Furnace macros after a macro release (note 254/255; macroInt.cpp doMacro): a macro held at its release point plays
 * on from the next step to its end, looping only when loop > rel; a macro without one keeps running. Null: no macro has a tail.
 * shortcut: assumes the note reached the release point before the release; a looping macro without one restarts. */
function releaseTail(macros: FurnaceMacro[]): FurnaceMacro[] | null {
  if (!macros.some((x) => x.release >= 0 && x.release < x.length - 1)) return null;
  return macros.map((x) => {
    if (x.length <= 0) return x;
    const loop = x.loop >= 0 && x.loop < x.length ? x.loop : -1, rel = x.release;
    // shortcut: loop == rel (back to the held step) plays the tail once and holds its end.
    if (rel >= 0 && rel < x.length - 1) return { ...x, data: x.data.slice(rel + 1, x.length), length: x.length - rel - 1, loop: loop > rel ? loop - rel - 1 : -1, delay: 0, release: -1 };
    if (rel >= 0) return { ...x, data: [x.data[rel]], length: 1, loop: -1, delay: 0, release: -1 };
    return loop >= 0 ? x : { ...x, data: [x.data[x.length - 1]], length: 1, delay: 0, release: -1 };
  });
}
const macroSpan = (m: FurnaceMacro | undefined): number => (m ? (m.delay || 0) + m.length * Math.max(1, m.speed || 1) : 1);
const macroLoop = (m: FurnaceMacro | undefined): number => (m && m.loop >= 0 && m.loop < m.length ? (m.delay || 0) + m.loop * Math.max(1, m.speed || 1) : -1);

/** Furnace tick index played at each 50 Hz player frame, for a macro of
 * lenTicks ticks looping at loopTick (-1: hold the last tick). A loop is unrolled to whole tick cycles that end on a
 * frame boundary, so the PT3 loop repeats the same ticks as Furnace. Residual: up to one frame of jitter per tick,
 * the player's 50 Hz interrupt. */
function frameTicks(lenTicks: number, loopTick: number, tickHz: number, lossy: Lossy, what: string): { idx: number[]; loop: number } {
  const r = tickHz / FRAME_HZ;
  // Frame f sounds for ticks [f*r, (f+1)*r); play the tick at the window midpoint, the one that sounds longest in it.
  // Taking the tick at the frame start lagged by one frame in 2 of every 5 frames of a 60 Hz song. 50 Hz: unchanged.
  const at = (f: number): number => Math.floor(f * r + r / 2 + 1e-9);
  const wrap = (t: number): number => (t < lenTicks ? t : loopTick < 0 ? lenTicks - 1 : loopTick + ((t - loopTick) % (lenTicks - loopTick)));
  const range = (n: number): number[] => Array.from({ length: n }, (_, f) => wrap(at(f)));
  if (loopTick < 0) {
    const n = Math.max(1, Math.ceil(lenTicks / r - 1e-9));
    if (n > MAX_TICKS) { lossy.add(`${what} longer than ${MAX_TICKS} frames (cut)`); return { idx: range(MAX_TICKS), loop: MAX_TICKS - 1 }; }
    return { idx: range(n), loop: n - 1 };
  }
  const cyc = lenTicks - loopTick;
  const f0 = Math.ceil(loopTick / r - 1e-9);
  for (let p = 1; f0 + p <= MAX_TICKS; p++) {
    const k = (p * r) / cyc;
    if (Math.abs(k - Math.round(k)) < 1e-6 && Math.round(k) >= 1) return { idx: range(f0 + p), loop: f0 };
  }
  lossy.add(`${what} loop does not fit ${MAX_TICKS} frames at ${tickHz} Hz (loop phase drifts)`);
  const n = Math.min(MAX_TICKS, f0 + Math.max(1, Math.round(cyc / r)));
  return { idx: range(n), loop: Math.min(f0, n - 1) };
}

/** PT3 sample: per frame b0 (noise), b1 (volume, tone/noise masks) and a 16-bit tone offset added to the note period. */
/** PT3 sample from Furnace AY macros. The wave macro is a bitmask (ay.cpp psgMode = wave & 7): bit 0 tone, bit 1 noise,
 * bit 2 hardware envelope. Furnace writes R6 = 31 - duty, so the noise offset is inverted. forceEnv: effect 22xy state for
 * instruments without a wave macro. */
/** basePeriod: the note's PT3 period, needed for a pitch macro (code 4), which becomes per-frame tone offsets. Furnace
 * ay.cpp: pitch2 = val (absolute) or pitch2 += val per tick (relative, mode 1); with linear pitch pitch2 is 1/128 note
 * (period * 2^(-pitch2/1536)), else it is subtracted from the period; the period is clamped to 0..4095. */
/** slide: the note's volume curve baked in (effect 0Axy and cell volumes); the channel volume is then 15. */
function sampleBytes(macros: FurnaceMacro[], lossy: Lossy, tickHz: number, toneShift: number, forceEnv = false, basePeriod?: number, linear = true, slide?: VolSlide): number[] {
  const pick = (code: number): FurnaceMacro | undefined => macros.find((x) => x.code === code && x.length > 0);
  for (const mac of macros) if (mac.length > 0 && ![MACRO_VOL, MACRO_ARP, MACRO_NOISE, MACRO_WAVE, MACRO_PITCH, MACRO_PHASE_RESET, ...ENV_MACROS].includes(mac.code)) lossy.add(`macro code ${mac.code} (pitch or other)`);
  const pitch = basePeriod === undefined ? undefined : pick(MACRO_PITCH);
  for (const c of ENV_MACROS) {
    const mac = pick(c);
    if (mac && new Set(mac.data.slice(0, mac.length)).size > 1) lossy.add(`envelope macro ${c} changing within a note (first value used)`);
  }
  const vol = pick(MACRO_VOL), wave = pick(MACRO_WAVE), noise = pick(MACRO_NOISE);
  const longest = [vol, wave, noise, pitch].reduce((a, m) => (macroSpan(m) > macroSpan(a) ? m : a), undefined as FurnaceMacro | undefined);
  const ticks = macroSpan(longest);
  const ft = frameTicks(ticks, macroLoop(longest), tickHz, lossy, 'instrument macro');
  let idx = ft.idx, loop = ft.loop;
  const v = expand(vol, ticks, 15), w = expand(wave, ticks, forceEnv ? 5 : 1), n = expand(noise, ticks, 0);
  // Pitch macro offset per frame, from the absolute Furnace tick of that frame (a relative macro accumulates).
  const r = tickHz / FRAME_HZ, at = (f: number): number => Math.floor(f * r + r / 2 + 1e-9);
  let per: ((f: number) => number) | null = null;
  if (pitch && basePeriod !== undefined) {
    const pv = expand(pitch, Math.ceil(MAX_TICKS * r) + 2, 0), rel = pitch.mode === 1, abs = expand(pitch, ticks, 0);
    const plen = macroSpan(pitch), ploop = macroLoop(pitch);
    const p2 = (T: number): number => {
      let acc = 0;
      // Past the end of a macro without a loop the macro stops: pitch2 keeps the sum.
      for (let t = 0; t <= (ploop < 0 ? Math.min(T, plen - 1) : T); t++) acc = Math.max(-32768, Math.min(32767, acc + pv[t]));
      return acc;
    };
    // Absolute: the frame's (looped) tick. Relative: the frame's real tick, since the sum does not loop.
    per = (f: number): number => {
      const p = rel ? p2(at(f)) : abs[idx[Math.min(f, idx.length - 1)]];
      const q = linear ? basePeriod * 2 ** (-p / 1536) : basePeriod - p;
      return Math.round(Math.max(0, Math.min(4095, q)) - basePeriod);
    };
    // A looping relative macro keeps bending: unroll the frames (other macros wrap at their loop) until the
    // period settles at a clamp or MAX_TICKS frames, then hold the last frame.
    const ramps = rel && ploop >= 0 && pv.slice(ploop, plen).some((x) => x !== 0);
    if (ramps) {
      const ext: number[] = [];
      for (let f = 0; f < MAX_TICKS; f++) {
        ext.push(f < idx.length ? idx[f] : idx[loop + ((f - idx.length) % (idx.length - loop))]);
        if (f > 0 && per(f) === per(f - 1) && per(f) === per(f + 1) && f >= idx.length) break;
      }
      if (ext.length >= MAX_TICKS && per(MAX_TICKS - 1) !== per(MAX_TICKS)) lossy.add(`pitch macro ramp longer than ${MAX_TICKS} frames (held)`);
      if (ext.length > idx.length && loop !== idx.length - 1) lossy.add('pitch macro ramp over a looping macro (loop held after the ramp)');
      idx = ext; loop = ext.length - 1;
    }
  }
  // Volume slide (playback.cpp): vol += speed on every tick from the row's first, stopping at 0 or the top.
  // A fade re-hit every P ticks (0A plus cell volumes, e.g. a 0A0F re-hit every 2 rows) loops on its period: p frames
  // hold a whole number of periods, so the PT3 loop replays the same ticks instead of unrolling 64 frames per note.
  // shortcut: only with held macros and no pitch macro; the loop also repeats past the look-ahead window.
  let sp = slide && !per && idx.length - loop === 1 ? slidePeriod(slide) : null;
  let p = 0, f0 = 0;
  if (sp) {
    while (f0 < MAX_TICKS && (at(f0) < sp.start || f0 < idx.length - 1)) f0++;
    for (p = 1; f0 + p <= MAX_TICKS && Math.abs(((p * r) / sp.ticks) % 1) > 1e-6; p++);
    if (f0 + p > MAX_TICKS) sp = null;
  }
  const volAt = (T: number): number => (!slide ? VOL_TOP : sp && T >= slide.length ? slide[sp.start + ((T - sp.start) % sp.ticks)] : slide[Math.min(T, slide.length - 1)]);
  if (sp) {
    idx = Array.from({ length: f0 + p }, (_, f) => idx[Math.min(f, idx.length - 1)]);
    loop = f0;
  } else if (slide) {
    let endTick = slide.length - 1; // first tick of the final constant run
    while (endTick > 0 && slide[endTick - 1] === slide[endTick]) endTick--;
    let lim = 0; // first frame at the limit
    while (lim < MAX_TICKS - 1 && at(lim) < endTick) lim++;
    if (at(lim) < endTick) lossy.add(`volume slide longer than ${MAX_TICKS} frames (cut)`);
    // Past the limit the macros keep looping at the final volume: unroll to the limit, then one loop cycle.
    const cyc = idx.length - loop, frames = lim + 1;
    if (frames > loop) {
      const wrap = (f: number): number => (f < idx.length ? idx[f] : idx[loop + ((f - idx.length) % cyc)]);
      const n = Math.min(MAX_TICKS, cyc === 1 ? frames : frames + cyc);
      if (n < frames + (cyc === 1 ? 0 : cyc)) lossy.add('volume slide over a looping macro (loop cut)');
      idx = Array.from({ length: n }, (_, f) => wrap(f));
      loop = cyc === 1 || n < frames + cyc ? Math.min(frames, n) - 1 : frames;
    }
  }
  const bend = idx.map((_, f) => (per ? per(f) : 0));
  const reset = pick(MACRO_PHASE_RESET);
  // Phase reset (code 14) restarts the AY envelope; PT3 restarts it on each note, so only a reset after step 0 is lost.
  if (reset && reset.data.slice(1, reset.length).some((x) => x === 1) && w.some((x) => (x & 4) !== 0)) lossy.add('phase reset macro after the first step (envelope restart)');
  const out: number[] = [loop, idx.length];
  for (const [f, t] of idx.entries()) {
    const tone = (toneShift + bend[f]) & 0xffff;
    const toneOn = (w[t] & 1) !== 0, noiseOn = (w[t] & 2) !== 0, envOn = (w[t] & 4) !== 0;
    const b0 = (envOn ? 0 : 0x01) | (noiseOn ? ((31 - n[t]) & 31) << 1 : 0);
    // ay.cpp outVol = vol * macro / 15; with no slide the PT3 channel volume does that product.
    const vt = slide ? Math.floor(((volAt(at(f)) >> 8) * Math.max(0, Math.min(15, v[t]))) / 15) : v[t];
    const b1 = (Math.max(0, Math.min(15, vt)) & 15) | (toneOn ? 0 : 0x10) | (noiseOn ? 0 : 0x80);
    out.push(b0, b1, tone & 0xff, tone >> 8);
  }
  // A silent tail that the loop stays inside plays the same as one silent looping frame (keeps the 16 KB module small).
  let k = idx.length;
  while (k > 0 && (out[2 + (k - 1) * 4 + 1] & 15) === 0) k--;
  if (k < idx.length - 1 && out[0] >= k) { out.length = 2 + (k + 1) * 4; out[0] = k; out[1] = k + 1; }
  return out;
}

/** Smallest period P (ticks) and first tick s with slide[t] === slide[t + P] for every t >= s, when the curve repeats at
 * least twice past s and is not constant there; null otherwise. */
function slidePeriod(slide: VolSlide): { start: number; ticks: number } | null {
  const len = slide.length;
  for (let P = 2; 2 * P <= len; P++) {
    let s = len - P;
    while (s > 0 && slide[s - 1] === slide[s - 1 + P]) s--;
    if (len - s >= 2 * P && new Set(slide.slice(s, s + P)).size > 1) return { start: s, ticks: P };
  }
  return null;
}

/** True when any sample step plays the hardware envelope (b0 bit 0 clear). */
const sampleUsesEnv = (b: number[]): boolean => b.slice(2).some((x, i) => i % 4 === 0 && (x & 1) === 0);

/** Furnace arp macro step: fixed note (bit 30 or 31 set, note = v ^ 0x40000000) or a signed relative offset. */
const arpFixed = (v: number): boolean => ((v & 0xc0000000) >>> 0) === 0x40000000 || ((v & 0xc0000000) >>> 0) === 0x80000000;

/** PT3 ornament from an arp macro. An all-fixed macro becomes offsets from its first fixed note, which the caller plays
 * as the cell note (Furnace ignores the cell note then). */
function ornamentBytes(mac: FurnaceMacro, lossy: Lossy, tickHz: number): { bytes: number[]; fixed: number | null } {
  const data = mac.data.slice(0, mac.length);
  const fixedSteps = data.filter(arpFixed).length;
  const base = fixedSteps === data.length && data.length > 0 ? (data[0] ^ 0x40000000) | 0 : null;
  if (fixedSteps > 0 && base === null) lossy.add('arp macro mixing fixed and relative steps (fixed steps played as 0)');
  const ticks = macroSpan(mac);
  const steps = expand(mac, ticks, 0).map((x) => (arpFixed(x) ? (base === null ? 0 : ((x ^ 0x40000000) | 0) - base) : x | 0));
  const { idx, loop } = frameTicks(ticks, macroLoop(mac), tickHz, lossy, 'arp macro');
  return { bytes: [loop, idx.length, ...idx.map((t) => Math.max(-96, Math.min(96, steps[t])) & 0xff)], fixed: base };
}

/** clock: the AY clock the module will play at (ZX 1773400; Vectrex 1500000 with the retuned tables of pt3Tables.ts). */
export function furnaceToPt3(m: FurnaceModule, subsong = 0, title = '', author = '', clock = ZX_CLOCK): Pt3Song {
  // Glissando commands break the row skip runs, so a song near the cap can only fit with slides dropped on some channels.
  // Per-note pitch-macro samples go first (fewer bent notes), then slides: a lost bend is one note, a lost slide a channel.
  const masks = [7, 3, 5, 6, 1, 2, 4, 0], bendCaps = [MAX_SAMPLES, 24, 16, 8, 0];
  let last: unknown;
  const fit = (mask: number, bendCap: number, room?: Room): Built | null => {
    try { return buildPt3(m, subsong, title, author, mask, clock, bendCap, room); } catch (e) {
      if (!(e instanceof Error) || !e.message.startsWith('The PT3 module is')) throw e;
      last = e;
      return null;
    }
  };
  for (const mask of masks) {
    for (const bendCap of bendCaps) {
      const base = fit(mask, bendCap);
      if (!base) continue;
      // Release tails only take the sample and ornament slots the song leaves free, and only while the module fits.
      let out = base.song;
      const orns = Math.max(0, MAX_ORNAMENTS + 1 - base.orns);
      for (let k = MAX_SAMPLES - base.samples; k > 0; k >>= 1) {
        const t = fit(mask, bendCap, { samples: k, orns });
        if (t) { out = t.song; break; }
      }
      if (mask !== 7) for (let ch = 0; ch < 3; ch++) if (!((mask >> ch) & 1)) out.lossy.push(`pitch slides on channel ${ch + 1} (dropped so the module fits 16 KB)`);
      return out;
    }
  }
  throw last;
}

/** Free sample and ornament slots a build may give to release tails. */
interface Room { samples: number; orns: number }
interface Built { song: Pt3Song; samples: number; orns: number }

function buildPt3(m: FurnaceModule, subsong: number, title: string, author: string, slideMask: number, clock: number, bendCap = MAX_SAMPLES, room: Room = { samples: 0, orns: 0 }): Built {
  const lossy = new Lossy();
  const s = m.subsongs[subsong];
  if (!s) throw new Error(`subsong ${subsong} missing`);
  if (m.systems[0] !== AY8910 && m.systems[0] !== AY8930) throw new Error(`first chip is system ${m.systems[0]}, not an AY`);
  if (m.systems[0] === AY8930) lossy.add('AY8930 enhanced mode (played as AY-3-8910)');
  for (const sys of m.systems.slice(1)) lossy.add(`second chip system ${sys} (channels dropped; one AY only)`);
  if (m.subsongs.length > 1) lossy.add('other subsongs (only one exported)');
  const baseHz = s.hz > 0 ? s.hz : FRAME_HZ;
  const tickHz = s.virtualTempo > 0 && s.virtualTempoD > 0 ? (baseHz * s.virtualTempo) / s.virtualTempoD : baseHz;
  const cellAt = (ch: number, o: number, r: number): FurnacePatternCell | undefined => m.patterns.get(`${subsong}_${ch}_${s.orders[ch]?.[o]}`)?.rows[r];

  const orderLen: number[] = [];
  let loopOrder = 0, endOrder = s.ordersLen;
  for (let o = 0; o < endOrder; o++) {
    let len = s.patLen;
    for (let r = 0; r < s.patLen && len === s.patLen; r++) {
      for (let ch = 0; ch < CHANNELS; ch++) {
        for (const e of cellAt(ch, o, r)?.effects ?? []) {
          if (e.type === 0x0d) len = r + 1;
          if (e.type === 0x0b) { len = r + 1; if (e.value <= o) { loopOrder = e.value; endOrder = o + 1; } }
        }
      }
    }
    orderLen.push(len);
  }

  // Samples and ornaments, deduplicated by content. Instruments keep their macros; samples are made per tone shift.
  const samples: number[][] = [], ornaments: number[][] = [[0, 1, 0]];
  const sampleKey = new Map<string, number>(), ornKey = new Map<string, number>([['0,1,0', 0]]);
  const addOrnament = (b: number[]): number => {
    const k = b.join(',');
    const hit = ornKey.get(k);
    if (hit !== undefined) return hit;
    if (ornaments.length > MAX_ORNAMENTS) { lossy.add(`ornaments past ${MAX_ORNAMENTS} (dropped)`); return 0; }
    ornaments.push(b); ornKey.set(k, ornaments.length - 1);
    return ornaments.length - 1;
  };
  interface Ins { macros: FurnaceMacro[]; orn: number; fixed: number | null }
  const insOf = (macros: FurnaceMacro[]): Ins => {
    const arp = macros.find((x) => x.code === MACRO_ARP && x.length > 0);
    const o = arp ? ornamentBytes(arp, lossy, tickHz) : null;
    return { macros, orn: o ? addOrnament(o.bytes) : 0, fixed: o?.fixed ?? null };
  };
  const insCache = new Map<number, Ins>(), tailCache = new Map<number, TailIns | 'cut' | null>();
  const instrument = (i: number): Ins => {
    const hit = insCache.get(i);
    if (hit) return hit;
    const e = insOf((m.instruments[i]?.macros ?? []).map((x) => sustain(x, lossy)));
    insCache.set(i, e);
    return e;
  };
  // semi: a constant arp tail moves the retriggered note instead of taking an ornament slot.
  interface TailIns extends Ins { semi: number }
  let tailSamples = 0, tailOrns = 0;
  /** The instrument's macros past note release; null when releasing changes nothing, 'cut' when its ornament has no free slot. */
  const releaseIns = (i: number): TailIns | 'cut' | null => {
    if (!tailCache.has(i)) {
      const t = releaseTail(m.instruments[i]?.macros ?? []);
      const arp = t?.find((x) => x.code === MACRO_ARP && x.length > 0);
      const steps = arp?.data.slice(0, arp.length) ?? [0];
      const semi = steps.every((x) => x === steps[0] && !arpFixed(x)) ? steps[0] | 0 : null;
      const o = arp && semi === null ? ornamentBytes(arp, lossy, tickHz) : null;
      const known = o ? ornKey.get(o.bytes.join(',')) : 0;
      // shortcut: a fixed-note arp tail is cut; upgrade when a song releases into one.
      const orn = o?.fixed != null ? -1 : known ?? (o && tailOrns < room.orns ? (tailOrns++, addOrnament(o.bytes)) : -1);
      tailCache.set(i, !t ? null : orn >= 0 ? { macros: t, orn, fixed: null, semi: semi ?? 0 } : 'cut');
    }
    return tailCache.get(i) ?? null;
  };
  // A pitch macro bends by a fraction of the note's period, so its samples are made per note (n: PT3 note played).
  // Past bendCap bent samples (or the sample limit) a bent note falls back to its unbent sample.
  let bent = 0;
  // cut (a release tail): 0 when the tail has no free sample slot.
  const sampleFor = (ins: Ins, shift: number, forceEnv: boolean, n: number, slide?: VolSlide, bend = true, cut = false): number => {
    const bends = bend && ins.macros.some((x) => x.code === MACRO_PITCH && x.length > 0);
    const base = bends ? pt3Period(tune, Math.max(0, Math.min(95, n)), clock) + shift : undefined;
    const b = sampleBytes(ins.macros, lossy, tickHz, shift, forceEnv && !ins.macros.some((x) => x.code === MACRO_WAVE && x.length > 0), base, linear, slide);
    const k = b.join(',');
    const hit = sampleKey.get(k);
    if (hit !== undefined) return hit;
    if (bends && (bent >= bendCap || samples.length >= MAX_SAMPLES)) {
      lossy.add('pitch macro on some notes (dropped so the module fits)');
      return sampleFor(ins, shift, forceEnv, n, slide, false, cut);
    }
    if (bends) bent++;
    if (cut && (tailSamples >= room.samples || samples.length >= MAX_SAMPLES)) return 0;
    if (cut) tailSamples++;
    if (samples.length >= MAX_SAMPLES) { lossy.add(`samples past ${MAX_SAMPLES} (sample ${MAX_SAMPLES} reused)`); return MAX_SAMPLES; }
    samples.push(b); sampleKey.set(k, samples.length);
    return samples.length;
  };

  // Effect 0xy (arpeggio, sticky until 000): steps 0,x,y of arpLen ticks each, resampled to 50 Hz frames.
  const arpLen = Math.max(1, s.arpLen || 1);
  const arpOrn = new Map<number, number>();
  const arpOrnament = (v: number): number => {
    const hit = arpOrn.get(v);
    if (hit !== undefined) return hit;
    const steps = [0, v >> 4, v & 15];
    const { idx, loop } = frameTicks(3 * arpLen, 0, tickHz, lossy, 'effect 00 arpeggio');
    const o = addOrnament([loop, idx.length, ...idx.map((t) => steps[Math.floor(t / arpLen)])]);
    arpOrn.set(v, o);
    return o;
  };

  // Tuning from the notes the song plays (fixed arp notes included).
  const used = new Set<number>();
  for (let o = 0; o < endOrder; o++) for (let r = 0; r < orderLen[o]; r++) for (let ch = 0; ch < CHANNELS; ch++) {
    const cell = cellAt(ch, o, r);
    const nv = cell ? convertFurnaceNoteValue(cell) : -1;
    if (nv >= 0 && nv < 253) used.add(nv);
  }
  const tune = pickTuning(m.tuning, [...used], clock);
  if (tune.cents > 35) lossy.add(`tone table off by up to ${Math.round(tune.cents)} cents (PT3 has four fixed tables, no fine tune)`);
  /** PT3 note and sample tone offset for Furnace note nv: past C-1..B-8 the edge note plays with the period difference. */
  const placeNote = (nv: number): { n: number; shift: number } => {
    const n = nv - tune.noteOffset;
    if (n >= 0 && n <= 95) return { n, shift: 0 };
    const edge = n < 0 ? 0 : 95;
    const want = Math.max(1, Math.min(4095, Math.round(clock / (16 * furnaceHz(m.tuning > 0 ? m.tuning : 440, nv)))));
    return { n: edge, shift: want - Math.round(pt3Period(tune, edge, clock)) };
  };

  // Rows: Furnace speeds cycle per row (groove); 09 sets speed 1, 0F speed 2. Each row's PT3 delay is the frame
  // difference of the accumulated tick time, so 60 Hz songs and odd speeds keep their timing within one frame.
  const speeds = s.speedPattern?.length ? [...s.speedPattern] : s.speed2 !== s.speed1 ? [s.speed1, s.speed2] : [s.speed1];
  let speedIdx = 0, ticksAt = 0, frames = 0, curDelay = -1, firstDelay = -1;
  const chan = [0, 1, 2].map(() => ({ ins: -1, arp: -1, shift: 0, outSample: -1, outOrn: -1, n: 0, env22: false, autoNum: 0, autoDen: 0, envOut: false,
    // Furnace slide: note (nv), pitch in 1/128 note, target, speed per tick (0 = none), E1/E2 (target becomes the note).
    fnv: -1, pos: 0, slTarget: 0, slSpeed: 0, slNote: false, slTargetNote: 0,
    // PT3 glissando: CrTnSl the player holds, last emitted "d,s" ('' = stopped), counter back at d on the next row start.
    cur: 0, gl: '', glPhase: false,
    // Furnace volume (<< 8) and 0Axy speed per tick; baked: the slide in the playing sample; outVol: PT3 channel volume.
    vol: VOL_TOP, volSpeed: 0, baked: undefined as VolSlide | undefined, bakeO: -1, bakeEnd: -1, outVol: 15,
    // on: a note sounds and is not released yet.
    on: false }));
  const flags = m.compatFlags ?? {};
  // linearPitch 1 before format 237 is the removed partial mode: only 04/E5 linear, slides move the AY period
  // (papers/format.md; ay.cpp NOTE_PORTA adds the speed to baseFreq, which is then the period).
  const lp = flags.linearPitch == null ? 2 : Number(flags.linearPitch);
  const linear = lp === 2 || (lp === 1 && m.version >= 237);
  const slideOn = (ch: number): boolean => ((slideMask >> ch) & 1) === 1;
  const slideMul = linear ? Number(flags.pitchSlideSpeed ?? 4) || 4 : 1;
  const tuneHz = m.tuning > 0 ? m.tuning : 440;
  // Slide position: 1/128 note (linear) or Furnace AY period (non-linear, so pitch up = smaller value).
  const toPos = (nv: number): number => (linear ? nv * 128 : FURNACE_AY_CLOCK / (16 * furnaceHz(tuneHz, nv)));
  const posHz = (pos: number): number => (linear ? furnaceHz(tuneHz, pos / 128) : FURNACE_AY_CLOCK / (16 * Math.max(1, pos)));
  const up = linear ? 1 : -1;
  // Hardware envelope: one generator per chip, shape (R13) and period are chip state in Furnace and in PT3.
  let envShape = 0, envPeriod = 0;
  const firstVal = (macros: FurnaceMacro[], code: number): number | null => {
    const mac = macros.find((x) => x.code === code && x.length > 0);
    return mac ? mac.data[0] : null;
  };
  /** PT3 envelope command bytes for a channel note: Furnace auto-envelope (ay.cpp: (freq * den / num) >> 4 on the played
   * tone period) or the fixed period, converted from the Furnace AY clock. */
  const envBytes = (st: (typeof chan)[number], macros: FurnaceMacro[], onNote = true, arpOff = 0): number[] => {
    const shapeM = onNote ? firstVal(macros, MACRO_ENV_SHAPE) : null;
    if (shapeM !== null) envShape = shapeM & 15;
    const numM = firstVal(macros, MACRO_AUTO_NUM), denM = firstVal(macros, MACRO_AUTO_DEN);
    const num = numM !== null || denM !== null ? (numM ?? 1) : st.autoNum, den = numM !== null || denM !== null ? (denM ?? 1) : st.autoDen;
    const fixedM = firstVal(macros, MACRO_ENV_PERIOD);
    let period: number;
    if (num > 0 && den > 0) {
      const tone = Math.max(0, Math.min(4095, Math.round(pt3Period(tune, Math.max(0, Math.min(95, st.n + arpOff)), clock)) + st.shift));
      period = Math.floor(Math.floor((tone * den) / num) / 16);
    } else period = Math.round(((fixedM ?? envPeriod) * clock) / FURNACE_AY_CLOCK);
    period = Math.max(0, Math.min(0xffff, period));
    // Shapes 0-3 play as 9 and 4-7 as 15 on the AY; PT3 has no 0x10 + 0 envelope byte.
    const shape = envShape < 4 ? 9 : envShape < 8 ? 15 : envShape;
    return [0x10 + shape, period >> 8, period & 0xff];
  };
  /** Furnace slide over this row's ticks -> PT3 glissando arguments (delay, step lo, step hi), or null for no command.
   * PT3 plays CrTnSl + s * floor(f / d) at frame f of the row (period units added to the note period); (d, s) is the
   * least-squares fit to the period Furnace plays at each frame, the next row's first frame included. */
  const glissando = (st: (typeof chan)[number], spd: number, n: number): number[] | null => {
    if (st.fnv < 0 || (st.slSpeed <= 0 && !st.gl)) return null;
    const posAt: number[] = [];
    let p = st.pos;
    for (let k = 0; k < spd; k++) {
      if (st.slSpeed > 0) {
        p = p < st.slTarget ? Math.min(st.slTarget, p + st.slSpeed) : Math.max(st.slTarget, p - st.slSpeed);
        if (p === st.slTarget) { st.slSpeed = 0; if (st.slNote) st.fnv = st.slTargetNote; }
      }
      posAt.push(p);
    }
    const moving = posAt.some((x) => x !== st.pos);
    st.pos = p;
    if (!moving) { const was = st.gl; st.gl = ''; return was ? [0, 0, 0] : null; }
    const t0 = ticksAt - spd, f0 = frames - n;
    // PT3 adds the slide in period units to the ornament-shifted tone: fit it at the step the ornament holds.
    const ob = ornaments[st.outOrn] ?? ornaments[0], held = (ob[2 + ob[0]] << 24) >> 24;
    const base = pt3Period(tune, Math.max(0, Math.min(95, st.n + held)), clock) + st.shift;
    const want = Array.from({ length: n + 1 }, (_, f) => {
      const k = Math.max(0, Math.min(spd - 1, Math.floor(((f0 + f + 0.5) * tickHz) / FRAME_HZ) - t0));
      return clock / (16 * posHz(posAt[k]) * 2 ** (held / 12)) - base - st.cur;
    });
    const b0 = base + st.cur;
    const worstCents = (d: number, s: number): number => Math.max(...want.map((w, f) => Math.abs(1200 * Math.log2(Math.max(1, b0 + s * Math.floor(f / d)) / Math.max(1, b0 + w)))));
    // Keep the running command when it still fits: one fewer 4-byte command per row (the module has one 16 KB bank).
    if (st.gl && st.glPhase) {
      const [pd, ps] = st.gl.split(',').map(Number);
      if (worstCents(pd, ps) <= GLISS_REUSE_CENTS) { st.cur += ps * Math.floor(n / pd); st.glPhase = n % pd === 0; return null; }
    }
    let best = { err: Infinity, d: 1, s: 0 };
    for (let d = 1; d <= n; d++) {
      let num = 0, den = 0;
      want.forEach((w, f) => { const q = Math.floor(f / d); num += q * w; den += q * q; });
      const s = den ? Math.max(-32768, Math.min(32767, Math.round(num / den))) : 0;
      const err = want.reduce((a, w, f) => a + (s * Math.floor(f / d) - w) ** 2, 0);
      if (err < best.err - 1e-9) best = { err, d, s };
    }
    const { d, s } = best;
    st.cur += s * Math.floor(n / d);
    st.gl = `${d},${s}`; st.glPhase = n % d === 0;
    return [d, s & 0xff, (s >> 8) & 0xff];
  };
  /** Furnace channel volume per tick from the note at (o, r) to the next note or note off in that pattern; rows past the
   *  pattern end keep the slide running. end: last row looked at. shortcut: speed changes during the note are not seen. */
  const volumeCurve = (ch: number, o: number, r: number, vol: number, speed: number): { curve: number[]; end: number; slid: boolean } => {
    const curve: number[] = [], maxT = Math.ceil((MAX_TICKS * tickHz) / FRAME_HZ) + 1;
    let end = r, slid = false;
    for (let rr = r, k = 0; curve.length < maxT; rr++, k++) {
      if (rr > r && rr < orderLen[o]) {
        const c = cellAt(ch, o, rr);
        if (c && convertFurnaceNoteValue(c) >= 0) break;
        if (c?.volume !== undefined && c.volume >= 0) vol = Math.min(15, c.volume) << 8;
        for (const e of c?.effects ?? []) if (e.type === 0x0a) speed = volSlideSpeed(e.value);
        end = rr;
      }
      for (let t = 0, spd = speeds[(speedIdx - 1 + k) % speeds.length]; t < spd; t++) {
        if (speed !== 0) { slid = true; vol += speed; if (vol <= 0 || vol >= VOL_TOP) { vol = Math.max(0, Math.min(VOL_TOP, vol)); speed = 0; } }
        curve.push(vol);
      }
    }
    return { curve, end, slid };
  };
  const channelsWithNotes = [false, false, false];
  const patternBytes: number[][][] = []; // [order][channel]
  for (let o = 0; o < endOrder; o++) {
    const rows: Array<{ ops: number[]; note: number; args: number[] }[]> = [[], [], []];
    for (let r = 0; r < orderLen[o]; r++) {
      for (let ch = 0; ch < CHANNELS; ch++) for (const e of cellAt(ch, o, r)?.effects ?? []) {
        if (e.type === 0x09 && e.value > 0) speeds[0] = e.value;
        if (e.type === 0x0f && e.value > 0) { if (speeds.length < 2) speeds.push(speeds[0]); speeds[1] = e.value; }
      }
      const spd = speeds[speedIdx % speeds.length];
      speedIdx++;
      ticksAt += spd;
      // Round half down: a tick at exactly the half-frame belongs to the frame whose midpoint it reaches (same convention as frameTicks).
      let delay = Math.ceil((ticksAt * FRAME_HZ) / tickHz - 0.5 - 1e-9) - frames;
      if (delay < 1) { lossy.add('row shorter than one 50 Hz frame (lengthened)'); delay = 1; }
      if (delay > 255) { lossy.add('row longer than 255 frames (cut)'); delay = 255; }
      frames += delay;
      if (firstDelay < 0) firstDelay = curDelay = delay;
      for (let ch = 0; ch < CHANNELS; ch++) {
        const cell = cellAt(ch, o, r);
        const ops: number[] = [], args: number[] = [];
        let note = 0xd0;
        const st = chan[ch];
        // Each pattern sets its channel volume afresh: identical Furnace patterns then pack to the same PT3 bytes (shared),
        // and the song loop jumps in from the end, where the volume is whatever the last rows left.
        if (r === 0) st.outVol = -1;
        if (cell) {
          if (cell.instrument >= 0) st.ins = cell.instrument;
          for (const e of cell.effects) {
            if (e.type === 0x00) st.arp = e.value > 0 ? arpOrnament(e.value) : -1;
            if (e.type === 0x22) { envShape = e.value >> 4; st.env22 = (e.value & 15) !== 0; }
            if (e.type === 0x29) { st.autoNum = e.value >> 4; st.autoDen = e.value & 15; }
            if (e.type === 0x23) envPeriod = (envPeriod & 0xff00) | e.value;
            if (e.type === 0x24) envPeriod = (envPeriod & 0xff) | (e.value << 8);
          }
          if (cell.volume >= 0) st.vol = Math.min(15, cell.volume) << 8;
          for (const e of cell.effects) if (e.type === 0x0a) st.volSpeed = volSlideSpeed(e.value);
          let nv = convertFurnaceNoteValue(cell);
          const prevPos = st.fnv >= 0 ? st.pos : -1;
          // Release (254/255) runs the macros past their release point (ay.cpp std.release(); the note keeps sounding).
          // PT3 has no release: the note is retriggered with a sample of the macro tails. Note off (253) cuts.
          let tail = (nv === 254 || nv === 255) && st.on ? releaseIns(st.ins) : null;
          if (tail === 'cut') { lossy.add('macro release tail (no free PT3 ornament; note cut)'); tail = null; nv = 253; }
          if (nv >= 253) st.on = false;
          // shortcut: the retrigger restarts a running 0A fade from the last set volume; upgrade if songs fade through a release.
          if (tail) { note = 0x50 + Math.max(0, Math.min(95, st.n + tail.semi)); st.cur = 0; st.gl = ''; }
          else if (nv === 253) note = 0xc0;
          else if (nv >= 0 && nv < 253) {
            st.on = true;
            channelsWithNotes[ch] = true;
            if (st.ins < 0) st.ins = 0;
            const fixed = instrument(st.ins).fixed;
            if (fixed !== null) nv = fixed;
            const p = placeNote(nv);
            if (p.shift !== 0) lossy.add('note outside PT3 C-1..B-8 (edge note with sample tone offset)');
            st.shift = p.shift;
            st.n = p.n;
            note = 0x50 + p.n;
            // A PT3 note byte zeroes CrTnSl and the slide counter.
            st.fnv = nv; st.pos = toPos(nv); st.cur = 0; st.gl = '';
          }
          const isNote = note >= 0x50 && note < 0xc0;
          // A note whose volume moves before the next note (0A, or cell volumes re-hitting a fade) bakes that curve into its
          // sample at channel volume 15. shortcut: the look-ahead stops at the pattern end; later changes are held.
          if (isNote) {
            const f = volumeCurve(ch, o, r, st.vol, st.volSpeed);
            // Cell volumes alone stay PT3 channel volume ops: a bake only when 0A moves the volume.
            st.baked = f.slid ? f.curve : undefined;
            st.bakeO = o; st.bakeEnd = f.end;
          } else if (st.baked && (o !== st.bakeO || r > st.bakeEnd) && (cell.volume >= 0 || cell.effects.some((e) => e.type === 0x0a))) lossy.add('volume or 0A change after the pattern end of a fading note (held)');
          const wantVol = st.baked ? 15 : st.vol >> 8;
          if (wantVol !== st.outVol && (isNote || (cell.volume >= 0 && !st.baked))) { ops.push(0xc0 | wantVol); st.outVol = wantVol; }
          if (note === 0xc0) st.slSpeed = 0; // shortcut: note off ends the slide (Furnace only with noteOffResetsSlides)
          if (slideOn(ch) && st.fnv >= 0) for (const e of cell.effects) {
            if (e.type === 0xe1 || e.type === 0xe2) {
              const y = e.value & 15;
              st.slSpeed = y ? (e.value >> 4) * 4 * slideMul : 0;
              st.slTargetNote = st.fnv + (e.type === 0xe1 ? y : -y); st.slTarget = toPos(st.slTargetNote); st.slNote = true;
            }
            if (e.type === 0x01 || e.type === 0x02) {
              // shortcut: Furnace stops 01/02 at note 179/0 (limitSlides 156); the AY period clamp ends them first here.
              st.slSpeed = e.value * slideMul; st.slTarget = (e.type === 0x01 ? up : -up) * 1e9; st.slNote = false;
            }
            // 03 shares the slide state (playback.cpp): it replaces a running 01/02 and bends from the old pitch to
            // the row note. shortcut: PT3 still retriggers the sample on the note byte, so 03 stays in the lossy list.
            if (e.type === 0x03) {
              if (e.value === 0) st.slSpeed = 0;
              else {
                if (nv >= 0 && prevPos >= 0) st.pos = prevPos;
                st.slSpeed = e.value * slideMul; st.slTargetNote = st.fnv; st.slTarget = toPos(st.fnv); st.slNote = true;
              }
            }
          }
          if (st.ins >= 0 && (note !== 0xd0 || cell.instrument >= 0)) {
            const ins = tail ?? instrument(st.ins);
            const sample = sampleFor(ins, st.shift, st.env22, st.n, st.baked, true, tail !== null);
            const orn = st.arp >= 0 ? st.arp : ins.orn;
            if (sample === 0) { lossy.add('macro release tail (no free PT3 sample; note cut)'); note = 0xc0; }
            else if (sampleUsesEnv(samples[sample - 1] ?? [])) {
              // shortcut: PT3 retriggers R13 on every envelope command; Furnace only when the shape value changes.
              // Repeating shapes (8, 10, 12, 14) can differ in phase per note; exact only with a player that sets the period alone.
              // The envelope period is set once per note: it follows the step the ornament ends on (held), exact when the
              // ornament settles on one step (a sustained arp macro), lossy when it keeps cycling.
              const ob = ornaments[orn], tail = ob.slice(2 + ob[0]), held = (tail[0] << 24) >> 24;
              if (tail.some((x) => x !== tail[0]) && (ins.macros.some((x) => (x.code === MACRO_AUTO_NUM || x.code === MACRO_AUTO_DEN) && x.length > 0) || st.autoNum > 0)) lossy.add('auto-envelope with arpeggio (period follows the row note only)');
              ops.unshift(...envBytes(st, ins.macros, true, held), sample * 2, ...(orn !== st.outOrn ? [0x40 | orn] : []));
              st.outSample = sample; st.outOrn = orn; st.envOut = true;
            } else if (note === 0xd0 && st.envOut && cell.effects.some((e) => [0x22, 0x23, 0x24, 0x29].includes(e.type))) {
              // Envelope effect without a note: 0xB2..0xBF sets shape 1..14 and the period, keeping the sample.
              const ob = ornaments[orn], eb = envBytes(st, ins.macros, false, (ob[2 + ob[0]] << 24) >> 24);
              if (eb[0] - 0x10 <= 14) ops.push(0xb1 + eb[0] - 0x10, eb[1], eb[2]);
              else lossy.add('envelope shape 15 set without a note (PT3 0xB2..0xBF reaches 1..14)');
            } else if (sample !== st.outSample || orn !== st.outOrn || st.envOut) {
              ops.unshift(0xf0 | orn, sample * 2); st.outSample = sample; st.outOrn = orn; st.envOut = false;
            }
          }
          for (const e of cell.effects) {
            if (e.type < 0 || [0x00, 0x09, 0x0f, 0x0b, 0x0d, 0x22, 0x23, 0x24, 0x29].includes(e.type)) continue;
            if (e.type === 0x0a && (isNote || e.value <= 0 || (st.baked && o === st.bakeO && r <= st.bakeEnd))) continue;
            if (slideOn(ch) && [0x01, 0x02, 0xe1, 0xe2].includes(e.type)) continue;
            lossy.add(`effect ${e.type.toString(16).toUpperCase().padStart(2, '0')}`);
          }
        }
        for (let k = 0; k < spd && st.volSpeed !== 0; k++) {
          st.vol += st.volSpeed;
          if (st.vol <= 0 || st.vol >= VOL_TOP) { st.vol = Math.max(0, Math.min(VOL_TOP, st.vol)); st.volSpeed = 0; }
        }
        const gl = slideOn(ch) ? glissando(chan[ch], spd, delay) : null;
        if (gl) { ops.push(0x01); args.push(...gl); }
        // The player runs the special commands last-pushed first, so the last op's arguments come first.
        if (ch === 0 && delay !== curDelay) { curDelay = delay; ops.push(0x09); args.unshift(delay); }
        rows[ch].push({ ops, note, args });
      }
    }
    patternBytes.push(rows.map((chRows) => {
      const out: number[] = [];
      let skip = -1;
      for (let i = 0; i < chRows.length;) {
        let j = i + 1;
        while (j < chRows.length && chRows[j].ops.length === 0 && chRows[j].note === 0xd0) j++;
        const want = j - i;
        if (want !== skip) { out.push(0xb1, want); skip = want; }
        out.push(...chRows[i].ops, chRows[i].note, ...chRows[i].args);
        i = j;
      }
      out.push(0);
      return out;
    }));
  }

  // Module layout.
  const patKey = new Map<string, number>();
  const patList: number[][][] = [];
  const positions: number[] = [];
  for (const p of patternBytes) {
    const k = p.map((c) => c.join(',')).join('|');
    if (!patKey.has(k)) { patKey.set(k, patList.length); patList.push(p); }
    positions.push(patKey.get(k)! * 3);
  }
  const posAt = 201, patTab = posAt + positions.length + 1;
  const blobs: number[][] = [...samples, ...ornaments];
  const body: number[] = [];
  const blobPtr: number[] = [];
  let at = patTab + patList.length * 6;
  for (const b of blobs) { blobPtr.push(at); body.push(...b); at += b.length; }
  const patPtr: number[][] = patList.map((p) => p.map((c) => { const a = at; body.push(...c); at += c.length; return a; }));
  const mod = new Uint8Array(at);
  const put = (o: number, text: string, len: number): void => { for (let i = 0; i < len; i++) mod[o + i] = text.charCodeAt(i) || 0x20; };
  put(0, `ProTracker 3.${tune.version} compilation of`, 30);
  put(30, title.replace(/[^\x20-\x7E]/g, '?'), 32);
  put(62, ' by ', 4);
  put(66, author.replace(/[^\x20-\x7E]/g, '?'), 32);
  mod[99] = tune.table; mod[100] = Math.max(1, firstDelay); mod[101] = positions.length + 1;
  mod[102] = Math.min(loopOrder, positions.length - 1);
  const w = (o: number, v: number): void => { mod[o] = v & 0xff; mod[o + 1] = v >> 8; };
  w(103, patTab);
  const nS = samples.length;
  for (let i = 0; i < 32; i++) w(105 + i * 2, i >= 1 && i <= nS ? blobPtr[i - 1] : blobPtr[0] ?? posAt);
  for (let i = 0; i < 16; i++) w(169 + i * 2, i < ornaments.length ? blobPtr[nS + i] : blobPtr[nS]);
  positions.forEach((p, i) => { mod[posAt + i] = p; });
  mod[posAt + positions.length] = 0xff;
  patPtr.forEach((p, i) => p.forEach((a, c) => w(patTab + i * 6 + c * 2, a)));
  mod.set(body, patTab + patList.length * 6);
  if (mod.length > MODULE_CAP) throw new Error(`The PT3 module is ${mod.length} bytes; one 16 KB bank holds ${MODULE_CAP}. Shorten the song.`);
  if (!channelsWithNotes.some(Boolean)) lossy.add('no notes in the first three channels');
  return { song: { module: mod, lossy: lossy.list(), channelsWithNotes, frames }, samples: samples.length, orns: ornaments.length };
}

export interface Pt3Player { bytes: Uint8Array; loadAddress: number; entry: number; dataAddress: number; bankOffset: number }

/** BASIC loader, player code block at 32768, the module in bank 0 at 49152 (CLEAR 32767; LOAD ""CODE; OUT 32765; RANDOMIZE USR). */
export function buildZxPt3Tap(module: Uint8Array, player: Pt3Player, title = 'devilbox'): Uint8Array {
  const code = Uint8Array.from(player.bytes);
  code[player.bankOffset] = 0x10;
  const name = title.replace(/[^\x20-\x7E]/g, '?').slice(0, 10);
  const loader = basicLoader([0], player, [...PT3_CREDIT, ...(title ? [title.slice(0, 32)] : [])]);
  const parts = [
    tapBlock(0x00, header(0, name, loader.length, 10, loader.length)), tapBlock(0xFF, loader),
    ...codeBlocks('player', player.loadAddress, code),
    ...codeBlocks('song', player.dataAddress, module),
  ];
  const tap = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { tap.set(p, o); o += p.length; }
  return tap;
}

export { MODULE_BASE };

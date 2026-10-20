/**
 * The Up Rough whole-song mix stage, ported sample-for-sample from tools/hiphop.py (the render_section tail and
 * _apply_texture): bus balance, bus make-up, the sample echo send, the scratch duck and the master texture.
 * Reused, not rewritten: delay, reverb, mixerColor, vintageCharacter, addVinylSurface, paulaFilter (busEffects),
 * hp and npSum (refDsp). Constants mirrored from hiphop.py are emitted by gen_song_mix.py and asserted by the test.
 */
import { pexp } from '@/engine/dj/scratch/portableMath';
import { hp, npSum } from '@/engine/dj/scratch/refDsp';
import {
  addVinylSurface, delay, masterBus, mixerColor, paulaFilter, reverb, vintageCharacter, type SamplerReverbKind,
} from '@/engine/uprough/effects/busEffects';

type Signal = ArrayLike<number>;

// ── constants (hiphop.py) ───────────────────────────────────────────────────

export const MIX_GAINS: Readonly<Record<'drums' | 'bass' | 'sample_ducked' | 'sample_solo' | 'melody' | 'vocal' | 'scratch_on' | 'scratch_off', number>> = {
  drums: 1.211, bass: 1.272, sample_ducked: 0.63, sample_solo: 0.75, melody: 0.62, vocal: 0.503, scratch_on: 0.65, scratch_off: 0.50,
};
export const BUS_REFERENCE_RMS = 0.12;
export const BUS_REFERENCE_PEAK = 0.8;
export const SAMPLE_ECHO: Readonly<{ send: number; fb: number }> = { send: 0.12, fb: 0.22 };

/** The styles' `tape` and `vinyl` amounts (hiphop.STYLES), the only fields _apply_texture reads. */
export const STYLE_TEXTURE: Readonly<Record<string, { tape: number; vinyl: number }>> = {
  old_school: { tape: 0.2, vinyl: 0.35 }, golden_era: { tape: 0.3, vinyl: 0.45 }, boom_bap: { tape: 0.35, vinyl: 0.5 },
  east_coast: { tape: 0.35, vinyl: 0.55 }, jazz_rap: { tape: 0.25, vinyl: 0.3 }, abstract: { tape: 0.3, vinyl: 0.4 },
  instrumental: { tape: 0.25, vinyl: 0.4 }, alternative: { tape: 0.2, vinyl: 0.25 }, lofi: { tape: 0.6, vinyl: 0.5 },
  g_funk: { tape: 0.1, vinyl: 0.15 }, southern: { tape: 0.18, vinyl: 0.15 }, dirty_south: { tape: 0.2, vinyl: 0.2 },
  crunk: { tape: 0.16, vinyl: 0.14 }, trap: { tape: 0.16, vinyl: 0.15 }, drill: { tape: 0.15, vinyl: 0.14 },
  memphis: { tape: 0.45, vinyl: 0.35 }, miami_bass: { tape: 0.15, vinyl: 0.12 }, electro_hiphop: { tape: 0.15, vinyl: 0.15 },
  industrial: { tape: 0.15, vinyl: 0.2 },
};

// ── levels ──────────────────────────────────────────────────────────────────

/** np.mean(x ** 2) with numpy's pairwise sum. */
function meanSquare(x: Signal, start = 0, n: number = x.length - start): number {
  const sq = new Float64Array(n);
  for (let i = 0; i < n; i++) sq[i] = x[start + i]! * x[start + i]!;
  return npSum(sq, 0, n) / n;
}

/** hiphop._bus_rms. */
export function busRms(x: Signal): number {
  return Math.sqrt(meanSquare(x)) + 1e-12;
}

/** hiphop._active_rms: RMS over the 10 ms frames within `floorDb` of the loudest frame. */
export function activeRms(x: Signal, rate: number, floorDb = -40.0, frameSec = 0.01): number {
  const w = Math.max(1, Math.trunc(frameSec * rate));
  const n = Math.floor(x.length / w);
  if (n < 1) return busRms(x);
  const fr = new Float64Array(n);
  for (let k = 0; k < n; k++) fr[k] = meanSquare(x, k * w, w);
  let top = fr[0]!;
  for (let k = 1; k < n; k++) if (fr[k]! > top) top = fr[k]!;
  if (top <= 1e-18) return 1e-12;
  const thr = top * pexp(floorDb / 10.0 * 2.302585092994046);
  const kept: number[] = [];
  for (let k = 0; k < n; k++) if (fr[k]! >= thr) kept.push(fr[k]!);
  return Math.sqrt(npSum(kept, 0, kept.length) / kept.length);
}

/** hiphop.bus_makeup: restore a bus to `preRms`, capped, with the peak held under 0.98. */
export function busMakeup(buf: Signal, preRms: number, cap: number): Float64Array {
  const post = busRms(buf);
  if (post <= 0.0) return Float64Array.from(buf);
  let gain = Math.min(preRms / post, cap);
  let peak = 0;
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]!));
  if (peak > 0.0) gain = Math.min(gain, 0.98 / peak);
  const out = new Float64Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i]! * gain;
  return out;
}

// ── bus balance ─────────────────────────────────────────────────────────────

/** The drum headroom trim: cap the peak at BUS_REFERENCE_PEAK before drum_bus. `trim` is 1 when nothing was cut. */
export function trimDrumsToPeak(drums: Signal): { buf: Float64Array; trim: number } {
  let pk = 0;
  for (let i = 0; i < drums.length; i++) pk = Math.max(pk, Math.abs(drums[i]!));
  const trim = pk > BUS_REFERENCE_PEAK ? BUS_REFERENCE_PEAK / pk : 1.0;
  const buf = new Float64Array(drums.length);
  for (let i = 0; i < drums.length; i++) buf[i] = trim === 1.0 ? drums[i]! : drums[i]! * trim;
  return { buf, trim };
}

/** Undo the trim after drum_bus (`drums_buf / _drum_trim`). */
export function restoreDrumTrim(drums: Signal, trim: number): Float64Array {
  const out = Float64Array.from(drums);
  if (trim !== 1.0) for (let i = 0; i < out.length; i++) out[i] = out[i]! / trim;
  return out;
}

export interface LaneBuses {
  drums: Float64Array; bass: Float64Array; sample: Float64Array; melody: Float64Array; vocal: Float64Array;
  /** Follows the sample bus's factor; null when the section has none. */
  reinforce: Float64Array | null;
}
export interface BalanceOptions { bassGain: number; hasDrums: boolean }

/** hiphop.bus_gain_span: the loudest MIX_GAINS entry among the balanced buses. */
export function busGainSpan(bassGain: number, hasDrums: boolean): number {
  const sampleG = hasDrums ? MIX_GAINS.sample_ducked : MIX_GAINS.sample_solo;
  return Math.max(MIX_GAINS.drums, bassGain, sampleG, MIX_GAINS.melody, MIX_GAINS.vocal) || 1.0;
}

/** The RMS bus balance of render_section: each bus to BUS_REFERENCE_RMS * gain / span. Returns new buffers. */
export function balanceBuses(b: LaneBuses, o: BalanceOptions): LaneBuses {
  const sampleG = o.hasDrums ? MIX_GAINS.sample_ducked : MIX_GAINS.sample_solo;
  const span = busGainSpan(o.bassGain, o.hasDrums);
  const scale = (buf: Float64Array, g: number): { buf: Float64Array; f: number } => {
    const r = Math.sqrt(meanSquare(buf));
    if (!(r > 1e-9)) return { buf: Float64Array.from(buf), f: 1.0 };
    const f = (BUS_REFERENCE_RMS * g / span) / r;
    const out = new Float64Array(buf.length);
    for (let i = 0; i < buf.length; i++) out[i] = buf[i]! * f;
    return { buf: out, f };
  };
  const drums = scale(b.drums, MIX_GAINS.drums);
  const bass = scale(b.bass, o.bassGain);
  const sample = scale(b.sample, sampleG);
  const melody = scale(b.melody, MIX_GAINS.melody);
  const vocal = scale(b.vocal, MIX_GAINS.vocal);
  let reinforce: Float64Array | null = null;
  if (b.reinforce) {
    reinforce = new Float64Array(b.reinforce.length);
    // Python scales the rider only when the sample bus was loud enough to be scaled (f stays 1.0 otherwise).
    for (let i = 0; i < reinforce.length; i++) reinforce[i] = sample.f === 1.0 ? b.reinforce[i]! : b.reinforce[i]! * sample.f;
  }
  return { drums: drums.buf, bass: bass.buf, sample: sample.buf, melody: melody.buf, vocal: vocal.buf, reinforce };
}

// ── sends and ducking ───────────────────────────────────────────────────────

/** render_section `_echo`: add a tape delay of `delaySec` at gain `g`, length-matched to the dry buffer. */
export function echo(buf: Signal, rate: number, delaySec: number, fb: number, g: number, damp = 0.4): Float64Array {
  const wet = delay(buf, rate, { kind: 'tape', delaySec, fb, mix: 1.0, damp });
  const out = Float64Array.from(buf);
  const m = Math.min(out.length, wet.length);
  for (let i = 0; i < m; i++) out[i] = out[i]! + g * wet[i]!;
  return out;
}

/** np.linspace(a, b, n) for the endpoint-inclusive case: a + i * step, with the last element exactly b. */
function linspace(a: number, b: number, n: number): Float64Array {
  const out = new Float64Array(n);
  if (n === 1) { out[0] = a; return out; }
  const step = (b - a) / (n - 1);
  for (let i = 0; i < n; i++) out[i] = a + i * step;
  out[n - 1] = b;
  return out;
}

/** hiphop.duck_under_voice: floor the scratch in the bars the voice occupies, with a short fade at each edge. */
export function duckUnderVoice(
  scr: Signal, voiceBars: Iterable<number>, barLen: number, rate: number, floor = 0.12, fadeSec = 0.020,
): Float64Array {
  const bars = [...voiceBars];
  const n = scr.length;
  if (!n || !bars.length || barLen <= 0) return Float64Array.from(scr);
  const duck = new Float64Array(n).fill(1.0);
  const fade = Math.max(1, Math.trunc(rate * fadeSec));
  for (const vb of bars) {
    const a = Math.trunc(vb) * barLen;
    if (a >= n) continue;
    const b = Math.min(n, a + barLen);
    duck.fill(floor, a, b);
    const i0 = Math.max(0, a - fade);
    if (a > i0) duck.set(linspace(1.0, floor, a - i0), i0);
    const j0 = Math.min(n, b + fade);
    if (j0 > b) duck.set(linspace(floor, 1.0, j0 - b), b);
  }
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = scr[i]! * duck[i]!;
  return out;
}

// ── master texture ──────────────────────────────────────────────────────────

export interface TextureOptions {
  style: string; seed: number;
  /** DIRT[style].master_rev / master_rev_mix: the maker's overrides (null = tape-derived). */
  masterRev: SamplerReverbKind | null; masterRevMix: number | null;
}
export const TEXTURE_DEFAULTS: Readonly<Omit<TextureOptions, 'style'>> = { seed: 0, masterRev: null, masterRevMix: null };

/** The Paula model _apply_texture picks. */
export function textureModel(style: string, tape: number): 'a500' | 'a1200' {
  return tape >= 0.4 || style === 'lofi' || style === 'memphis' || style === 'dirty_south' ? 'a500' : 'a1200';
}

/** hiphop._apply_texture: mixer colour, dark master room, tape wow, vinyl surface, 0.35 dry + 0.65 Paula. */
export function applyTexture(track: Signal, rate: number, options: Pick<TextureOptions, 'style'> & Partial<TextureOptions>): Float64Array {
  const o = { ...TEXTURE_DEFAULTS, ...options };
  const st = STYLE_TEXTURE[o.style];
  if (!st) throw new Error(`applyTexture: unknown style ${o.style}`);
  let y: Float64Array = mixerColor(track, rate, { drive: 0.06 + 0.03 * st.tape, hfRolloff: 6800 - 1500 * st.tape });
  let wetKind: SamplerReverbKind = st.tape > 0.25 ? 'dark_room' : 'small_room';
  let roomMix = 0.11 + 0.13 * st.tape;
  if (o.masterRev) wetKind = o.masterRev;
  if (o.masterRevMix !== null) roomMix = o.masterRevMix;
  const room = reverb(hp(y, 180, rate), rate, { kind: wetKind, mix: 1.0, seed: o.seed + 3 });
  const withRoom = Float64Array.from(y);
  for (let i = 0; i < withRoom.length; i++) withRoom[i] = y[i]! + roomMix * room[i]!;
  y = withRoom;
  if (st.tape > 0.3) y = vintageCharacter(y, rate, { tapeAge: 0.2 * st.tape, seed: o.seed + 1 });
  y = addVinylSurface(y, rate, { amount: st.vinyl, seed: o.seed + 5 });
  const paula = paulaFilter(y, rate, { model: textureModel(o.style, st.tape) });
  const out = Float64Array.from(y);
  const n = Math.min(out.length, paula.length);
  for (let i = 0; i < n; i++) out[i] = 0.35 * out[i]! + 0.65 * paula[i]!;
  return out;
}

// ── section and track mix ───────────────────────────────────────────────────

export interface ScratchLane {
  /** The scratch bus after its own chain (macros, echo, reverb): those lane processors are not ported yet. */
  buf: Float64Array;
  /** The style's use_scratch flag: picks MIX_GAINS.scratch_on / scratch_off. */
  useScratch: boolean;
  /** Bars the voice occupies (duck_under_voice). */
  voiceBars: Iterable<number>;
  barLen: number;
}
export interface MixSectionOptions {
  /** The section length in samples (render_section's L); the lane buffers carry L + tail. */
  length: number; bassGain: number; hasDrums: boolean; rate: number;
  scratch?: ScratchLane | null;
}

/**
 * The render_section tail: RMS bus balance (HIPHOP_BUS_BALANCE), `sec = (drums + bass + sample + melody + vocal +
 * reinforce)[:L]` in Python's left-to-right order, then the scratch bus scaled by active RMS, ducked under the voice
 * and added. Lane buffers must already carry their per-lane chains; they are not modified.
 */
export function mixSection(lanes: LaneBuses, o: MixSectionOptions): Float64Array {
  return sumBalanced(balanceBuses(lanes, { bassGain: o.bassGain, hasDrums: o.hasDrums }), o);
}

/** mixSection after balanceBuses: the lane sum and the scratch bus. Split out so a caller can own the balance call. */
export function sumBalanced(b: LaneBuses, o: MixSectionOptions): Float64Array {
  const sec = new Float64Array(o.length);
  for (let i = 0; i < o.length; i++) {
    sec[i] = b.drums[i]! + b.bass[i]! + b.sample[i]! + b.melody[i]! + b.vocal[i]! + (b.reinforce ? b.reinforce[i]! : 0);
  }
  const s = o.scratch;
  if (s && s.buf.length) {
    const g = s.useScratch ? MIX_GAINS.scratch_on : MIX_GAINS.scratch_off;
    const k = (BUS_REFERENCE_RMS * g / busGainSpan(o.bassGain, o.hasDrums)) / activeRms(s.buf, o.rate);
    const scaled = new Float64Array(s.buf.length);
    for (let i = 0; i < scaled.length; i++) scaled[i] = s.buf[i]! * k;
    const scr = duckUnderVoice(scaled, s.voiceBars, s.barLen, o.rate);
    const n = Math.min(sec.length, scr.length);
    for (let i = 0; i < n; i++) sec[i] = sec[i]! + 1.0 * scr[i]!;
  }
  return sec;
}

/** The non-empty sections laid end to end. */
export function joinSections(sections: readonly Signal[]): Float64Array {
  const parts = sections.filter((p) => p.length);
  const total = parts.reduce((a, p) => a + p.length, 0);
  const track = new Float64Array(total);
  let at = 0;
  for (const p of parts) { for (let i = 0; i < p.length; i++) track[at + i] = p[i]!; at += p.length; }
  return track;
}

/** render_track's tail: concatenate the (non-empty) sections, _apply_texture, master_bus, int8 / 127. */
export function mixTrack(
  sections: readonly Signal[], rate: number, options: Pick<TextureOptions, 'style'> & Partial<TextureOptions>,
): Float64Array {
  const track = joinSections(sections);
  const textured = applyTexture(track, rate, options);
  const master = masterBus(textured, {}, rate);
  return Float64Array.from(master, (v) => v / 127.0);
}

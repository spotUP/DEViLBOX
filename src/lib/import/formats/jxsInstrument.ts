/**
 * jxsInstrument.ts - read and write one JayTrax (.jxs) instrument inside the module bytes.
 *
 * The module bytes are the single source of truth: the editor reads them and writes them, there is no shadow
 * config. Layout (little endian) is the loader walk of jxs-wasm/src/jxs_engine.cpp open_song:
 *   52 byte header, S subsongs x 16564, P patterns x 320, P pattern names (s32 length + bytes),
 *   I instruments x 8712 each followed by its sample (s16 frames, byte length = s32 at +516) when the s32 at +512 is set,
 *   then the 256 byte arpeggio table (16 tables of 16 signed semitone steps, shared by every instrument).
 *
 * Offsets inside an instrument block (verified against open_song's "take the song" loop):
 *   name 2..33 (NUL padded), wave 34, wavelen 36, volume 38, volwave 40, volspeed 42, volloop 44, finetune 46,
 *   pitchwave 48, pitchspeed 50, pitchloop 52, pitchdelay 54, arp 56, resetwave[16] u8 58, panwave 74, panspeed 76,
 *   panloop 78 (all s16), slot k at 92 + 40k: dest src1 src2 osc var1 var2 speed oscspeed type (s32 each),
 *   oscflag s8 +36, reset s8 +37; sharing 494, loops 496, bidi 498 (s16), start 500, loop 504, end 508 (s32; version 3457 only),
 *   16 waves x 256 s16 at 520.
 */
const HEADER = 52;
export const JXS_SUBSONG_BYTES = 16564;
const SUBSONG = JXS_SUBSONG_BYTES;
const INSTRUMENT = 8712;
const PATTERN = 320;

export const JXS_WAVES = 16;
export const JXS_WAVE_LENGTH = 256;
export const JXS_SLOTS = 4;
export const JXS_ARP_TABLES = 16;
export const JXS_ARP_STEPS = 16;

const u16 = (b: Uint8Array, o: number): number => b[o] | (b[o + 1] << 8);
const s16 = (b: Uint8Array, o: number): number => (u16(b, o) << 16) >> 16;
const s32 = (b: Uint8Array, o: number): number => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) | 0;
const put16 = (b: Uint8Array, o: number, v: number): void => { b[o] = v & 255; b[o + 1] = (v >> 8) & 255; };
const put32 = (b: Uint8Array, o: number, v: number): void => {
  b[o] = v & 255; b[o + 1] = (v >> 8) & 255; b[o + 2] = (v >> 16) & 255; b[o + 3] = (v >>> 24) & 255;
};

export interface JxsLayout {
  version: number;
  patterns: number;
  subsongs: number;
  instruments: number;
  subsongOffset: number;
  patternOffset: number;
  /** Byte offset of each instrument record. */
  instrumentOffset: number[];
  /** Sample byte length of each instrument, or -1 when it carries none. */
  sampleBytes: number[];
  arpeggioOffset: number;
}

/** The one walk of the file. Null when the bytes are not a whole JayTrax module. */
export function jxsLayout(bytes: Uint8Array): JxsLayout | null {
  if (bytes.length < HEADER) return null;
  const version = u16(bytes, 0);
  if (version !== 3456 && version !== 3457) return null;
  const P = s32(bytes, 4), S = s32(bytes, 8), I = s32(bytes, 12);
  if (S < 1 || S > 256 || P < 0 || P > 65536 || I < 0 || I > 4096) return null;
  let off = HEADER;
  const subsongOffset = off;
  off += S * SUBSONG;
  const patternOffset = off;
  off += P * PATTERN;
  if (off > bytes.length) return null;
  for (let p = 0; p < P; p++) {
    if (off + 4 > bytes.length) return null;
    const n = s32(bytes, off);
    if (n < 0 || n > 4096) return null;
    off += 4 + n;
    if (off > bytes.length) return null;
  }
  const instrumentOffset: number[] = [];
  const sampleBytes: number[] = [];
  for (let i = 0; i < I; i++) {
    if (off + INSTRUMENT > bytes.length) return null;
    instrumentOffset.push(off);
    const has = s32(bytes, off + 512) !== 0;
    const len = s32(bytes, off + 516);
    off += INSTRUMENT;
    if (has) {
      if (len < 0 || off + len > bytes.length) return null;
      sampleBytes.push(len);
      off += len;
    } else {
      sampleBytes.push(-1);
    }
  }
  if (off + 256 > bytes.length) return null;
  return {
    version, patterns: P, subsongs: S, instruments: I, subsongOffset, patternOffset,
    instrumentOffset, sampleBytes, arpeggioOffset: off,
  };
}

export interface JxsSlot {
  dest: number; src1: number; src2: number; osc: number; var1: number; var2: number;
  speed: number; oscspeed: number; type: number;
  /** s8: 0 the oscillator drives the first parameter, non-zero the second. */
  oscflag: number;
  /** s8: non-zero clears the slot's running state at every note. */
  reset: number;
}

/** Slot fields in file order: key, offset inside the slot, byte size (signed). */
const SLOT_FIELDS: ReadonlyArray<readonly [keyof JxsSlot, number, 1 | 4]> = [
  ['dest', 0, 4], ['src1', 4, 4], ['src2', 8, 4], ['osc', 12, 4], ['var1', 16, 4], ['var2', 20, 4],
  ['speed', 24, 4], ['oscspeed', 28, 4], ['type', 32, 4], ['oscflag', 36, 1], ['reset', 37, 1],
];

export interface JxsScalars {
  wave: number; wavelen: number; volume: number; volwave: number; volspeed: number; volloop: number;
  finetune: number; pitchwave: number; pitchspeed: number; pitchloop: number; pitchdelay: number; arp: number;
  panwave: number; panspeed: number; panloop: number;
  sharing: number; loops: number; bidi: number; start: number; loop: number; end: number;
}

/** Scalar fields: key, offset, byte size. Sample fields (sharing and later) exist only in version 3457 files. */
const SCALARS: ReadonlyArray<readonly [keyof JxsScalars, number, 2 | 4]> = [
  ['wave', 34, 2], ['wavelen', 36, 2], ['volume', 38, 2], ['volwave', 40, 2], ['volspeed', 42, 2], ['volloop', 44, 2],
  ['finetune', 46, 2], ['pitchwave', 48, 2], ['pitchspeed', 50, 2], ['pitchloop', 52, 2], ['pitchdelay', 54, 2],
  ['arp', 56, 2], ['panwave', 74, 2], ['panspeed', 76, 2], ['panloop', 78, 2],
  ['sharing', 494, 2], ['loops', 496, 2], ['bidi', 498, 2], ['start', 500, 4], ['loop', 504, 4], ['end', 508, 4],
];
const SAMPLE_ONLY = new Set<keyof JxsScalars>(['sharing', 'loops', 'bidi', 'start', 'loop', 'end']);

export interface JxsInstrument extends JxsScalars {
  name: string;
  /** 16 flags: the wave is restored from the file at every note. */
  resetwave: number[];
  slots: JxsSlot[];
  /** 16 x 256 s16, the waves as stored. */
  waves: Int16Array;
  version: number;
  /** Frames of the sample this instrument carries (0 without one). */
  sampleFrames: number;
}

export function readJxsInstrument(bytes: Uint8Array, index: number): JxsInstrument | null {
  const lay = jxsLayout(bytes);
  if (!lay || index < 0 || index >= lay.instruments) return null;
  const q = lay.instrumentOffset[index];
  let name = '';
  for (let k = 0; k < 32 && bytes[q + 2 + k]; k++) name += String.fromCharCode(bytes[q + 2 + k]);
  const sampled = lay.version === 3457;
  const out = { name, version: lay.version } as JxsInstrument;
  for (const [key, off, size] of SCALARS) {
    if (SAMPLE_ONLY.has(key) && !sampled) { out[key] = 0; continue; }
    out[key] = size === 2 ? s16(bytes, q + off) : s32(bytes, q + off);
  }
  out.resetwave = Array.from(bytes.subarray(q + 58, q + 74));
  out.slots = [];
  for (let k = 0; k < JXS_SLOTS; k++) {
    const sl = {} as JxsSlot;
    for (const [key, off, size] of SLOT_FIELDS) {
      const at = q + 92 + 40 * k + off;
      sl[key] = size === 4 ? s32(bytes, at) : (bytes[at] << 24) >> 24;
    }
    out.slots.push(sl);
  }
  out.waves = new Int16Array(JXS_WAVES * JXS_WAVE_LENGTH);
  for (let k = 0; k < out.waves.length; k++) out.waves[k] = s16(bytes, q + 520 + 2 * k);
  out.sampleFrames = lay.sampleBytes[index] >= 0 ? lay.sampleBytes[index] >> 1 : 0;
  return out;
}

/** The sample an instrument plays (its own, or the one it shares), or null. */
export function readJxsSample(bytes: Uint8Array, index: number): Int16Array | null {
  const lay = jxsLayout(bytes);
  if (!lay || index < 0 || index >= lay.instruments) return null;
  const sharing = lay.version === 3457 ? s16(bytes, lay.instrumentOffset[index] + 494) : 0;
  const src = sharing > 0 && sharing <= lay.instruments ? sharing - 1 : index;
  if (lay.sampleBytes[src] < 0) return null;
  const frames = lay.sampleBytes[src] >> 1;
  const base = lay.instrumentOffset[src] + INSTRUMENT;
  const out = new Int16Array(frames);
  for (let k = 0; k < frames; k++) out[k] = s16(bytes, base + 2 * k);
  return out;
}

export function readJxsArpeggio(bytes: Uint8Array): number[] | null {
  const lay = jxsLayout(bytes);
  if (!lay) return null;
  const out: number[] = [];
  for (let k = 0; k < 256; k++) out.push((bytes[lay.arpeggioOffset + k] << 24) >> 24);
  return out;
}

/** What an edit may change. Sparse maps are keyed by slot, wave or arpeggio position. */
export interface JxsEdit extends Partial<JxsScalars> {
  name?: string;
  slots?: Record<number, Partial<JxsSlot>>;
  resetwave?: Record<number, number>;
  /** Whole waves (256 values each) by wave number. */
  waves?: Record<number, ArrayLike<number>>;
  /** Single values of the shared arpeggio table by position 0..255 (signed semitones). */
  arpeggio?: Record<number, number>;
}

/**
 * A copy of `bytes` with the edit applied; the same array when nothing changes. Every byte outside the edited
 * fields is carried, so an unedited module exports byte-identical.
 */
export function writeJxsInstrument(bytes: Uint8Array, index: number, edit: JxsEdit): Uint8Array {
  const lay = jxsLayout(bytes);
  if (!lay || (index < 0 || index >= lay.instruments) && edit.arpeggio === undefined) return bytes;
  const out = bytes.slice();
  const sampled = lay.version === 3457;
  if (index >= 0 && index < lay.instruments) {
    const q = lay.instrumentOffset[index];
    for (const [key, off, size] of SCALARS) {
      const v = edit[key];
      if (v === undefined || (SAMPLE_ONLY.has(key) && !sampled)) continue;
      if (size === 2) put16(out, q + off, v); else put32(out, q + off, v);
    }
    if (edit.name !== undefined) {
      for (let k = 0; k < 32; k++) out[q + 2 + k] = k < edit.name.length ? edit.name.charCodeAt(k) & 127 : 0;
    }
    if (edit.resetwave) for (const [w, v] of Object.entries(edit.resetwave)) out[q + 58 + Number(w)] = v ? 1 : 0;
    if (edit.slots) {
      for (const [k, patch] of Object.entries(edit.slots)) {
        for (const [key, off, size] of SLOT_FIELDS) {
          const v = patch[key];
          if (v === undefined) continue;
          const at = q + 92 + 40 * Number(k) + off;
          if (size === 4) put32(out, at, v); else out[at] = v & 255;
        }
      }
    }
    if (edit.waves) {
      for (const [w, data] of Object.entries(edit.waves)) {
        for (let k = 0; k < JXS_WAVE_LENGTH; k++) put16(out, q + 520 + 2 * (Number(w) * JXS_WAVE_LENGTH + k), data[k] ?? 0);
      }
    }
  }
  if (edit.arpeggio) for (const [k, v] of Object.entries(edit.arpeggio)) out[lay.arpeggioOffset + Number(k)] = v & 255;
  for (let k = 0; k < out.length; k++) if (out[k] !== bytes[k]) return out;
  return bytes;
}

/** Slot parameters an effect type can read. */
export type JxsSlotParam = 'dest' | 'src1' | 'src2' | 'osc' | 'oscspeed' | 'oscflag' | 'var1' | 'var2' | 'speed';

export interface JxsEffectType {
  type: number;
  name: string;
  /** Parameters the type reads in jxs_engine.cpp effects(); the editor shows only these. */
  params: readonly JxsSlotParam[];
  /** Short plain description for the tooltip. */
  help: string;
  /** The type keeps running state across ticks, so the slot Reset flag matters. */
  stateful: boolean;
}

const OSC: readonly JxsSlotParam[] = ['osc', 'oscspeed', 'oscflag'];

/** Effect types 1..17 as effects() in the engine runs them (type 0 = slot off). */
export const JXS_EFFECT_TYPES: readonly JxsEffectType[] = [
  { type: 1, name: 'Negate', params: ['dest', 'speed'], help: 'Inverts the wave progressively', stateful: true },
  { type: 2, name: 'Ramp', params: ['dest', 'speed'], help: 'Adds a rising slope to the wave', stateful: false },
  { type: 3, name: 'Smooth', params: ['dest', 'src1', 'speed'], help: 'Averages neighbouring samples, speed times (max 12)', stateful: false },
  { type: 4, name: 'Scrolling Mix', params: ['dest', 'src1', 'src2', 'speed'], help: 'Scrolls the second wave through the first', stateful: true },
  { type: 5, name: 'Resonator', params: ['dest', 'src1', 'var1', 'var2', ...OSC], help: 'Resonant band around a centre; the oscillator moves the centre or width', stateful: true },
  { type: 6, name: 'Whistle', params: ['dest', 'src1', 'var1', 'var2', ...OSC], help: 'Whistling resonance; the oscillator moves the centre or width', stateful: true },
  { type: 7, name: 'Crossfade', params: ['dest', 'src1', 'src2', 'var1', ...OSC], help: 'Blends two waves by a fixed amount or the oscillator', stateful: false },
  { type: 8, name: 'Sine Crossfade', params: ['dest', 'src1', 'src2', 'var1', ...OSC], help: 'Blends two waves along a sine; var1 is the start phase', stateful: false },
  { type: 9, name: 'Wavefold', params: ['dest', 'src1', 'var1', ...OSC], help: 'Folds the wave back on itself', stateful: false },
  { type: 10, name: 'Rotate', params: ['dest'], help: 'Rotates the wave by one sample per tick', stateful: false },
  { type: 11, name: 'Decimate', params: ['dest', 'var1'], help: 'Holds every var1-th sample (stretches the wave)', stateful: true },
  { type: 12, name: 'Amplify', params: ['dest', 'src1', 'var1', ...OSC], help: 'Gain with hard clipping', stateful: false },
  { type: 13, name: 'Low Pass Filter', params: ['dest', 'src1', 'var1', 'var2', ...OSC], help: 'Cutoff var1, resonance var2; the oscillator drives either', stateful: true },
  { type: 14, name: 'High Pass Filter', params: ['dest', 'src1', 'var1', 'var2', ...OSC], help: 'Cutoff var1, resonance var2; the oscillator drives either', stateful: true },
  { type: 15, name: 'Band Pass Filter', params: ['dest', 'src1', 'var1', 'var2', ...OSC], help: 'Cutoff var1, resonance var2; the oscillator drives either', stateful: true },
  { type: 16, name: 'Noise', params: ['dest'], help: 'Fills the wave with noise', stateful: false },
  { type: 17, name: 'Resample', params: ['dest', 'src1', 'var1', 'var2', ...OSC], help: 'Reads the source at step var1 + 256 x var2; the oscillator drives one', stateful: false },
];

/** Value ranges the engine accepts (open_song validation). min/max inclusive. */
export const JXS_RANGES: Record<keyof JxsScalars, readonly [number, number]> = {
  wave: [0, 15], wavelen: [1, 16], volume: [0, 256], volwave: [0, 16], volspeed: [0, 255], volloop: [0, 255],
  finetune: [0, 15], pitchwave: [0, 16], pitchspeed: [0, 255], pitchloop: [0, 255], pitchdelay: [0, 255], arp: [0, 15],
  panwave: [0, 16], panspeed: [0, 255], panloop: [0, 255],
  sharing: [0, 4096], loops: [0, 1], bidi: [0, 1], start: [0, 0x7fffffff], loop: [0, 0x7fffffff], end: [0, 0x7fffffff],
};

/**
 * The values an envelope reads as the engine steps it (wave_step in jxs_engine.cpp): the position moves by
 * `speed` per tick; past 255 it wraps to `loop` (or to `loop` itself when the wrap still overshoots).
 * Starts at position 0, as a note start does.
 */
export function jxsEnvelopeCurve(wave: ArrayLike<number>, speed: number, loop: number, steps: number): number[] {
  const out: number[] = [];
  let pos = 0;
  for (let k = 0; k < steps; k++) {
    out.push(wave[pos & 255]);
    pos += speed;
    if (pos >= 256) {
      pos = pos - 256 + loop;
      if (pos >= 256) pos = loop;
    }
    pos &= 255;
  }
  return out;
}

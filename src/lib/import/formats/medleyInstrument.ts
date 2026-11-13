/**
 * medleyInstrument.ts - every field of a Medley (.mso) instrument record the replayer reads, by byte offset.
 *
 * Source: third-party/nuade/players/medley/mdl_module.c (MdlInstrumentField / MdlModulatorField / MdlWaveField and
 * the readers mdl_instrument / mdl_wave) and medley.c (mdl_envelope, mdl_modulator_step). The record is the target of
 * the instrument table entry (medleyEntry). The replayer copies a record at each Instrument command and at voice init,
 * so a byte written here is heard from the next instrument command (or after the module is handed to the engine again).
 *
 * Pure codec: reads and writes the module bytes, owns no state. The bytes are the single source of truth.
 */
import { medleyTables, medleyEntry } from './medleyGrid';

export const MEDLEY_INSTRUMENT_FIELD = {
  type: 0x10, window: 0x11, phase: 0x12, transpose: 0x13, wave: 0x14, tone: 0x1c,
  maxLevel: 0x28, sustainLevel: 0x2a, attack: 0x2c, decay: 0x2e, release: 0x30, modulators: 0x32,
} as const;
export const MEDLEY_MODULATOR_FIELD = {
  kind: 0x00, gate: 0x01, freeRunning: 0x02, oneShot: 0x03, invert: 0x05, delay: 0x06,
  topStart: 0x07, halfStart: 0x08, level: 0x0c, rise: 0x0e, fall: 0x10,
} as const;
export const MEDLEY_WAVE_FIELD = { length: 0x10, octave: 0x14, secondHalf: 0x16, data: 0x18 } as const;
export const MEDLEY_MODULATOR_SIZE = 0x12;
export const MEDLEY_MODULATORS = 4;
export const MEDLEY_REGIONS = 8;
/** mdl_region_start: region r covers the notes from this value up. */
export const MEDLEY_REGION_START = [0x00, 0x1a, 0x26, 0x32, 0x3e, 0x4a, 0x56, 0x62] as const;

export interface MedleyModulator {
  kind: number; gate: boolean; freeRunning: boolean; oneShot: boolean; invert: boolean; delay: number;
  /** 0 off, else the voice flag (1 = voices 1-2, 2 = voices 2-3) on which the modulator starts falling at its level. */
  topStart: number;
  /** 0 off, else the voice flag on which the modulator starts at half its level. */
  halfStart: number;
  level: number; rise: number; fall: number;
}

export interface MedleyInstrument {
  number: number; offset: number; name: string;
  type: number; window: number; phase: number; transpose: number;
  /** Wave number per note region; 0 = the wave of the region below (mdl_region_wave). */
  waves: number[];
  /** High nibble = step of the first read, low nibble = step of the second (0 reads as 0x10). */
  tone: number;
  maxLevel: number; sustainLevel: number; attack: number; decay: number; release: number;
  modulators: MedleyModulator[];
}

export interface MedleyWave { number: number; offset: number; name: string; length: number; octave: number; secondHalf: boolean }

const u16 = (b: Uint8Array, o: number): number => (b[o] << 8) | b[o + 1];
const s8 = (v: number): number => (v & 0x80 ? v - 0x100 : v);
const name16 = (b: Uint8Array, o: number): string => {
  let s = '';
  for (let i = 0; i < 16 && b[o + i]; i++) s += String.fromCharCode(b[o + i]);
  return s.trim();
};

/** File offset of instrument `n`'s record, or 0 when the table has none (or the record runs past the file). */
export function medleyInstrumentOffset(buf: Uint8Array, n: number): number {
  const tables = medleyTables(buf);
  if (!tables) return 0;
  const rec = medleyEntry(buf, tables.instrument, n);
  const end = MEDLEY_INSTRUMENT_FIELD.modulators + MEDLEY_MODULATORS * MEDLEY_MODULATOR_SIZE;
  return rec && rec + end <= buf.length ? rec : 0;
}

export function readMedleyInstrument(buf: Uint8Array, n: number): MedleyInstrument | null {
  const rec = medleyInstrumentOffset(buf, n);
  if (!rec) return null;
  const F = MEDLEY_INSTRUMENT_FIELD;
  const M = MEDLEY_MODULATOR_FIELD;
  const modulators: MedleyModulator[] = [];
  for (let i = 0; i < MEDLEY_MODULATORS; i++) {
    const m = rec + F.modulators + i * MEDLEY_MODULATOR_SIZE;
    modulators.push({
      kind: buf[m + M.kind], gate: buf[m + M.gate] !== 0, freeRunning: buf[m + M.freeRunning] !== 0,
      oneShot: buf[m + M.oneShot] !== 0, invert: buf[m + M.invert] !== 0, delay: buf[m + M.delay],
      topStart: buf[m + M.topStart], halfStart: buf[m + M.halfStart],
      level: u16(buf, m + M.level), rise: u16(buf, m + M.rise), fall: u16(buf, m + M.fall),
    });
  }
  return {
    number: n, offset: rec, name: name16(buf, rec),
    type: buf[rec + F.type], window: buf[rec + F.window], phase: buf[rec + F.phase], transpose: s8(buf[rec + F.transpose]),
    waves: Array.from(buf.subarray(rec + F.wave, rec + F.wave + MEDLEY_REGIONS)),
    tone: buf[rec + F.tone],
    maxLevel: u16(buf, rec + F.maxLevel), sustainLevel: u16(buf, rec + F.sustainLevel), attack: u16(buf, rec + F.attack),
    decay: u16(buf, rec + F.decay), release: u16(buf, rec + F.release),
    modulators,
  };
}

/** Every filled entry of the wave table (name = the record's first 16 bytes, as the instrument record). */
export function medleyWaveList(buf: Uint8Array): MedleyWave[] {
  const tables = medleyTables(buf);
  if (!tables) return [];
  const out: MedleyWave[] = [];
  for (let n = 0; n <= buf[tables.wave - 1]; n++) {
    const w = medleyEntry(buf, tables.wave, n);
    if (!w || w + MEDLEY_WAVE_FIELD.data > buf.length) continue;
    out.push({
      number: n, offset: w, name: name16(buf, w), length: u16(buf, w + MEDLEY_WAVE_FIELD.length),
      octave: buf[w + MEDLEY_WAVE_FIELD.octave], secondHalf: buf[w + MEDLEY_WAVE_FIELD.secondHalf] !== 0,
    });
  }
  return out;
}

/** The signed 8-bit points of a wave (length bytes from record + 0x18). */
export function medleyWaveData(buf: Uint8Array, wave: MedleyWave): Int8Array {
  const start = wave.offset + MEDLEY_WAVE_FIELD.data;
  const end = Math.min(buf.length, start + wave.length);
  return new Int8Array(buf.buffer, buf.byteOffset + start, Math.max(0, end - start));
}

/** A field write: absolute file offset, width and value. */
export type MedleyWrite = { offset: number; size: 1 | 2; value: number };

export type MedleyInstrumentScalar = 'type' | 'window' | 'phase' | 'transpose' | 'tone'
  | 'maxLevel' | 'sustainLevel' | 'attack' | 'decay' | 'release';
const WORD_FIELDS = new Set<MedleyInstrumentScalar>(['maxLevel', 'sustainLevel', 'attack', 'decay', 'release']);
export type MedleyModulatorKey = keyof MedleyModulator;
const MOD_WORD = new Set<MedleyModulatorKey>(['level', 'rise', 'fall']);

export function medleyInstrumentWrite(rec: number, field: MedleyInstrumentScalar, value: number): MedleyWrite {
  return { offset: rec + MEDLEY_INSTRUMENT_FIELD[field], size: WORD_FIELDS.has(field) ? 2 : 1, value };
}
export function medleyWaveRegionWrite(rec: number, region: number, wave: number): MedleyWrite {
  return { offset: rec + MEDLEY_INSTRUMENT_FIELD.wave + region, size: 1, value: wave };
}
export function medleyModulatorWrite(rec: number, index: number, field: MedleyModulatorKey, value: number | boolean): MedleyWrite {
  const v = typeof value === 'boolean' ? (value ? 1 : 0) : value;
  const offset = rec + MEDLEY_INSTRUMENT_FIELD.modulators + index * MEDLEY_MODULATOR_SIZE + MEDLEY_MODULATOR_FIELD[field];
  return { offset, size: MOD_WORD.has(field) ? 2 : 1, value: v };
}
export function medleyWaveFieldWrite(wave: MedleyWave, field: 'octave' | 'secondHalf', value: number | boolean): MedleyWrite {
  return { offset: wave.offset + MEDLEY_WAVE_FIELD[field], size: 1, value: typeof value === 'boolean' ? (value ? 1 : 0) : value };
}

/** Store a write into the bytes (big-endian words, values clamped to the field width). True when a byte changed. */
export function applyMedleyWrite(buf: Uint8Array, w: MedleyWrite): boolean {
  if (w.offset < 0 || w.offset + w.size > buf.length) return false;
  if (w.size === 2) {
    const v = Math.max(0, Math.min(0xffff, Math.round(w.value)));
    const changed = buf[w.offset] !== v >> 8 || buf[w.offset + 1] !== (v & 0xff);
    buf[w.offset] = v >> 8; buf[w.offset + 1] = v & 0xff;
    return changed;
  }
  const v = Math.round(w.value) & 0xff;
  const changed = buf[w.offset] !== v;
  buf[w.offset] = v;
  return changed;
}

// ── Replayer curves (for drawing; same arithmetic as medley.c) ──────────────────────────────────────────────────

/** mdl_envelope per tick: key down for `holdTicks` (attack to max, decay to sustain), then key up (release). 0-65535. */
export function medleyEnvelopeCurve(ins: Pick<MedleyInstrument, 'maxLevel' | 'sustainLevel' | 'attack' | 'decay' | 'release'>, holdTicks: number, limit = 1500): number[] {
  const out: number[] = [];
  let level = 0;
  let decaying = false;
  for (let t = 0; t < limit; t++) {
    if (t >= holdTicks) {
      level = level < ins.release ? 0 : level - ins.release;
    } else if (decaying) {
      level = level < ins.decay ? ins.sustainLevel : level - ins.decay;
      if (level < ins.sustainLevel) level = ins.sustainLevel;
    } else {
      const sum = level + ins.attack;
      if (sum > 0xffff || sum >= ins.maxLevel) { level = ins.maxLevel; decaying = true; } else level = sum;
    }
    out.push(level);
    if (t >= holdTicks && level === 0) break;
  }
  return out;
}

/**
 * mdl_modulator_start + mdl_modulator_step + the gate/invert output of mdl_modulators, per tick from note start.
 * `voiceFlagHolds`: whether the top/half start voice flag names the voice drawn (the editor draws voice 1 of 1-2).
 */
export function medleyModulatorCurve(m: MedleyModulator, ticks: number, voiceFlagHolds = true): number[] {
  const out: number[] = [];
  let delay = m.delay;
  let falling = false;
  let value = 0;
  if (m.topStart !== 0 && voiceFlagHolds) { falling = true; value = m.level; }
  if ((m.kind === 1 && m.delay !== 0) || (m.halfStart !== 0 && voiceFlagHolds)) value = m.level >> 1;
  for (let t = 0; t < ticks; t++) {
    if (delay !== 0) delay--;
    else if (!falling) {
      const sum = value + m.rise;
      if (sum > 0xffff || sum >= m.level) { value = m.level; falling = true; } else value = sum;
    } else if (value > m.fall) value -= m.fall;
    else { value = 0; if (!m.oneShot) falling = false; }
    let o = m.gate ? (falling ? m.level : 0) : value;
    if (m.invert) o = (m.level - o) & 0xffff;
    out.push(o);
  }
  return out;
}

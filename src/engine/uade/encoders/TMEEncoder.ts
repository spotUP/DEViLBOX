/**
 * TMEEncoder - the 6-byte step of The Musical Enlightenment from a grid cell.
 *
 * A step is [note, instrument, list, volume, flags, param] (musicalenlightenment.c step_from). The grid shows the note,
 * instrument (with the track's instrument transpose, done by the parser), effect 1 (slide / portamento / arpeggio from
 * flags + param), effect 2 (0C = the signed volume byte added to the instrument's volume); the six bytes also ride in the
 * invisible `period` carrier (byte i * 256^i), so an unedited cell encodes byte-exact. encodeTmeCell writes only the note
 * byte; instrument and effect bytes depend on the position, so TMEParser's effectPatches writes them via tmeFieldPatches. The note byte's top
 * bit (tie: no retrigger) is kept; 0x7E (release) and 0x7F (stop) show as note 97.
 */
import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

export const TME_STEP_SIZE = 6;
const RELEASE = 0x7e;
const STOP = 0x7f;
/** Note byte 1 = period index 0 = 856 = ProTracker C-1 = grid note 13 (periodNotes.ts: 428 = C-2). */
const NOTE_BIAS = 12;
const NOTE_OFF = 97;

export function tmePack(b: ArrayLike<number>): number {
  let v = 0;
  for (let i = TME_STEP_SIZE - 1; i >= 0; i--) v = v * 256 + (b[i] & 0xff);
  return v;
}

export function tmeUnpack(v: number): Uint8Array {
  const out = new Uint8Array(TME_STEP_SIZE);
  for (let i = 0; i < TME_STEP_SIZE; i++) { out[i] = v % 256; v = Math.floor(v / 256); }
  return out;
}

/** The note a step byte stores (before the position's transpose): 0 none, 97 release/stop. */
export function tmeStoredNote(noteByte: number): number {
  const n = noteByte & 0x7f;
  if (n === 0) return 0;
  if (n === RELEASE || n === STOP) return NOTE_OFF;
  return n + NOTE_BIAS;
}

const F_ARP = 0x01, F_SLIDE = 0x02, F_PORTA = 0x10;
const SLIDE_BITS = F_ARP | F_SLIDE | F_PORTA;
const EFF_PORTA = 0x03, EFF_SLIDE_UP = 0x01, EFF_SLIDE_DOWN = 0x02, EFF_VOLUME = 0x0c;

/** Effect 1 of flags + param: portamento 3xx (param = ticks - 1), slide (the byte is added to the period: positive is down), arpeggio 0xx (record number). */
function effectOf(flags: number, param: number): { effTyp: number; eff: number } {
  if (flags & F_PORTA) return { effTyp: EFF_PORTA, eff: param };
  if (flags & F_SLIDE) { const s = (param << 24) >> 24; return s < 0 ? { effTyp: EFF_SLIDE_UP, eff: -s } : { effTyp: EFF_SLIDE_DOWN, eff: s }; }
  if (flags & F_ARP) return { effTyp: 0, eff: param };
  return { effTyp: 0, eff: 0 };
}

export function decodeTmeCell(bytes: Uint8Array): TrackerCell {
  const e = effectOf(bytes[4], bytes[5]);
  return {
    note: tmeStoredNote(bytes[0]), instrument: bytes[1], volume: 0, ...e,
    effTyp2: bytes[3] ? EFF_VOLUME : 0, eff2: bytes[3],
    period: tmePack(bytes),
  } as TrackerCell;
}

/**
 * The byte patches (index into the step -> value) an edited cell's effects make, against the step's current bytes:
 * effect 1 sets the slide / portamento / arpeggio flag bits and the param, effect 2 = 0C sets the volume byte; a
 * field equal to what the bytes already show is left alone. `rawInstrument` is the step byte for the cell's instrument.
 */
export function tmeFieldPatches(bytes: Uint8Array, cell: TrackerCell, rawInstrument: number): Map<number, number> {
  const out = new Map<number, number>();
  if (rawInstrument !== bytes[1]) out.set(1, rawInstrument & 0xff);
  const cur = effectOf(bytes[4], bytes[5]);
  const t = cell.effTyp ?? 0, e = cell.eff ?? 0;
  if (t !== cur.effTyp || e !== cur.eff) {
    let flags = bytes[4] & ~SLIDE_BITS, param = 0;
    if (t === EFF_PORTA) { flags |= F_PORTA; param = e; }
    else if (t === EFF_SLIDE_DOWN) { flags |= F_SLIDE; param = e & 0x7f; }
    else if (t === EFF_SLIDE_UP) { flags |= F_SLIDE; param = -e & 0xff; }
    else if (t === 0 && e !== 0) { flags |= F_ARP; param = e; }
    out.set(4, flags); out.set(5, param);
  }
  const vol = (cell.effTyp2 ?? 0) === EFF_VOLUME ? (cell.eff2 ?? 0) : 0;
  if (vol !== bytes[3]) out.set(3, vol);
  return out;
}

export function encodeTmeCell(cell: TrackerCell): Uint8Array {
  const out = cell.period !== undefined ? tmeUnpack(cell.period) : new Uint8Array(TME_STEP_SIZE);
  const note = cell.note ?? 0;
  if (note !== tmeStoredNote(out[0])) {
    const tie = out[0] & 0x80;
    out[0] = note === 0 ? 0 : note === NOTE_OFF ? ((out[0] & 0x7f) === STOP ? STOP : RELEASE) : ((note - NOTE_BIAS) & 0x7f) | tie;
  }
  return out;
}

registerPatternEncoder('tme', () => encodeTmeCell);

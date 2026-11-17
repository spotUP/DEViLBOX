/**
 * TMEEncoder - the 6-byte step of The Musical Enlightenment from a grid cell.
 *
 * A step is [note, instrument, list, volume, flags, param] (musicalenlightenment.c step_from). The grid shows the note
 * and instrument; the other bytes ride in the invisible `period` carrier (the six bytes as one number, byte i * 256^i),
 * so an unedited cell encodes byte-exact. An edited note or instrument overwrites only its own byte. The note byte's top
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

export function decodeTmeCell(bytes: Uint8Array): TrackerCell {
  return {
    note: tmeStoredNote(bytes[0]), instrument: bytes[1], volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
    period: tmePack(bytes),
  } as TrackerCell;
}

export function encodeTmeCell(cell: TrackerCell): Uint8Array {
  const out = cell.period !== undefined ? tmeUnpack(cell.period) : new Uint8Array(TME_STEP_SIZE);
  const note = cell.note ?? 0;
  if (note !== tmeStoredNote(out[0])) {
    const tie = out[0] & 0x80;
    out[0] = note === 0 ? 0 : note === NOTE_OFF ? ((out[0] & 0x7f) === STOP ? STOP : RELEASE) : ((note - NOTE_BIAS) & 0x7f) | tie;
  }
  if ((cell.instrument ?? 0) !== out[1]) out[1] = (cell.instrument ?? 0) & 0xff;
  return out;
}

registerPatternEncoder('tme', () => encodeTmeCell);

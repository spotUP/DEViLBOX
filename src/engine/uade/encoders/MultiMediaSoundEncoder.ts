/**
 * MultiMediaSoundEncoder - the 4-byte cell of MultiMedia Sound (Christian Haller / Christian A. Weber) from a grid cell.
 *
 * Layout (MultiMedia Sound.AMP2.asm CONVERTNOTE): word 0 is the period, or negative for a special command (stop, break ...);
 * byte 0 bit 4 is bit 4 of the instrument; byte 2 high nibble is the instrument's low four bits, low nibble the effect
 * command; byte 3 the effect parameter. The four bytes also ride in the invisible `period` carrier, so an unedited cell
 * (special words, off-table periods) encodes byte-exact. A special word shows as an empty note; typing a note over it
 * replaces the word.
 */
import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';
import { noteToPeriod, periodToNote } from '@/lib/amiga/periodNotes';

export const MMS_CELL_SIZE = 4;

export function mmsPack(b: ArrayLike<number>): number {
  return (((b[0] & 0xff) * 256 + (b[1] & 0xff)) * 256 + (b[2] & 0xff)) * 256 + (b[3] & 0xff);
}

export function mmsUnpack(v: number): Uint8Array {
  return Uint8Array.of(Math.floor(v / 16777216) & 0xff, Math.floor(v / 65536) & 0xff, Math.floor(v / 256) & 0xff, v & 0xff);
}

function storedNote(b: Uint8Array): number {
  if (b[0] & 0x80) return 0;
  return periodToNote(((b[0] & 0x0f) << 8) | b[1]);
}

export function decodeMmsCell(bytes: Uint8Array): TrackerCell {
  return {
    note: storedNote(bytes),
    instrument: (bytes[2] >> 4) | ((bytes[0] & 0x10) ? 0x10 : 0),
    volume: 0,
    effTyp: bytes[2] & 0x0f,
    eff: bytes[3],
    effTyp2: 0,
    eff2: 0,
    period: mmsPack(bytes),
  } as TrackerCell;
}

export function encodeMmsCell(cell: TrackerCell): Uint8Array {
  const out = cell.period !== undefined ? mmsUnpack(cell.period) : new Uint8Array(MMS_CELL_SIZE);
  const note = cell.note ?? 0;
  if (note !== storedNote(out)) {
    const p = note === 0 ? 0 : noteToPeriod(note);
    out[0] = (out[0] & 0x10) | (p >> 8);
    out[1] = p & 0xff;
  }
  const inst = (cell.instrument ?? 0) & 0x1f;
  out[0] = (out[0] & ~0x10) | (inst & 0x10);
  out[2] = ((inst & 0x0f) << 4) | ((cell.effTyp ?? 0) & 0x0f);
  out[3] = (cell.eff ?? 0) & 0xff;
  return out;
}

registerPatternEncoder('multiMediaSound', () => encodeMmsCell);

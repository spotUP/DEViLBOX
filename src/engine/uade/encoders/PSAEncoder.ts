/**
 * PSAEncoder - the Professional Sound Artists (PSA) grid cell codec.
 *
 * A PSA row is 4 voices x 4 bytes [note, instrument, effect, param]
 * (PSA_v2.asm lbC0002F2). note is a 1-based index into the player's 37-entry
 * period table (856 .. 107), so grid note = index + 12 (856 = C-1 = 13, the
 * periodToNote naming). instrument is 0-based. Bit 7 of the effect byte means
 * "set the period only, no retrigger" and byte 1 of an empty note is ignored by
 * the player: both are kept from the stored bytes (encodeOverStored).
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

export const PSA_PERIODS = [
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113, 107,
];
const NOTE_BASE = 12;

export function decodePSACell(bytes: Uint8Array): TrackerCell {
  const n = bytes[0];
  const valid = n >= 1 && n <= PSA_PERIODS.length;
  return {
    note: valid ? n + NOTE_BASE : 0,
    instrument: valid ? bytes[1] + 1 : 0,
    volume: 0,
    effTyp: bytes[2] & 0x7f,
    eff: bytes[3],
    effTyp2: 0,
    eff2: 0,
  };
}

export function encodePSACell(cell: TrackerCell, stored?: Uint8Array): Uint8Array {
  const n = (cell.note ?? 0) - NOTE_BASE;
  const hasNote = n >= 1 && n <= PSA_PERIODS.length;
  const out = new Uint8Array(4);
  out[0] = hasNote ? n : 0;
  out[1] = hasNote && (cell.instrument ?? 0) > 0 ? (cell.instrument - 1) & 0xff : (stored?.[1] ?? 0);
  out[2] = ((cell.effTyp ?? 0) & 0x7f) | ((stored?.[2] ?? 0) & 0x80);
  out[3] = (cell.eff ?? 0) & 0xff;
  return out;
}

registerPatternEncoder('psa', () => encodePSACell);

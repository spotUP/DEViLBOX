/**
 * UNICEncoder — Encodes TrackerCell back to UNIC Tracker (.unic) binary format.
 *
 * Cell encoding (3 bytes):
 *   byte[0]: instrHi[7:6] | noteIdx[5:0]
 *   byte[1]: instrLo[7:4] | command[3:0]
 *   byte[2]: parameter
 *
 * Note mapping: XM note → noteIdx = xmNote - 36 (1-36 range)
 * Instrument: split across b0[7:6] (bits 4-5) and b1[7:4] (bits 0-3)
 *   Parser: instrument = ((b0 >> 2) & 0x30) | ((b1 >> 4) & 0x0F)
 *   Reverse: instrHi = (instr & 0x30) << 2 → b0 bits [7:6]
 *            instrLo = (instr & 0x0F) << 4 → b1 bits [7:4]
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

function encodeUNICCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(3);
  const note = cell.note ?? 0;
  const instr = cell.instrument ?? 0;

  // noteIdx: XM 37 = noteIdx 1 (C-1 equivalent)
  let noteIdx = 0;
  if (note > 0 && note >= 37) {
    noteIdx = Math.min(63, note - 36);
  }

  // instrHi: bits 4-5 of instrument → b0 bits 7-6
  const instrHi = (instr & 0x30) << 2;
  out[0] = instrHi | (noteIdx & 0x3F);

  // instrLo: bits 0-3 of instrument → b1 bits 7-4
  const instrLo = (instr & 0x0F) << 4;
  out[1] = instrLo | ((cell.effTyp ?? 0) & 0x0F);

  out[2] = (cell.eff ?? 0) & 0xFF;

  return out;
}

registerPatternEncoder('unic', () => encodeUNICCell);

export { encodeUNICCell };

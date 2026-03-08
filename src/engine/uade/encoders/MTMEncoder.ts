/**
 * MTMEncoder — Encodes TrackerCell back to MultiTracker (.mtm) format.
 *
 * Cell encoding (3 bytes per track row):
 *   byte[0]: (rawNote << 2) | (instrHi & 0x03)
 *   byte[1]: (instrLo << 4) | (cmd & 0x0F)
 *   byte[2]: param
 *
 * Note mapping: mtmNoteToXM maps raw note (semitone) to XM note
 *   rawNote = (noteInstr >> 2), clamped to 96
 *   Reverse: XM note → rawNote directly (XM notes map ~1:1)
 *
 * Instrument: split across byte[0] bits[1:0] (high 2 bits) and byte[1] bits[7:4] (low 4 bits)
 *   Parser: instr = ((noteInstr & 0x03) << 4) | (instrCmd >> 4)
 *   Reverse: instrHi = (instr >> 4) & 0x03, instrLo = instr & 0x0F
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

function encodeMTMCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(3);
  const note = cell.note ?? 0;
  const instr = cell.instrument ?? 0;

  // rawNote: XM note directly (clamped)
  const rawNote = note > 0 ? Math.min(96, note) : 0;

  // Byte 0: (rawNote << 2) | instrHi
  out[0] = ((rawNote << 2) & 0xFC) | ((instr >> 4) & 0x03);

  // Byte 1: (instrLo << 4) | cmd
  out[1] = ((instr & 0x0F) << 4) | ((cell.effTyp ?? 0) & 0x0F);

  // Byte 2: param
  out[2] = (cell.eff ?? 0) & 0xFF;

  return out;
}

registerPatternEncoder('mtm', () => encodeMTMCell);

export { encodeMTMCell };

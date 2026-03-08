/**
 * DTMEncoder — Encodes TrackerCell back to Digital Tracker (.dtm) format.
 *
 * Supports two variants:
 *
 * PT Format (ProTracker compatible, 4 bytes):
 *   Same as standard MOD encoding — uses MODEncoder.
 *
 * 2.04 Format (4 bytes):
 *   byte[0]: note as BCD (hi=octave, lo=semitone)
 *   byte[1]: (volume << 2) | (instrHi & 0x03)
 *   byte[2]: (instrLo << 4) | (effect & 0x0F)
 *   byte[3]: effect parameter
 *
 * Note mapping for 2.04: XM note → BCD = octave*16 + semitone
 *   Parser: (d0 >> 4) * 12 + (d0 & 0x0F) + 12 → XM note
 *   Reverse: raw = xmNote - 12, octave = floor(raw/12), semi = raw%12
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';
import { encodeMODCell } from './MODEncoder';

/**
 * Encode a TrackerCell to DTM 2.04 format (4 bytes).
 */
function encodeDTM204Cell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;

  // Byte 0: note as BCD
  if (note > 0 && note >= 13) {
    const raw = note - 12;
    const octave = Math.floor(raw / 12);
    const semi = raw % 12;
    out[0] = ((octave & 0x0F) << 4) | (semi & 0x0F);
  } else {
    out[0] = 0;
  }

  // Byte 1: (volume << 2) | instrHi
  const vol = Math.min(62, cell.volume ?? 0);
  const instr = cell.instrument ?? 0;
  out[1] = ((vol + 1) << 2) | ((instr >> 4) & 0x03);

  // Byte 2: (instrLo << 4) | effect
  out[2] = ((instr & 0x0F) << 4) | ((cell.effTyp ?? 0) & 0x0F);

  // Byte 3: effect param
  out[3] = (cell.eff ?? 0) & 0xFF;

  return out;
}

// Register both variants
registerPatternEncoder('dtm_pt', () => encodeMODCell);
registerPatternEncoder('dtm_204', () => encodeDTM204Cell);

export { encodeDTM204Cell };

/**
 * IMSEncoder — Encodes TrackerCell back to IMS (Images Music System) binary format.
 *
 * Cell encoding: 3 bytes
 *   b0 = [instrHi:2 | noteIdx:6]
 *   b1 = [instrLo:4 | effTyp:4]
 *   b2 = effParam
 *
 * Note mapping: noteToImsIndex (IMSNotes.ts), shared with IMSParser.
 *
 * This is the exact reverse of IMSParser's decode logic.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';
import { noteToImsIndex } from '@/lib/import/formats/IMSNotes';

/**
 * Encode a TrackerCell to IMS binary format (3 bytes).
 */
function encodeIMSCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(3);

  const noteIdx = noteToImsIndex(cell.note ?? 0);
  const instr = cell.instrument ?? 0;
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;

  // b0 = [instrHi:2 | noteIdx:6]
  // instrHi = bits [5:4] of instrument, shifted left by 2 to fill bits [7:6]
  const instrHi = (instr & 0x30) << 2; // bits 5:4 → bits 7:6
  out[0] = instrHi | (noteIdx & 0x3F);

  // b1 = [instrLo:4 | effTyp:4]
  const instrLo = (instr & 0x0F) << 4;
  out[1] = instrLo | (effTyp & 0x0F);

  // b2 = effParam
  out[2] = eff & 0xFF;

  return out;
}

// Register in the encoder registry
registerPatternEncoder('ims', () => encodeIMSCell);

export { encodeIMSCell };

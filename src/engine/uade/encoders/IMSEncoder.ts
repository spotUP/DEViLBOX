/**
 * IMSEncoder — Encodes TrackerCell back to IMS (Images Music System) binary format.
 *
 * Cell encoding: 3 bytes
 *   b0 = [instrHi:2 | noteIdx:6]
 *   b1 = [instrLo:4 | effTyp:4]
 *   b2 = effParam
 *
 * Note mapping (reverse of imsNoteToXM):
 *   XM note 0       → IMS noteIdx 63 (empty)
 *   XM note 37..84  → IMS noteIdx 0..47
 *   Other XM notes  → IMS noteIdx 63 (clamp to empty)
 *
 * This is the exact reverse of IMSParser's decode logic.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

/**
 * Convert XM note back to IMS note index.
 */
function xmNoteToIMS(xmNote: number): number {
  if (xmNote === 0) return 63; // empty cell
  const imsIdx = xmNote - 37;
  if (imsIdx >= 0 && imsIdx < 48) return imsIdx;
  return 63; // out of range → empty
}

/**
 * Encode a TrackerCell to IMS binary format (3 bytes).
 */
function encodeIMSCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(3);

  const noteIdx = xmNoteToIMS(cell.note ?? 0);
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

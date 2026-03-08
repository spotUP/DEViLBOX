/**
 * DSMDynEncoder — Encodes TrackerCell back to Dynamic Studio DSm format.
 *
 * Cell encoding (4 bytes per row):
 *   byte[0]: instrument
 *   byte[1]: note_encoded (d1 = (xmNote - 36) * 2 when valid; 0 = no note)
 *   byte[2]: effect command
 *   byte[3]: effect parameter
 *
 * Note mapping:
 *   Parser: d1 → (d1 >> 1) + 36 = xmNote  (when d1 > 0 && d1 <= 168)
 *   Reverse: xmNote → d1 = (xmNote - 36) * 2
 *
 * Effect mapping:
 *   The parser maps DSm effects to XM via convertModCommand and special-case
 *   handling for commands 0x08, 0x13, 0x20-0x2F, 0x11, 0x12.
 *   The encoder reverses the standard MOD effect mapping (commands 0x00-0x0F).
 *   Special DSm effects (0x08, 0x13, 0x20+) are lossy and cannot be fully reversed.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

function encodeDSMDynCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;

  // Byte 0: instrument (1-based in both parser and file)
  out[0] = (cell.instrument ?? 0) & 0xFF;

  // Byte 1: note_encoded
  // Parser: xmNote = (d1 >> 1) + NOTE_MIN + 35 = (d1 >> 1) + 36
  // Reverse: d1 = (xmNote - 36) * 2
  if (note > 0 && note >= 36) {
    out[1] = Math.min(168, (note - 36) * 2);
  } else {
    out[1] = 0;
  }

  // Bytes 2-3: effect command + param
  // For standard MOD effects (0x00-0x0F), the mapping is identity.
  out[2] = (cell.effTyp ?? 0) & 0xFF;
  out[3] = (cell.eff ?? 0) & 0xFF;

  return out;
}

registerPatternEncoder('dsm_dyn', () => encodeDSMDynCell);

export { encodeDSMDynCell };

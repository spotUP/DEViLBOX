/**
 * SonicArrangerEncoder — Encodes TrackerCell back to Sonic Arranger (.sa) format.
 *
 * Cell encoding (4 bytes per track row):
 *   byte[0]: note (0=empty, 1-108=SA note index, 0x7F=force quiet, 0x80=release)
 *   byte[1]: instrument (1-based, 0=none)
 *   byte[2]: (disableST<<7 | disableNT<<6 | arpTable<<4 | effect)
 *   byte[3]: effect argument
 *
 * Note mapping: xmNote = saNote - 36 → saNote = xmNote + 36
 *   xmNote 97 (note-off) → saNote 0x7F (force quiet)
 *
 * The parser stores original SA effect/arpeggio values on TrackerCell as
 * saEffect/saEffectArg/saArpTable, enabling lossless round-trip encoding.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

export function encodeSonicArrangerCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);
  const xmNote = cell.note ?? 0;

  // Byte 0: SA note
  if (xmNote === 97) {
    out[0] = 0x7F; // note-off → force quiet
  } else if (xmNote > 0) {
    out[0] = Math.max(1, Math.min(132, xmNote + 36));
  } else {
    out[0] = 0;
  }

  // Byte 1: instrument (1-based)
  out[1] = (cell.instrument ?? 0) & 0xFF;

  // Byte 2: flags + effect
  // Use the original SA values stored during parsing (saArpTable, saEffect)
  const arpTable = (cell as unknown as Record<string, unknown>).saArpTable as number ?? 0;
  const saEffect = (cell as unknown as Record<string, unknown>).saEffect as number ?? 0;

  // Reconstruct byte 2: we don't track disableST/disableNT flags in the cell,
  // so those bits are 0 (transpose enabled). This is correct for user-edited cells.
  out[2] = ((arpTable & 0x03) << 4) | (saEffect & 0x0F);

  // Byte 3: effect argument
  const saEffectArg = (cell as unknown as Record<string, unknown>).saEffectArg as number ?? 0;
  out[3] = saEffectArg & 0xFF;

  return out;
}

registerPatternEncoder('sonicArranger', () => encodeSonicArrangerCell);

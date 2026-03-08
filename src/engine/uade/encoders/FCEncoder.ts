/**
 * FCEncoder — Encodes TrackerCell back to Future Composer 1.3/1.4 format.
 *
 * Cell format (2 bytes):
 *   byte[0]: note (0=empty, 1-72=FC period index, 0x49=note-off)
 *   byte[1]: val ((instrIdx & 0x3F) | portamento flags)
 *     bits 0-5: instrument index (vol macro index)
 *     bit 6: portamento reset (clear portamento)
 *     bit 7: portamento enable (next row's val = portamento speed)
 *
 * Note mapping:
 *   Parser: xmNote = (periodIdx & 0x7F) + 13  (periodIdx includes transpose)
 *   Encoder: raw note = xmNote - 13  (writes un-transposed; UADE replayer applies transpose)
 *
 * Instrument mapping:
 *   The encoder receives an instrumentIdToFCIndex reverse map built by the parser.
 *   If the instrument can't be reversed, the val byte's instrument bits are set to 0.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

/**
 * Create an FC cell encoder with the given instrument reverse map.
 * @param instrReverseMap — Map from TrackerSong instrument ID → FC vol macro index
 */
export function createFCEncoder(instrReverseMap: Map<number, number>): (cell: TrackerCell) => Uint8Array {
  return function encodeFCCell(cell: TrackerCell): Uint8Array {
    const out = new Uint8Array(2);
    const xmNote = cell.note ?? 0;

    // Byte 0: note
    if (xmNote === 97) {
      out[0] = 0x49; // note off
    } else if (xmNote > 0 && xmNote <= 96) {
      const raw = xmNote - 13;
      if (raw >= 1 && raw <= 72) {
        out[0] = raw;
      }
    }
    // else: 0 = empty

    // Byte 1: val = (instrIdx & 0x3F) | portamento flags
    // We don't encode portamento flags (bits 6-7) since they require multi-row context
    const instrId = cell.instrument ?? 0;
    if (instrId > 0) {
      const fcIdx = instrReverseMap.get(instrId) ?? 0;
      out[1] = fcIdx & 0x3F;
    }

    return out;
  };
}

registerPatternEncoder('futureComposer', () => createFCEncoder(new Map()));

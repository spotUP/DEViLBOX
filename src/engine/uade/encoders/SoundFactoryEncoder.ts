/**
 * SoundFactoryEncoder — Encodes TrackerCell back to Sound Factory (.psf) format.
 *
 * Sound Factory uses an opcode-based streaming format, NOT fixed-size cells.
 * Notes are 3 bytes: opcode (0x00-0x7F note index) + uint16 BE duration.
 *
 * Note mapping (reverse of parser's psfNoteToXm):
 *   Parser: xmNote = noteByte + 13
 *   Encoder: noteByte = xmNote - 13
 *
 * Since PSF is a streaming opcode format, we encode each note cell as:
 *   byte[0]: note byte (0x00-0x7F, period table index)
 *   byte[1..2]: duration (uint16 BE, default 1 for new notes)
 *
 * For empty/rest cells, we encode as Pause opcode (0x80 + uint16 duration).
 *
 * The getCellFileOffset closure in the parser provides the actual file offsets
 * where each decoded cell originated, enabling chip RAM patching.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

export function encodeSoundFactoryCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(3);
  const xmNote = cell.note ?? 0;

  if (xmNote > 0 && xmNote <= 96) {
    // Reverse psfNoteToXm: xmNote = noteByte + 13 → noteByte = xmNote - 13
    const noteByte = xmNote - 13;
    if (noteByte >= 0 && noteByte <= 0x7F) {
      out[0] = noteByte;
    } else {
      out[0] = 0; // clamp
    }
    // Duration = 1 tick (default for newly encoded notes)
    out[1] = 0;
    out[2] = 1;
  } else {
    // Empty/rest: Pause opcode (0x80) + uint16 duration = 1
    out[0] = 0x80;
    out[1] = 0;
    out[2] = 1;
  }

  return out;
}

registerPatternEncoder('soundFactory', () => encodeSoundFactoryCell);

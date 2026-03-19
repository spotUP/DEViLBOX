/**
 * SonixMusicDriverEncoder — Encodes TrackerCell rows back to SNX voice event streams.
 *
 * SNX is a variable-length event stream format (16-bit words, big-endian).
 * Each voice channel is an independent stream of opcodes:
 *
 *   0xFFFF          end of track
 *   0xC000-0xFFFE   rest/delay for (word & 0x3FFF) ticks
 *   0x83nn          volume set to nn (0-127)
 *   0x82nn          tempo change to nn
 *   0x81nn          loop control
 *   0x80nn          instrument change to register nn (0-based)
 *   0x0000          rest for 1 tick
 *   0x0Nnn          note on: high byte = note index (1-127), low byte = volume
 *
 * This encoder is the exact inverse of parseSnxVoiceStream in SonixMusicDriverParser.
 *
 * Reverse mappings:
 *   xmNote -> noteIndex: noteIndex = clamp(xmNote, 1, 127) (parser: xmNote = clamp(noteIndex, 1, 96))
 *   xmVol -> velByte:    velByte = round((clamp(xmVol - 0x10, 0, 64) / 64) * 127)
 *   instrument -> register: register = instrument - 1 (parser: instrument = register + 1)
 *
 * Since SNX is variable-length, this uses UADEVariablePatternLayout with
 * full-pattern re-serialization.
 */

import type { TrackerCell } from '@/types';
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';

/**
 * Encode a single channel's pattern rows back to an SNX voice event stream.
 *
 * Strategy:
 * - Empty rows (no note, no instrument, no volume) -> 0x0000 (rest 1 tick)
 * - Consecutive empty rows are RLE-compressed into rest opcodes (0xC000 | count)
 * - Instrument changes emit 0x80nn before the note
 * - Volume changes emit 0x83nn before the note
 * - Note-on rows emit high=noteIndex, low=velByte
 * - Stream ends with 0xFFFF
 */
function encodeSnxVoiceStream(rows: TrackerCell[], _channel: number): Uint8Array {
  const words: number[] = [];
  let lastInstr = 1; // track current instrument (1-based, matching parser default)

  let i = 0;
  while (i < rows.length) {
    const cell = rows[i];
    const note = cell.note ?? 0;
    const instr = cell.instrument ?? 0;
    const vol = cell.volume ?? 0;

    // Check if this is an empty row (no note, no instrument, no volume)
    const isEmpty = note === 0 && instr === 0 && vol === 0;

    if (isEmpty) {
      // Count consecutive empty rows for RLE compression
      let count = 0;
      while (i < rows.length) {
        const r = rows[i];
        if ((r.note ?? 0) !== 0 || (r.instrument ?? 0) !== 0 || (r.volume ?? 0) !== 0) break;
        count++;
        i++;
      }
      if (count === 1) {
        // Single empty row -> 0x0000 (rest 1 tick)
        words.push(0x0000);
      } else {
        // Multiple empty rows -> rest/delay opcode: 0xC000 | count
        // Max value per opcode is 0x3FFF ticks
        let remaining = count;
        while (remaining > 0) {
          const chunk = Math.min(remaining, 0x3FFF);
          words.push(0xC000 | chunk);
          remaining -= chunk;
        }
      }
      continue;
    }

    // Emit instrument change if needed
    if (instr > 0 && instr !== lastInstr) {
      const register = instr - 1; // reverse: parser does instrument = register + 1
      words.push(0x8000 | (register & 0xFF));
      lastInstr = instr;
    }

    // Emit volume change if volume column is set (XM volume format 0x10-0x50)
    if (vol >= 0x10) {
      const snxVol = Math.round(((Math.min(vol, 0x50) - 0x10) / 64) * 127);
      words.push(0x8300 | (snxVol & 0xFF));
    }

    // Emit note or rest
    if (note > 0 && note <= 96) {
      // Note on: high byte = note index, low byte = velocity
      const noteIndex = Math.max(1, Math.min(127, note));
      // Velocity from volume column, or default 100
      let velByte: number;
      if (vol >= 0x10) {
        velByte = Math.round(((Math.min(vol, 0x50) - 0x10) / 64) * 127);
      } else {
        velByte = 100; // default velocity when no volume set
      }
      words.push(((noteIndex & 0x7F) << 8) | (velByte & 0xFF));
    } else {
      // No note but has instrument or volume change — emit rest
      words.push(0x0000);
    }

    i++;
  }

  // End of track marker
  words.push(0xFFFF);

  // Convert words to bytes (big-endian uint16)
  const out = new Uint8Array(words.length * 2);
  for (let w = 0; w < words.length; w++) {
    out[w * 2] = (words[w] >> 8) & 0xFF;
    out[w * 2 + 1] = words[w] & 0xFF;
  }
  return out;
}

const sonixEncoder: VariableLengthEncoder = {
  formatId: 'sonixMusicDriver',
  encodePattern: encodeSnxVoiceStream,
};

registerVariableEncoder(sonixEncoder);

export { encodeSnxVoiceStream, sonixEncoder };

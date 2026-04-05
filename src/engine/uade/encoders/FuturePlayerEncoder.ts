/**
 * FuturePlayerEncoder — Encodes TrackerCell rows back to Future Player format.
 *
 * Future Player uses a variable-length byte stream per voice. Each note is
 * encoded as two bytes: [note, duration]. Commands use 0x80+ prefix bytes
 * with varying argument lengths.
 *
 * The parser linearizes these streams into fixed rows, so the encoder must
 * re-serialize rows back into note+duration pairs.
 *
 * Since the format is variable-length and stream-based (not fixed cells),
 * this uses the VariableLengthEncoder interface — encoding an entire channel
 * pattern at once.
 *
 * Note encoding (inverse of parser):
 *   XM note 0 = rest (byte0 = 0)
 *   XM note 1-96 = FP note 1-96 (direct mapping)
 *   Duration = count of consecutive identical-or-empty rows
 *
 * Effect encoding (inverse of parser):
 *   effTyp 0x03 (tone portamento) -> FP command 4 (portamento, 2-byte arg)
 */

import type { TrackerCell } from '@/types';
import { registerVariableEncoder, type VariableLengthEncoder } from '../UADEPatternEncoder';

/**
 * Encode a channel's rows back to FP byte stream.
 *
 * The parser expands note+duration pairs into rows: first row gets the note,
 * remaining duration-1 rows are empty (sustain). We reverse this by scanning
 * for note rows and counting subsequent empty rows to compute duration.
 */
function encodeFuturePlayerPattern(rows: TrackerCell[], _channel: number): Uint8Array {
  const bytes: number[] = [];

  let i = 0;
  while (i < rows.length) {
    const cell = rows[i];
    const note = cell.note ?? 0;

    // Determine the FP note byte (0 = rest, 1-96 = note)
    const fpNote = (note >= 1 && note <= 96) ? note : 0;

    // Count duration: this row + consecutive empty rows after it
    let duration = 1;
    while (i + duration < rows.length) {
      const next = rows[i + duration];
      if ((next.note ?? 0) !== 0 || (next.instrument ?? 0) !== 0 ||
          (next.effTyp ?? 0) !== 0 || (next.eff ?? 0) !== 0) {
        break;
      }
      duration++;
    }

    // Emit portamento effect as FP command 4 before the note if present
    const effTyp = cell.effTyp ?? 0;
    const eff = cell.eff ?? 0;
    if (effTyp === 0x03 && eff > 0) {
      // Command 4: portamento — 0x84, arg_byte, rate_hi, rate_lo
      bytes.push(0x84); // command byte: 0x80 | 4
      bytes.push(0);    // arg byte (unused by parser)
      bytes.push(0);    // rate high byte
      bytes.push(eff & 0xFF); // rate low byte
    }

    // Emit note + duration pair
    bytes.push(fpNote);
    // Duration byte: bit 7 can be set for extended duration
    if (duration > 127) {
      bytes.push(0x80 | (duration & 0x7F));
    } else {
      bytes.push(duration & 0xFF);
    }

    i += duration;
  }

  // Emit end-of-voice command (command 0 = end/return)
  bytes.push(0x80); // command byte: 0x80 | 0
  bytes.push(0);    // arg byte

  return new Uint8Array(bytes);
}

const futurePlayerEncoder: VariableLengthEncoder = {
  formatId: 'futurePlayer',
  encodePattern: encodeFuturePlayerPattern,
};

registerVariableEncoder(futurePlayerEncoder);

export { encodeFuturePlayerPattern };

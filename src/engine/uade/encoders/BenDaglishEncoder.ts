/**
 * BenDaglishEncoder — Encodes TrackerCell rows back to Ben Daglish track format.
 *
 * BD track byte stream encoding:
 *   0x00-0x7E: note command, followed by duration byte (ticks until next event)
 *   0x7F:      rest/sustain, followed by duration byte
 *   0x80+:     effect commands (sample mapping, portamento, etc.)
 *   0xFF:      end of track
 *
 * The encoder reverses the decode: scans rows, emits note+duration pairs for
 * non-empty rows, merges consecutive empty rows into rests.
 */

import type { TrackerCell } from '@/types';
import { registerVariableEncoder, type VariableLengthEncoder } from '../UADEPatternEncoder';

/**
 * Encode a channel's rows back to Ben Daglish track bytes.
 *
 * BD note value = trackerNote - 25 (BD 0 = C-1 = tracker note 25).
 * Each note/rest emits 2 bytes: [command, duration].
 * Duration = number of ticks until the next event.
 */
function encodeBenDaglishPattern(rows: TrackerCell[], _channel: number): Uint8Array {
  const bytes: number[] = [];
  let r = 0;

  while (r < rows.length) {
    const cell = rows[r];
    const note = cell.note ?? 0;

    if (note > 0) {
      // Note event: convert tracker note (1-96) to BD note (0-0x7E)
      const bdNote = Math.max(0, Math.min(0x7E, note - 25));

      // Duration = ticks until next non-empty row (or end of pattern)
      let duration = 1;
      while (r + duration < rows.length) {
        const next = rows[r + duration];
        if ((next.note ?? 0) > 0) break;
        duration++;
      }
      duration = Math.min(255, Math.max(1, duration));

      bytes.push(bdNote);
      bytes.push(duration);
      r += duration;
    } else {
      // Empty/rest rows — accumulate into a single rest command
      let duration = 0;
      while (r + duration < rows.length) {
        const next = rows[r + duration];
        if ((next.note ?? 0) > 0) break;
        duration++;
      }
      if (duration === 0) duration = 1;
      duration = Math.min(255, Math.max(1, duration));

      bytes.push(0x7F); // rest
      bytes.push(duration);
      r += duration;
    }
  }

  // End of track
  bytes.push(0xFF);

  return new Uint8Array(bytes);
}

const benDaglishEncoder: VariableLengthEncoder = {
  formatId: 'benDaglish',
  encodePattern: encodeBenDaglishPattern,
};

registerVariableEncoder(benDaglishEncoder);

export { encodeBenDaglishPattern, benDaglishEncoder };

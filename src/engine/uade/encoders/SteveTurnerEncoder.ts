/**
 * SteveTurnerEncoder — Encodes TrackerCell rows back to Steve Turner format.
 *
 * Steve Turner pattern blocks use a compact variable-length byte encoding:
 *   0x00-0x7F: note trigger at pitch index (XM note = b + 13, so b = xmNote - 13)
 *   0x80-0xAF: set duration = b - 0x7F (1-48 rows per step)
 *   0xB0-0xCF: instrument change + retrigger (b = 0xB0 + instrIdx_0based)
 *   0xD0-0xEF: select instrument without trigger (b = 0xD0 + instrIdx_0based)
 *   0xF0-0xF8: pitch effect (b = 0xF0 + effectNum)
 *   0xFE:      loop point marker
 *   0xFF:      end of pattern block
 *
 * The parser decodes these into sparse NoteEvents placed at specific rows.
 * The encoder must reverse this: scan rows, emit duration commands when the
 * gap between notes changes, emit instrument select/change, then note bytes.
 *
 * This is a variable-length format, so we use VariableLengthEncoder.
 */

import type { TrackerCell } from '@/types';
import { registerVariableEncoder, type VariableLengthEncoder } from '../UADEPatternEncoder';

/**
 * Encode a channel's rows back to Steve Turner pattern block bytes.
 *
 * The parser places events at specific rows using a duration counter.
 * We reverse by:
 *   1. Collecting non-empty rows with their row indices
 *   2. Computing gaps between events to emit duration commands
 *   3. Emitting instrument and note bytes
 *   4. Terminating with 0xFF
 */
function encodeSteveTurnerPattern(rows: TrackerCell[], _channel: number): Uint8Array {
  const bytes: number[] = [];
  let currentDuration = 1;
  let currentInstrument = -1; // 0-based, -1 = none set
  let lastEventRow = 0;

  for (let r = 0; r < rows.length; r++) {
    const cell = rows[r];
    const note = cell.note ?? 0;
    const instr = cell.instrument ?? 0; // 1-based in TrackerCell
    const effTyp = cell.effTyp ?? 0;
    const eff = cell.eff ?? 0;

    // Skip empty rows — they represent sustain/gap
    if (note === 0 && instr === 0 && effTyp === 0 && eff === 0) continue;

    // Compute needed duration from gap since last event
    const gap = r - lastEventRow;
    if (r > 0 && gap !== currentDuration) {
      // Emit duration command: 0x80 + (duration - 1), clamped to 1-48
      const dur = Math.max(1, Math.min(48, gap));
      bytes.push(0x7F + dur);
      currentDuration = dur;
    } else if (r === 0 && currentDuration !== 1) {
      // First event — ensure duration is set
      bytes.push(0x80); // duration = 1
      currentDuration = 1;
    }

    // Handle pitch effect (0xF0-0xF8): effTyp 0x0E, eff = 0x5n -> effectNum = n
    if (effTyp === 0x0E) {
      const subCmd = (eff >> 4) & 0x0F;
      const subParam = eff & 0x0F;
      if (subCmd === 5 && subParam > 0 && subParam <= 8) {
        bytes.push(0xF0 + subParam);
      }
    }

    // Handle instrument change
    if (instr > 0) {
      const instrIdx = instr - 1; // convert to 0-based

      if (note > 0) {
        // Note with instrument: if instrument changed, emit select first
        if (instrIdx !== currentInstrument) {
          // For note trigger, the instrument is implicit from currentInstrument
          // Emit 0xD0+idx to set instrument, then the note byte
          if (instrIdx >= 0 && instrIdx <= 0x1F) {
            bytes.push(0xD0 + instrIdx);
          }
          currentInstrument = instrIdx;
        }
        // Emit note byte: XM note -> pitch index (b = xmNote - 13)
        const pitchIdx = note - 13;
        if (pitchIdx >= 0 && pitchIdx <= 0x7F) {
          bytes.push(pitchIdx);
        }
      } else {
        // Instrument-only row (retrigger at current pitch): 0xB0 + instrIdx
        if (instrIdx >= 0 && instrIdx <= 0x1F) {
          bytes.push(0xB0 + instrIdx);
          currentInstrument = instrIdx;
        }
      }
    } else if (note > 0) {
      // Note without instrument change
      const pitchIdx = note - 13;
      if (pitchIdx >= 0 && pitchIdx <= 0x7F) {
        bytes.push(pitchIdx);
      }
    }

    lastEventRow = r;
  }

  // End of pattern block
  bytes.push(0xFF);

  return new Uint8Array(bytes);
}

const steveTurnerEncoder: VariableLengthEncoder = {
  formatId: 'steveTurner',
  encodePattern: encodeSteveTurnerPattern,
};

registerVariableEncoder(steveTurnerEncoder);

export { encodeSteveTurnerPattern };

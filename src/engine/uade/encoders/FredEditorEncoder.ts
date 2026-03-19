/**
 * FredEditorEncoder — Variable-length encoder for Fred Editor (.fred) pattern data.
 *
 * Fred Editor uses a compact byte stream encoding per channel:
 *
 *   Positive (1-127): note value (1-based, 6 octaves = 72 notes)
 *   Negative values are commands:
 *     -125 (0x83): set sample — followed by 1 byte sample index
 *     -126 (0x82): set speed — followed by 1 byte speed value
 *     -127 (0x81): portamento — followed by speed(1), note(1), delay(1)
 *     -124 (0x84): note off
 *     -128 (0x80): pattern end
 *     Other negative: duration = abs(value) empty rows (value -1 to -123)
 *
 * XM note → FE note: feNote = xmNote - 12 (parser uses feNote + 12 → xmNote)
 * FE note 1 = C-1 = XM note 13
 *
 * This is a variable-length encoder: each channel is serialized as a byte stream
 * because cell boundaries depend on the commands emitted.
 */

import type { TrackerCell } from '@/types';
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';

/**
 * Convert XM note (13-84) back to Fred Editor note (1-72).
 * Returns 0 for no note or out-of-range.
 */
function xmNoteToFE(xmNote: number): number {
  if (xmNote <= 0 || xmNote === 97) return 0; // 97 = note off in XM
  const fe = xmNote - 12;
  return (fe >= 1 && fe <= 72) ? fe : 0;
}

/**
 * Encode a signed byte as unsigned (two's complement).
 */
function s8(value: number): number {
  return value < 0 ? value + 256 : value & 0xFF;
}

export const fredEditorEncoder: VariableLengthEncoder = {
  formatId: 'fredEditor',

  encodePattern(rows: TrackerCell[]): Uint8Array {
    const buf: number[] = [];
    let lastInstrument = 0;
    let emptyCount = 0;

    /** Flush accumulated empty rows as a negative duration byte. */
    function flushEmpty(): void {
      while (emptyCount > 0) {
        // Duration byte: value = -(count), clamped to -123 max magnitude
        // Parser reads: abs(value) - 1 empty rows pushed, so value = -(emptyCount + 1)
        // Actually re-reading parser: duration case does abs(value) - 1 empty rows.
        // So to encode N empty rows: value = -(N + 1)
        // Max magnitude: -123 (gives 122 empty rows). But practically patterns are 64 rows max.
        // Wait: re-reading parser more carefully:
        //   const duration = Math.abs(value);
        //   const emptyRows = Math.min(duration - 1, maxRows - rows.length);
        // So abs(value) - 1 empty rows are added.
        // To encode N empty rows: abs(value) = N + 1 → value = -(N + 1)
        // Value range: -1 to -123 (cannot be -124..-128 as those are commands)
        const batch = Math.min(emptyCount, 122); // -(122+1) = -123
        buf.push(s8(-(batch + 1)));
        emptyCount -= batch;
      }
    }

    for (const cell of rows) {
      const feNote = xmNoteToFE(cell.note);
      const isNoteOff = cell.note === 97;
      const instrument = cell.instrument ?? 0;
      const effTyp = cell.effTyp ?? 0;
      const eff = cell.eff ?? 0;

      // Check for speed change effect (Fxx)
      const isSpeedChange = effTyp === 0x0F && eff > 0;

      // Check for note off
      if (isNoteOff) {
        flushEmpty();
        buf.push(s8(-124)); // 0x84 = note off
        continue;
      }

      // Check for speed change (no note)
      if (isSpeedChange && feNote === 0) {
        flushEmpty();
        buf.push(s8(-126)); // 0x82 = set speed
        buf.push(eff & 0xFF);
        continue;
      }

      // Check for note trigger
      if (feNote > 0) {
        flushEmpty();

        // Emit sample change if instrument changed
        if (instrument > 0 && (instrument - 1) !== lastInstrument) {
          buf.push(s8(-125)); // 0x83 = set sample
          buf.push((instrument - 1) & 0xFF);
          lastInstrument = instrument - 1;
        }

        // Check for portamento effect (tone porta = 0x03)
        if (effTyp === 0x03 && eff > 0) {
          // Portamento: -127 (0x81), speed, target note, delay
          // The parser reads: portaSpeed = byte[0] * speed, portaNote = byte[1], portaDelay = byte[2] * speed
          // We encode portaSpeed as raw byte (before * speed multiplication),
          // but the parser multiplies by speed during decode. The encoder should store
          // the pre-multiplied value. Since we don't know the current speed, store eff as-is.
          buf.push(s8(-127)); // 0x81 = portamento
          buf.push(eff & 0xFF); // portamento speed
          buf.push(feNote & 0xFF); // target note
          buf.push(0); // delay (0 = immediate)
          continue;
        }

        // Emit note value
        buf.push(feNote & 0x7F);

        // If also a speed change on this note row
        if (isSpeedChange) {
          // Speed change follows the note as a separate command
          buf.push(s8(-126)); // 0x82
          buf.push(eff & 0xFF);
        }
        continue;
      }

      // Empty row — accumulate
      emptyCount++;
    }

    // Flush remaining empty rows
    flushEmpty();

    // Pattern end marker
    buf.push(s8(-128)); // 0x80 = pattern end

    return new Uint8Array(buf);
  },
};

registerVariableEncoder(fredEditorEncoder);

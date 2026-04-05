/**
 * IffSmusEncoder.ts — Variable-length encoder for IFF SMUS / Sonix format.
 *
 * SMUS TRAK event encoding (2 bytes per event):
 *   type 0-127:   MIDI note on; data masked to 0x0F → DURATION_TABLE index
 *   type 128:     rest; data → DURATION_TABLE index
 *   type 129:     instrument change; data = register number
 *   type 130:     time signature change
 *   type 132:     per-track volume change
 *   type 255:     end-of-track mark
 *
 * DURATION_TABLE: [32,16,8,4,2,-1,-1,-1, 48,24,12,6,3,-1,-1,-1]
 * Index 0=32, 1=16, 2=8, 3=4, 4=2 (whole..sixteenth)
 * Index 8=48, 9=24, 10=12, 11=6, 12=3 (dotted versions)
 *
 * Note mapping (from IffSmusParser):
 *   SMUS EventType = MIDI note number (0-127)
 *   XM note = MIDInote - 11, clamped 1-96
 *   Reverse: MIDInote = xmNote + 11
 *
 * Transpose: applied during parsing (transposeOff = (transpose >> 4) - 8).
 *   Not reversed in encoder — stored data is pre-transpose MIDI notes.
 *   Reverse: rawMidi = xmNote + 11 - transposeOff (but we don't have transposeOff
 *   at encode time, so we encode with the already-transposed note).
 *
 * Since SMUS is event-stream (variable length, duration-based), this uses
 * UADEVariablePatternLayout. The encoder converts flat row arrays back to
 * SMUS events, collapsing consecutive empty rows into rest events.
 *
 * Parser reference: IffSmusParser.ts parseIffSmusFile lines 496-521
 */

import type { TrackerCell } from '@/types';
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';

// Duration values and their SMUS encoding indices
// The table maps: index → tick count
const DURATION_TABLE: number[] = [
  32, 16, 8, 4, 2, -1, -1, -1,
  48, 24, 12, 6, 3, -1, -1, -1,
];

// Reverse lookup: tick count → SMUS data nibble (0x0F masked index)
const DURATION_TO_INDEX = new Map<number, number>();
for (let i = 0; i < DURATION_TABLE.length; i++) {
  if (DURATION_TABLE[i] > 0) {
    DURATION_TO_INDEX.set(DURATION_TABLE[i], i);
  }
}

const EVENT_REST = 128;
const EVENT_INSTRUMENT = 129;
const EVENT_MARK = 255;

/**
 * Find the closest SMUS duration index for a given tick count.
 * Returns the data nibble (0-15) for the SMUS event.
 */
function ticksToDurationIndex(ticks: number): number {
  // Exact match first
  if (DURATION_TO_INDEX.has(ticks)) {
    return DURATION_TO_INDEX.get(ticks)!;
  }
  // Find closest valid duration
  let bestIdx = 3; // default: 4 ticks (quarter note)
  let bestDist = Infinity;
  for (let i = 0; i < DURATION_TABLE.length; i++) {
    if (DURATION_TABLE[i] < 0) continue;
    const dist = Math.abs(DURATION_TABLE[i] - ticks);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export const iffSmusEncoder: VariableLengthEncoder = {
  formatId: 'iffSmus',

  encodePattern(rows: TrackerCell[]): Uint8Array {
    const events: Array<{ type: number; data: number }> = [];
    let lastInstr = 0;
    let i = 0;

    while (i < rows.length) {
      const cell = rows[i];
      const note = cell.note ?? 0;
      const instr = cell.instrument ?? 0;

      if (note > 0 && note <= 96) {
        // Emit instrument change if needed
        if (instr > 0 && instr !== lastInstr) {
          // Instrument register = instrument - 1 (parser: instrument = mapper[register])
          // We use instrument - 1 as the register number
          events.push({ type: EVENT_INSTRUMENT, data: (instr - 1) & 0xFF });
          lastInstr = instr;
        }

        // Count duration: this note row + consecutive empty rows following it
        let duration = 1;
        let j = i + 1;
        while (j < rows.length) {
          const next = rows[j];
          if ((next.note ?? 0) !== 0 || (next.instrument ?? 0) !== 0) break;
          duration++;
          j++;
        }

        // Note event: type = MIDI note, data = duration index (nibble)
        // Reverse: MIDInote = xmNote + 11
        const midiNote = Math.max(0, Math.min(127, note + 11));
        const durIdx = ticksToDurationIndex(duration);
        events.push({ type: midiNote, data: durIdx & 0x0F });

        i = j; // skip past the note + its duration rows
      } else {
        // Rest: count consecutive empty rows
        let duration = 0;
        let j = i;
        while (j < rows.length) {
          const next = rows[j];
          if ((next.note ?? 0) !== 0) break;
          // Still check for instrument-only rows
          if ((next.instrument ?? 0) !== 0) break;
          duration++;
          j++;
        }
        if (duration === 0) duration = 1;

        // Rest event: type = 128, data = duration index
        const durIdx = ticksToDurationIndex(duration);
        events.push({ type: EVENT_REST, data: durIdx & 0x0F });

        i = j;
      }
    }

    // End of track marker
    events.push({ type: EVENT_MARK, data: 0xFF });

    // Convert to bytes (2 bytes per event)
    const out = new Uint8Array(events.length * 2);
    for (let e = 0; e < events.length; e++) {
      out[e * 2] = events[e].type & 0xFF;
      out[e * 2 + 1] = events[e].data & 0xFF;
    }
    return out;
  },
};

registerVariableEncoder(iffSmusEncoder);

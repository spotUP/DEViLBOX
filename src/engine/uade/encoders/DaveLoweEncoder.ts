/**
 * DaveLoweEncoder.ts — Re-encode tracker grid rows to Dave Lowe command streams.
 *
 * Dave Lowe pattern data is a variable-length command stream (not fixed-size cells).
 * This encoder converts tracker rows back to the command format:
 *   - Note on row → period word + duration word (duration = ticks until next event)
 *   - Instrument change → SET_INSTRUMENT (word 4) + longword offset
 *   - Empty rows → REST (word 32) + duration word
 *   - End of pattern → SEQ_ADVANCE (word 8)
 */

import type { TrackerCell } from '@/types';
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';
import { registerGenericInstrumentLayout } from '../GenericInstrumentLayoutFactory';

// ── Amiga period table (XM note → period) ─────────────────────────────────

const PT_PERIODS: number[] = [
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
  107, 101,  95,  90,  85,  80,  76,  72,  68,  64,  60,  57,
];

function xmNoteToPeriod(xmNote: number): number {
  if (xmNote <= 0 || xmNote > 96) return 0;
  const idx = xmNote - 13;
  if (idx < 0 || idx >= PT_PERIODS.length) return 0;
  return PT_PERIODS[idx];
}

// ── DL command constants ──────────────────────────────────────────────────

const CMD_SET_INSTRUMENT = 4;
const CMD_SEQ_ADVANCE    = 8;
const CMD_REST           = 32;
const TICKS_PER_ROW      = 6;

// ── Helper: write big-endian ──────────────────────────────────────────────

function pushWord(out: number[], val: number): void {
  out.push((val >> 8) & 0xFF, val & 0xFF);
}

function pushLong(out: number[], val: number): void {
  out.push((val >> 24) & 0xFF, (val >> 16) & 0xFF, (val >> 8) & 0xFF, val & 0xFF);
}

// ── Encoder ───────────────────────────────────────────────────────────────

export const daveLoweEncoder: VariableLengthEncoder = {
  formatId: 'daveLowe',

  /**
   * Encode one channel's pattern rows into a DL command stream.
   *
   * Strategy:
   * 1. Walk the rows, tracking current instrument and note state
   * 2. Emit SET_INSTRUMENT when instrument changes
   * 3. Emit period + duration for notes (merge consecutive same-note rows)
   * 4. Emit REST + duration for silent gaps
   * 5. Emit SEQ_ADVANCE at the end
   */
  encodePattern(rows: TrackerCell[]): Uint8Array {
    const out: number[] = [];
    let currentInstr = 0;
    let i = 0;

    while (i < rows.length) {
      const cell = rows[i];

      if (cell.note > 0) {
        // Note event
        const period = xmNoteToPeriod(cell.note);
        if (period === 0) {
          // Invalid note — treat as rest
          i++;
          continue;
        }

        // Emit instrument change if needed
        if (cell.instrument > 0 && cell.instrument !== currentInstr) {
          currentInstr = cell.instrument;
          pushWord(out, CMD_SET_INSTRUMENT);
          // Instrument offset — this will be patched by the chip RAM editor
          // Use instrument ID * 14 as a placeholder offset into the sample info table
          pushLong(out, 0); // placeholder — actual offset resolved at chip RAM write time
        }

        // Count duration: how many consecutive rows have the same note (or empty rows following)
        let duration = TICKS_PER_ROW;
        let j = i + 1;
        while (j < rows.length) {
          if (rows[j].note > 0) break; // new note starts
          duration += TICKS_PER_ROW;
          j++;
        }

        pushWord(out, period);
        pushWord(out, duration);
        i = j;
      } else {
        // Empty row — accumulate rest duration
        let restTicks = 0;
        while (i < rows.length && rows[i].note === 0) {
          restTicks += TICKS_PER_ROW;
          i++;
        }
        if (restTicks > 0) {
          pushWord(out, CMD_REST);
          pushWord(out, restTicks);
        }
      }
    }

    // End of pattern
    pushWord(out, CMD_SEQ_ADVANCE);

    return new Uint8Array(out);
  },
};

// Auto-register
registerVariableEncoder(daveLoweEncoder);

// ─── Instrument Layout Registration ──────────────────────────────────────────
registerGenericInstrumentLayout('daveLowe', { kind: 'stub' });

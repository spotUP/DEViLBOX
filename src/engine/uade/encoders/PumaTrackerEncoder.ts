/**
 * PumaTrackerEncoder.ts — Variable-length encoder for PumaTracker pattern data.
 *
 * PumaTracker uses a run-length encoded format: each entry is 4 bytes:
 *   [noteX2, instrEffect, param, runLen]
 *
 * - noteX2: note value × 2 (bit 0 must be 0). 0 = no note.
 * - instrEffect: high 5 bits = instrument (0-31), low 3 bits = effect type
 * - param: effect parameter
 * - runLen: number of consecutive rows with identical data (1-64)
 *
 * Consecutive identical rows are merged into a single entry with higher runLen,
 * providing lossless compression.
 *
 * Parser reference: PumaTrackerParser.ts lines 330-346
 * Effect mapping (from parser):
 *   effect 0 = none
 *   effect 1 = set volume (0x0C)
 *   effect 2 = pitch slide down (0x02)
 *   effect 3 = pitch slide up (0x01)
 *   effect 4 = portamento (0x03)  [combined with slide in param]
 */

import type { TrackerCell } from '@/types';
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';

interface PumaEntry {
  noteX2: number;
  instrEffect: number;
  param: number;
}

/** Convert XM note (1-96) back to PumaTracker noteX2. */
function xmNoteToPuma(xmNote: number): number {
  if (xmNote <= 0) return 0;
  // Parser: cell.note = Math.max(1, 12 + Math.trunc(raw / 2))
  // Reverse: raw = (xmNote - 12) * 2
  const raw = (xmNote - 12) * 2;
  return Math.max(0, Math.min(254, raw & 0xFE)); // ensure even
}

/** Convert XM effect to PumaTracker 3-bit effect + param. */
function xmEffectToPuma(effTyp: number, eff: number): [number, number] {
  switch (effTyp) {
    case 0x0C: return [1, Math.min(eff, 64)];  // Set volume
    case 0x02: return [2, eff];                  // Pitch slide down
    case 0x01: return [3, eff];                  // Pitch slide up
    case 0x03: return [4, eff];                  // Portamento
    default:   return [0, 0];                    // No effect
  }
}

function cellToEntry(cell: TrackerCell): PumaEntry {
  const noteX2 = xmNoteToPuma(cell.note);
  const [eff, param] = xmEffectToPuma(cell.effTyp, cell.eff);
  const instr = (cell.instrument & 0x1F);
  const instrEffect = (instr << 3) | (eff & 0x07);
  return { noteX2, instrEffect, param };
}

function entriesEqual(a: PumaEntry, b: PumaEntry): boolean {
  return a.noteX2 === b.noteX2 && a.instrEffect === b.instrEffect && a.param === b.param;
}

export const pumaTrackerEncoder: VariableLengthEncoder = {
  formatId: 'pumaTracker',

  encodePattern(rows: TrackerCell[]): Uint8Array {
    if (rows.length === 0) return new Uint8Array(0);

    // Run-length encode: merge consecutive identical entries
    const entries: Array<{ entry: PumaEntry; runLen: number }> = [];
    let current = cellToEntry(rows[0]);
    let runLen = 1;

    for (let i = 1; i < rows.length; i++) {
      const next = cellToEntry(rows[i]);
      if (entriesEqual(current, next) && runLen < 64) {
        runLen++;
      } else {
        entries.push({ entry: current, runLen });
        current = next;
        runLen = 1;
      }
    }
    entries.push({ entry: current, runLen });

    // Serialize: 4 bytes per entry
    const buf = new Uint8Array(entries.length * 4);
    for (let i = 0; i < entries.length; i++) {
      const { entry, runLen: len } = entries[i];
      buf[i * 4]     = entry.noteX2;
      buf[i * 4 + 1] = entry.instrEffect;
      buf[i * 4 + 2] = entry.param;
      buf[i * 4 + 3] = len;
    }
    return buf;
  },
};

registerVariableEncoder(pumaTrackerEncoder);

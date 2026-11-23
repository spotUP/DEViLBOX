/**
 * TronicEncoder.ts - Tronic (.dp / .trc / .tro) 4-byte pattern row.
 *
 * Layout (nuade third-party/nuade/players/tronic/tronic_module.c, tronic_pattern_row):
 *   byte 0: note, a period-table index (0 = no note); the voice plays tronic_period((uint8)(note + step transpose))
 *   byte 1: instrument number, 1-based
 *   byte 2: effect 0-8 (1 speed, 3 slide up, 4 slide down, 5 slide to note, 6 voice volume, 7 master volume, 8 wave table)
 *   byte 3: effect argument
 *
 * The stored index rides in the `period` carrier (the layout's storeNote puts it there, taken back through the step
 * transpose); the effect bytes are the native codes, shown and written as they are.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

export function decodeTronicCell(bytes: Uint8Array): TrackerCell {
  return {
    note: bytes[0],
    instrument: bytes[1],
    volume: 0,
    effTyp: bytes[2],
    eff: bytes[3],
    effTyp2: 0,
    eff2: 0,
    ...(bytes[0] ? { period: bytes[0] } : {}),
  };
}

export function encodeTronicCell(cell: TrackerCell): Uint8Array {
  const note = (cell.note ?? 0) !== 0 ? (cell.period ?? 0) & 0xff : 0;
  return new Uint8Array([note, (cell.instrument ?? 0) & 0xff, (cell.effTyp ?? 0) & 0xff, (cell.eff ?? 0) & 0xff]);
}

registerPatternEncoder('tronic', () => encodeTronicCell);

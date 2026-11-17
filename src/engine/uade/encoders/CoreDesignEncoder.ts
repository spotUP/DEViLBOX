/**
 * CoreDesignEncoder - the one event byte of a Core Design pattern stream (CoreDesignParser.ts).
 *
 * A cell is the note byte of one event (0x00-0x7D note index, 0x7E period, 0x7F rest). The grid note comes from the
 * module's own period table, which the layout knows and this decoder does not, so the raw byte rides in the `period`
 * carrier and an unedited cell encodes byte-exact. Edited notes and instruments are written by the parser's effectPatches.
 */
import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

export function decodeCoreDesignCell(bytes: Uint8Array): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0, period: bytes[0] } as TrackerCell;
}

export function encodeCoreDesignCell(cell: TrackerCell): Uint8Array {
  return new Uint8Array([(cell.period ?? 0x7f) & 0xff]);
}

registerPatternEncoder('coreDesign', () => encodeCoreDesignCell);

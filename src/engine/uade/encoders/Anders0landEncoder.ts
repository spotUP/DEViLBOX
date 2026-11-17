/**
 * Anders0landEncoder - the note byte of one Anders 0land event (Anders0landParser.ts).
 *
 * A cell is the note byte of one event (bit 7 legato, low 7 bits the note index into the replayer's period table). The
 * grid note depends on the track list's transposition, which the layout knows and this decoder does not, so the raw byte
 * rides in the `period` carrier and an unedited cell encodes byte-exact. Edited notes and instruments are written by the
 * parser's effectPatches.
 */
import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

export function decodeAnders0landCell(bytes: Uint8Array): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0, period: bytes[0] } as TrackerCell;
}

export function encodeAnders0landCell(cell: TrackerCell): Uint8Array {
  return new Uint8Array([(cell.period ?? 0) & 0xff]);
}

registerPatternEncoder('anders0land', () => encodeAnders0landCell);

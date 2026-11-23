/**
 * PeterVerswyvelenPackerEncoder.ts — Peter Verswyvelen Packer 4-byte note cell.
 *
 * Layout (nuade peterverswyvelen.c, pv_read_note):
 *   byte 0: bits 7-3 sample, bit 2 sounding flag, bits 1-0 period bits 9-8
 *   byte 1: period bits 7-0
 *   byte 2: bits 7-4 duration (extra rows the note repeats), bits 3-0 effect
 *   byte 3: effect parameter
 *
 * The sounding flag and the duration are not grid fields: they come from the
 * stored bytes (encodeOverStored), so an edit never changes the run length.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';
import { cellPeriod, periodToPtNote } from '@/lib/amiga/periodNotes';

export function decodePeterVerswyvelenPackerCell(bytes: Uint8Array): TrackerCell {
  const period = ((bytes[0] & 0x03) << 8) | bytes[1];
  return {
    note: period ? periodToPtNote(period) : 0,
    instrument: bytes[0] >> 3,
    volume: 0,
    effTyp: bytes[2] & 0x0f,
    eff: bytes[3],
    effTyp2: 0,
    eff2: 0,
    ...(period ? { period } : {}),
  };
}

export function encodePeterVerswyvelenPackerCell(cell: TrackerCell, stored?: Uint8Array): Uint8Array {
  const period = cellPeriod(cell) & 0x3ff;
  const sounding = stored ? stored[0] & 0x04 : (period ? 0x04 : 0);
  const duration = stored ? stored[2] & 0xf0 : 0;
  return new Uint8Array([
    ((cell.instrument & 0x1f) << 3) | sounding | (period >> 8),
    period & 0xff,
    duration | (cell.effTyp & 0x0f),
    cell.eff & 0xff,
  ]);
}

registerPatternEncoder('peterVerswyvelenPacker', () => encodePeterVerswyvelenPackerCell);

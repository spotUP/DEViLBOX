/**
 * DigitalSonixChromeEncoder - the Digital Sonix & Chrome (DSC.*) grid cell codec.
 *
 * A DSC row is one byte per voice (DigitalSonixChrome_v1.asm lbC005400): a
 * record index 0..nRecords-1 triggers that 18-byte record (a sample at a fixed
 * period, volume and repeat count, lbC005936), 0xFF triggers nothing. So the
 * grid cell is: note = the record's period read as a note, instrument = record
 * index + 1. The record IS the note: pitch is not a separate field on disk.
 *
 * Encoding a cell:
 *   - no note (or note-off, or no instrument)          -> 0xFF
 *   - the instrument's own record plays the cell's note -> that record
 *   - the note was changed: a record of the SAME sample (pcmOffset + length)
 *     whose period plays that note                       -> that record
 *   - otherwise                                          -> the instrument's record
 *     (the format cannot play that sample at another pitch)
 *
 * Bytes past the record table other than 0xFF never occur in the corpus (14
 * files); they decode as an empty cell.
 *
 * Module layout and the whole-file codec: src/lib/import/formats/DigitalSonixChromeModule.ts.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';
import { periodToNote } from '@/lib/amiga/periodNotes';
import { DSC_EMPTY, type DscRecord } from '@/lib/import/formats/DigitalSonixChromeModule';

const NOTE_OFF = 97;

export interface DscCellCodec {
  decodeCell(bytes: Uint8Array): TrackerCell;
  encodeCell(cell: TrackerCell): Uint8Array;
  /** The track byte for a cell (encodeCell's single byte). */
  cellByte(cell: TrackerCell): number;
}

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

/**
 * The codec for one module's records. Without records (the registry's
 * context-free entry) the instrument number is written as is.
 */
export function makeDscCellCodec(records?: readonly DscRecord[]): DscCellCodec {
  const noteOf = (r: DscRecord): number => periodToNote(r.period);

  const cellByte = (cell: TrackerCell): number => {
    const note = cell.note ?? 0;
    const inst = cell.instrument ?? 0;
    if (note <= 0 || note >= NOTE_OFF || inst < 1) return DSC_EMPTY;
    if (!records) return inst - 1 < DSC_EMPTY ? inst - 1 : DSC_EMPTY;
    if (inst > records.length) return DSC_EMPTY;
    const idx = inst - 1;
    const own = records[idx];
    if (noteOf(own) === note) return idx;
    const sibling = records.findIndex((r) => r.pcmOffset === own.pcmOffset && r.length === own.length && noteOf(r) === note);
    return sibling >= 0 ? sibling : idx;
  };

  return {
    cellByte,
    encodeCell: (cell) => Uint8Array.of(cellByte(cell)),
    decodeCell: (bytes) => {
      const b = bytes[0];
      const rec = records?.[b];
      if (b === DSC_EMPTY || !rec) return emptyCell();
      return { ...emptyCell(), note: noteOf(rec), instrument: b + 1, period: rec.period };
    },
  };
}

const contextFree = makeDscCellCodec();
registerPatternEncoder('digitalSonixChrome', () => contextFree.encodeCell);

/** Context-free cell encoder (instrument number as the record index). */
export const encodeDscCell = contextFree.encodeCell;

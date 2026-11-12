/**
 * MedleyEncoder - the Medley (.mso) track stream from its carrier rows.
 *
 * Every stream item is two bytes (medleyGrid.ts holds the byte layout). The parser keeps each item as a carrier cell
 * (cutoff = 2, period = byte 0, pan = byte 1), so the stream is those bytes concatenated and an unedited block is byte-exact.
 */
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';
import { encodeMedleyStream } from '@/lib/import/formats/medleyGrid';

export const medleyEncoder: VariableLengthEncoder = {
  formatId: 'medley',
  encodePattern: (rows) => encodeMedleyStream(rows),
  canEncode: (rows) => rows.every(c => c.cutoff !== undefined),
};

registerVariableEncoder(medleyEncoder);

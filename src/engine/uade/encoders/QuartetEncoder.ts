/**
 * QuartetEncoder - a Quartet PSG (.sqt) voice stream from its carrier rows.
 *
 * Every carrier cell holds two stream bytes (quartetPsgGrid.ts holds the record layout: cutoff = 2, period = byte 0,
 * pan = byte 1), so the stream is those bytes concatenated and an unedited block is byte-exact.
 */
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';
import { encodeQuartetStream } from '@/lib/import/formats/quartetPsgGrid';

export const quartetEncoder: VariableLengthEncoder = {
  formatId: 'quartet',
  encodePattern: (rows) => encodeQuartetStream(rows),
  canEncode: (rows) => rows.every(c => c.cutoff !== undefined),
};

registerVariableEncoder(quartetEncoder);

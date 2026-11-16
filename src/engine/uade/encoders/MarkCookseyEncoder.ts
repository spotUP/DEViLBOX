/**
 * MarkCookseyEncoder - the Mark Cooksey command stream from its carrier rows.
 *
 * The parser keeps each stream byte a channel reaches as one carrier cell (cutoff = 1, period = byte; markCookseyGrid.ts
 * holds the byte layout), so a block is those bytes concatenated and an unedited block is byte-exact. Note edits are
 * written in place by MarkCookseyExporter (applyMarkCookseyGridEdits), never by re-flowing the stream.
 */
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';
import { encodeMarkCookseyStream } from '@/lib/import/formats/markCookseyGrid';

export const markCookseyEncoder: VariableLengthEncoder = {
  formatId: 'markCooksey',
  encodePattern: (rows) => encodeMarkCookseyStream(rows),
  canEncode: (rows) => rows.every(c => c.cutoff !== undefined),
};

registerVariableEncoder(markCookseyEncoder);

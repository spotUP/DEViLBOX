/**
 * PaulSummersEncoder - the Paul Summers pattern stream from its carrier rows.
 *
 * The parser keeps each pattern byte a voice reaches as one carrier cell (cutoff = 1, period = byte; paulSummersGrid.ts
 * holds the byte layout), so a block is those bytes concatenated and an unedited block is byte-exact. Note edits are
 * written in place by PaulSummersExporter (applyPaulSummersGridEdits), never by re-flowing the stream.
 */
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';
import { encodePaulSummersStream } from '@/lib/import/formats/paulSummersGrid';

export const paulSummersEncoder: VariableLengthEncoder = {
  formatId: 'paulSummers',
  encodePattern: (rows) => encodePaulSummersStream(rows),
  canEncode: (rows) => rows.every(c => c.cutoff !== undefined),
};

registerVariableEncoder(paulSummersEncoder);

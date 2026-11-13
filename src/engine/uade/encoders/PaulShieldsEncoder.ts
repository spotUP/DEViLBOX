/**
 * PaulShieldsEncoder - the Paul Shields pattern stream from its carrier rows.
 *
 * The parser keeps each pattern byte a voice reaches as one carrier cell (cutoff = 1, period = byte; paulShieldsGrid.ts
 * holds the byte layout), so a block is those bytes concatenated and an unedited block is byte-exact. Note edits are
 * written in place by PaulShieldsExporter (applyPaulShieldsGridEdits), never by re-flowing the stream.
 */
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';
import { encodePaulShieldsStream } from '@/lib/import/formats/paulShieldsGrid';

export const paulShieldsEncoder: VariableLengthEncoder = {
  formatId: 'paulShields',
  encodePattern: (rows) => encodePaulShieldsStream(rows),
  canEncode: (rows) => rows.every(c => c.cutoff !== undefined),
};

registerVariableEncoder(paulShieldsEncoder);

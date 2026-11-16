/**
 * JasonPageEncoder - the Jason Page pattern bytes from their carrier rows.
 *
 * The parser keeps each pattern byte a voice reaches as one carrier cell (cutoff = 1, period = byte; jasonPageGrid.ts
 * holds the byte layout), so a block is those bytes concatenated and an unedited block is byte-exact. Note edits are
 * written in place by JasonPageExporter (applyJasonPageGridEdits), never by re-flowing the pattern.
 */
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';
import { encodeJasonPageStream } from '@/lib/import/formats/jasonPageGrid';

export const jasonPageEncoder: VariableLengthEncoder = {
  formatId: 'jasonPage',
  encodePattern: (rows) => encodeJasonPageStream(rows),
  canEncode: (rows) => rows.every(c => c.cutoff !== undefined),
};

registerVariableEncoder(jasonPageEncoder);

/**
 * ManiacsOfNoiseEncoder - the Maniacs of Noise sequence and pattern bytes from their carrier rows.
 *
 * The parser keeps each byte a voice reaches as one carrier cell (cutoff = 1, period = byte; maniacsOfNoiseGrid.ts
 * holds the byte layout), so a block is those bytes concatenated and an unedited block is byte-exact. Note edits are
 * written in place by ManiacsOfNoiseExporter (applyManiacsOfNoiseGridEdits), never by re-flowing the stream.
 */
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';
import { encodeManiacsOfNoiseStream } from '@/lib/import/formats/maniacsOfNoiseGrid';

export const maniacsOfNoiseEncoder: VariableLengthEncoder = {
  formatId: 'maniacsOfNoise',
  encodePattern: (rows) => encodeManiacsOfNoiseStream(rows),
  canEncode: (rows) => rows.every(c => c.cutoff !== undefined),
};

registerVariableEncoder(maniacsOfNoiseEncoder);

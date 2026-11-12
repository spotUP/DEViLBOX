/**
 * PaulRobothamEncoder - the Paul Robotham (.dat) voice command stream from its carrier rows.
 *
 * A voice is one linear command stream (paulRobothamGrid.ts holds the byte layout and the command table). The parser
 * keeps every command as a carrier cell (cutoff = length, period/pan/resonance = bytes 0..2), so the stream is those
 * bytes concatenated and an unedited block is byte-exact.
 */
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';
import { encodePRStream } from '@/lib/import/formats/paulRobothamGrid';

export const paulRobothamEncoder: VariableLengthEncoder = {
  formatId: 'paulRobotham',
  encodePattern: (rows) => encodePRStream(rows),
  canEncode: (rows) => rows.every(c => c.cutoff !== undefined),
};

registerVariableEncoder(paulRobothamEncoder);

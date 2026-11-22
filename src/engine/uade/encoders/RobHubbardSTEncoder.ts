/**
 * RobHubbardSTEncoder.ts - Rob Hubbard ST block encoder. A block's carrier rows (RobHubbardSTParser.ts) hold its commands
 * byte-exact in the same carrier fields as Rob Hubbard (cutoff = byte count, period/pan/resonance = bytes; a 4-byte command
 * spans two rows), so encoding is the Rob Hubbard concatenation under its own format id.
 */
import type { TrackerCell } from '@/types';
import { registerVariableEncoder, type VariableLengthEncoder } from '../UADEPatternEncoder';
import { encodeRobHubbardPattern } from './RobHubbardEncoder';

export const robHubbardSTEncoder: VariableLengthEncoder = {
  formatId: 'robHubbardST',
  encodePattern: (rows: TrackerCell[]) => encodeRobHubbardPattern(rows),
};

registerVariableEncoder(robHubbardSTEncoder);

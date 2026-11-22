/**
 * Mark II encoder: the row table and every played sequence is a block of carrier rows (MarkIIParser.ts), so a block
 * encodes back through the Rob Hubbard carrier encoder.
 */
import type { TrackerCell } from '@/types';
import { registerVariableEncoder, type VariableLengthEncoder } from '../UADEPatternEncoder';
import { encodeRobHubbardPattern } from './RobHubbardEncoder';

export const markIIEncoder: VariableLengthEncoder = {
  formatId: 'markII',
  encodePattern: (rows: TrackerCell[]) => encodeRobHubbardPattern(rows),
};

registerVariableEncoder(markIIEncoder);

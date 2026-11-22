/**
 * Steve Barrett encoder: every list and played pattern is a block of carrier rows (SteveBarrettParser.ts), so a block
 * encodes back through the Rob Hubbard carrier encoder.
 */
import type { TrackerCell } from '@/types';
import { registerVariableEncoder, type VariableLengthEncoder } from '../UADEPatternEncoder';
import { encodeRobHubbardPattern } from './RobHubbardEncoder';

export const steveBarrettEncoder: VariableLengthEncoder = {
  formatId: 'steveBarrett',
  encodePattern: (rows: TrackerCell[]) => encodeRobHubbardPattern(rows),
};

registerVariableEncoder(steveBarrettEncoder);

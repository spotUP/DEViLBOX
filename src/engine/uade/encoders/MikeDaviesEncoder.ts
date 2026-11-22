/**
 * Mike Davies encoder: every track is a block of carrier rows (MikeDaviesParser.ts), so a block encodes back through
 * the Rob Hubbard carrier encoder.
 */
import type { TrackerCell } from '@/types';
import { registerVariableEncoder, type VariableLengthEncoder } from '../UADEPatternEncoder';
import { encodeRobHubbardPattern } from './RobHubbardEncoder';

export const mikeDaviesEncoder: VariableLengthEncoder = {
  formatId: 'mikeDavies',
  encodePattern: (rows: TrackerCell[]) => encodeRobHubbardPattern(rows),
};

registerVariableEncoder(mikeDaviesEncoder);

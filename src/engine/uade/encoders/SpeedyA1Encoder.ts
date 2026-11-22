/**
 * Speedy A1 System encoder: every played file pattern (16 cells of 3 bytes) is a block of carrier rows
 * (SpeedyA1SystemParser.ts), so a block encodes back through the Rob Hubbard carrier encoder.
 */
import type { TrackerCell } from '@/types';
import { registerVariableEncoder, type VariableLengthEncoder } from '../UADEPatternEncoder';
import { encodeRobHubbardPattern } from './RobHubbardEncoder';

export const speedyA1Encoder: VariableLengthEncoder = {
  formatId: 'sonicArrangerSas',
  encodePattern: (rows: TrackerCell[]) => encodeRobHubbardPattern(rows),
};

registerVariableEncoder(speedyA1Encoder);

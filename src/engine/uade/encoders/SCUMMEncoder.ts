/**
 * SCUMM encoder: every event list is a block of carrier rows (SCUMMParser.ts), so a block encodes back through the
 * Rob Hubbard carrier encoder.
 */
import type { TrackerCell } from '@/types';
import { registerVariableEncoder, type VariableLengthEncoder } from '../UADEPatternEncoder';
import { encodeRobHubbardPattern } from './RobHubbardEncoder';

export const scummEncoder: VariableLengthEncoder = {
  formatId: 'scumm',
  encodePattern: (rows: TrackerCell[]) => encodeRobHubbardPattern(rows),
};

registerVariableEncoder(scummEncoder);

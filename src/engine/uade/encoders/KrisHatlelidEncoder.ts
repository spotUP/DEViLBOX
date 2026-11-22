/**
 * Kris Hatlelid encoder: every track is a block of carrier rows (KrisHatlelidGrid.ts), so a block encodes back through
 * the Rob Hubbard carrier encoder.
 */
import type { TrackerCell } from '@/types';
import { registerVariableEncoder, type VariableLengthEncoder } from '../UADEPatternEncoder';
import { encodeRobHubbardPattern } from './RobHubbardEncoder';

export const krisHatlelidEncoder: VariableLengthEncoder = {
  formatId: 'krisHatlelid',
  encodePattern: (rows: TrackerCell[]) => encodeRobHubbardPattern(rows),
};

registerVariableEncoder(krisHatlelidEncoder);

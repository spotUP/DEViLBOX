/**
 * Ashley Hogg encoder: every track is a block of carrier rows (AshleyHoggOldGrid.ts), so a block encodes back through
 * the Rob Hubbard carrier encoder.
 */
import type { TrackerCell } from '@/types';
import { registerVariableEncoder, type VariableLengthEncoder } from '../UADEPatternEncoder';
import { encodeRobHubbardPattern } from './RobHubbardEncoder';

export const ashleyHoggEncoder: VariableLengthEncoder = {
  formatId: 'ashleyHogg',
  encodePattern: (rows: TrackerCell[]) => encodeRobHubbardPattern(rows),
};

registerVariableEncoder(ashleyHoggEncoder);

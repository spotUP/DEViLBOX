/**
 * Sean Connolly encoder: every pattern is a block of carrier rows (SeanConnollyGrid.ts), so a block encodes back
 * through the Rob Hubbard carrier encoder.
 */
import type { TrackerCell } from '@/types';
import { registerVariableEncoder, type VariableLengthEncoder } from '../UADEPatternEncoder';
import { encodeRobHubbardPattern } from './RobHubbardEncoder';

export const seanConnollyEncoder: VariableLengthEncoder = {
  formatId: 'seanConnolly',
  encodePattern: (rows: TrackerCell[]) => encodeRobHubbardPattern(rows),
};

registerVariableEncoder(seanConnollyEncoder);

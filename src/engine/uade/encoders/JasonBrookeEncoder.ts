/**
 * Jason Brooke encoder: every track stream is a block of carrier rows (JasonBrookeGrid.ts), so a block encodes back
 * through the Rob Hubbard carrier encoder.
 */
import type { TrackerCell } from '@/types';
import { registerVariableEncoder, type VariableLengthEncoder } from '../UADEPatternEncoder';
import { encodeRobHubbardPattern } from './RobHubbardEncoder';

export const jasonBrookeEncoder: VariableLengthEncoder = {
  formatId: 'jasonBrooke',
  encodePattern: (rows: TrackerCell[]) => encodeRobHubbardPattern(rows),
};

registerVariableEncoder(jasonBrookeEncoder);

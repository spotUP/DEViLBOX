/**
 * JankoMrsicFlogelEncoder.ts - Janko Mrsic-Flogel stream encoder. A stream's carrier rows (JankoMrsicFlogelParser.ts)
 * hold its tokens byte-exact in the Rob Hubbard carrier fields (cutoff = byte count, period/pan = the bytes), so encoding
 * is the Rob Hubbard concatenation under its own format id.
 */
import type { TrackerCell } from '@/types';
import { registerVariableEncoder, type VariableLengthEncoder } from '../UADEPatternEncoder';
import { encodeRobHubbardPattern } from './RobHubbardEncoder';

export const jankoMrsicFlogelEncoder: VariableLengthEncoder = {
  formatId: 'jankoMrsicFlogel',
  encodePattern: (rows: TrackerCell[]) => encodeRobHubbardPattern(rows),
};

registerVariableEncoder(jankoMrsicFlogelEncoder);

/**
 * Sean Conran encoder: every file pattern is one command stream of carrier rows (seanConranGrid.ts: cutoff = length,
 * period/pan/resonance/envMod/flag1 = bytes 0..4), so a stream encodes back through the Rob Hubbard carrier encoder.
 */
import type { TrackerCell } from '@/types';
import { registerVariableEncoder, type VariableLengthEncoder } from '../UADEPatternEncoder';
import { encodeRobHubbardPattern } from './RobHubbardEncoder';

export const seanConranEncoder: VariableLengthEncoder = {
  formatId: 'seanConran',
  encodePattern: (rows: TrackerCell[]) => encodeRobHubbardPattern(rows),
};

registerVariableEncoder(seanConranEncoder);
